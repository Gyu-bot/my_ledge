"""Read-only backtest of the month-end net cashflow forecast (T064 audit phase).

For every closed month with enough prior history the live forecast code
(``get_monthly_projection``) is replayed at several in-month as-of days and
compared with the closed-month actuals of the monthly-flow view
(``vw_metric_flow_lines``), per component and for the net total.

    FORECAST_BACKTEST_DATABASE_URL=postgresql+asyncpg://... \\
        uv run python -m app.tools.forecast_backtest --format markdown

Guarantees:

- Read-only. The connection is opened with ``default_transaction_read_only``
  and ``SET TRANSACTION READ ONLY`` (PostgreSQL) or ``PRAGMA query_only``
  (SQLite); the read-only state is verified before any query and every ORM
  flush is refused. Nothing is committed and no temporary objects are created.
- No re-implementation. The forecast itself is the production function called
  with ``reference_date=<as-of>``; that function already reads only
  transactions dated on or before its reference date, the latest loan
  snapshot on or before it, and the latest upload log on or before it. Inputs
  the database cannot reconstruct as of a past date are listed under
  ``limitations`` instead of being silently treated as historical.
- Privacy-safe by default: ratios, counts and directions only. ``--show-amounts``
  adds won amounts per evaluation point. Merchant and category names are never
  printed.
"""

from __future__ import annotations

import argparse
import asyncio
import calendar
import json
import math
import os
import sys
from collections import Counter
from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import date, datetime
from statistics import mean, median
from typing import Any

from sqlalchemy import and_, event, func, or_, select
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan import Loan
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.schemas.income_projection import MonthlyProjection
from app.services.income_expectations_service import get_income_expectations
from app.services.metric_views import EXPENSE, FLOW_LINES_VIEW, flow_summary_columns
from app.services.metrics_service import load_as_of
from app.services.monthly_projection_service import get_monthly_projection

DATABASE_URL_ENV = "FORECAST_BACKTEST_DATABASE_URL"
DEFAULT_AS_OF_DAYS = (5, 10, 15, 20, 25)
REPORT_VERSION = 1

EXPENSE_KINDS = ("loan", "installment", "recurring", "variable")
COMMITMENT_KINDS = ("loan", "installment", "recurring")
COMPONENTS = (
    "income",
    "expense",
    "net",
    "net_after_known_remaining",
    *EXPENSE_KINDS,
)

# Fixed reason templates of monthly_projection_service; matched by substring
# so the merchant prefix of recurring reasons is never copied into a report.
REASON_CODES = (
    ("대출 관련 관측 거래에 계좌 연결이 없어", "loan_observed_without_account_link"),
    ("월상환액을 확인할 수 없는", "loan_monthly_payment_unknown"),
    ("할부 분류 거래에 연결된 상환 일정이 없어", "installment_kind_without_plan_link"),
    ("같은 거래가 대출과 할부에", "loan_installment_link_overlap"),
    ("여러 건이어서", "installment_ambiguous_match"),
    ("예정일이 지난 미연결 할부", "installment_past_due_unlinked"),
    ("반복 지출의 총결제 근거가 없어", "recurring_without_payment_basis"),
    ("충분히 관측된 마감월 3개월이 없어", "variable_insufficient_history"),
    ("정기 수입을 식별할", "income_source_not_identified"),
    ("확인이 필요한 급여 출처", "income_source_needs_review"),
    ("처음 보는 입금처의 급여 입금", "income_source_possible_payer_rename"),
    ("7일 이상 오래되어", "stale_observation"),
)

COMPONENT_LABELS = {
    "income": "수입 (월 전체)",
    "expense": "총지급 (월 전체)",
    "net": "월말 순현금흐름",
    "net_after_known_remaining": "알려진 잔여만 반영한 순현금흐름",
    "loan": "대출 상환",
    "installment": "할부 회차",
    "recurring": "반복 지출",
    "variable": "변동·미분류 지출",
}


class BacktestError(RuntimeError):
    """A safety or configuration problem; the message never contains the URL."""


@dataclass(frozen=True, slots=True)
class BacktestConfig:
    as_of_days: tuple[int, ...] = DEFAULT_AS_OF_DAYS
    min_history_months: int = 3
    show_amounts: bool = False
    from_period: str | None = None
    to_period: str | None = None


@dataclass(slots=True)
class EvaluationPoint:
    period: str
    as_of: date
    day: int
    projection: MonthlyProjection
    forecast: dict[str, int | None]
    remaining: dict[str, int | None]
    observed: dict[str, int]
    actual: dict[str, int]
    month_shares: dict[str, float | None] = field(default_factory=dict)

    @property
    def withheld(self) -> bool:
        return self.projection.projected_month_end_net is None


# --------------------------------------------------------------------------
# Small date helpers.
# --------------------------------------------------------------------------


def _period(value: date) -> str:
    return value.strftime("%Y-%m")


def _month_start(period: str) -> date:
    year, month = (int(part) for part in period.split("-"))
    return date(year, month, 1)


def _month_end(value: date) -> date:
    return value.replace(day=calendar.monthrange(value.year, value.month)[1])


def _add_months(value: date, offset: int) -> date:
    absolute = value.year * 12 + value.month - 1 + offset
    year, month_zero = divmod(absolute, 12)
    return date(year, month_zero + 1, 1)


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


# --------------------------------------------------------------------------
# Read-only session.
# --------------------------------------------------------------------------


def database_url(raw: str) -> URL:
    try:
        url = make_url(raw)
    except Exception as exc:  # noqa: BLE001 - never echo the raw value
        raise BacktestError("database URL could not be parsed") from exc
    backend = url.get_backend_name()
    if backend == "postgresql":
        return url.set(drivername="postgresql+asyncpg")
    if backend == "sqlite":
        return url.set(drivername="sqlite+aiosqlite")
    raise BacktestError("only PostgreSQL or SQLite database URLs are supported")


def _refuse_flush(*_: Any) -> None:
    raise BacktestError("forecast backtest is read-only; an ORM flush was attempted")


@asynccontextmanager
async def read_only_session(raw_url: str) -> AsyncIterator[AsyncSession]:
    """A session on one connection whose transaction is verified read-only.

    The transaction is always rolled back; nothing is ever committed.
    """
    url = database_url(raw_url)
    postgres = url.get_backend_name() == "postgresql"
    connect_args: dict[str, Any] = (
        {
            "server_settings": {
                "default_transaction_read_only": "on",
                "application_name": "my_ledge_forecast_backtest",
            }
        }
        if postgres
        else {}
    )
    engine = create_async_engine(url, poolclass=NullPool, connect_args=connect_args)
    try:
        async with engine.connect() as connection:
            if postgres:
                # One consistent snapshot for the whole replay.
                await connection.exec_driver_sql(
                    "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"
                )
                state = (
                    await connection.exec_driver_sql("SHOW transaction_read_only")
                ).scalar()
                verified = state == "on"
            else:
                await connection.exec_driver_sql("PRAGMA query_only = ON")
                state = (await connection.exec_driver_sql("PRAGMA query_only")).scalar()
                verified = state == 1
            if not verified:
                raise BacktestError("read-only transaction could not be verified")
            session = AsyncSession(
                bind=connection, expire_on_commit=False, autoflush=False
            )
            event.listen(session.sync_session, "before_flush", _refuse_flush)
            try:
                yield session
            finally:
                await session.close()
                await connection.rollback()
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------
# Data collection.
# --------------------------------------------------------------------------


async def _flow_totals(
    session: AsyncSession, start: date, end: date
) -> tuple[dict[str, int], dict[str, int]]:
    """Monthly-flow totals over [start, end] mapped to forecast components."""
    lines = FLOW_LINES_VIEW
    row = (
        (
            await session.execute(
                select(*flow_summary_columns(lines)).where(
                    lines.c.date >= start, lines.c.date <= end
                )
            )
        )
        .mappings()
        .one()
    )
    value = {key: int(row[key] or 0) for key in row.keys()}
    components = {
        "income": value["income_total"],
        "expense": value["total_outflow"],
        "net": value["residual"],
        "net_after_known_remaining": value["residual"],
        "loan": value["committed_loan_total"],
        "installment": value["committed_installment_total"],
        "recurring": value["committed_recurring_total"],
        "variable": value["total_outflow"] - value["committed_total"],
    }
    aux = {
        "undecided": value["adjustability_undecided_total"],
        "committed": value["committed_total"],
    }
    return components, aux


async def _unlinked_commitment_like(
    session: AsyncSession, start: date, end: date
) -> int:
    """Expense that looks like a commitment but has no loan/installment link."""
    lines = FLOW_LINES_VIEW
    condition = and_(
        lines.c.type == EXPENSE,
        lines.c.commitment_kind.is_(None),
        or_(
            lines.c.effective_category_major.like("%대출%"),
            lines.c.effective_category_minor.like("%대출%"),
            lines.c.recurring_payment_kind == "installment",
        ),
        lines.c.date >= start,
        lines.c.date <= end,
    )
    value = await session.scalar(
        select(func.coalesce(func.sum(-lines.c.amount), 0)).where(condition)
    )
    return int(value or 0)


async def evaluation_periods(
    session: AsyncSession, config: BacktestConfig
) -> list[str]:
    as_of = await load_as_of(session)
    if as_of.first_transaction_date is None or as_of.last_closed_period is None:
        return []
    first = as_of.first_transaction_date.replace(day=1)
    current = _add_months(first, config.min_history_months)
    last = _month_start(as_of.last_closed_period)
    periods = []
    while current <= last:
        period = _period(current)
        if (config.from_period is None or period >= config.from_period) and (
            config.to_period is None or period <= config.to_period
        ):
            periods.append(period)
        current = _add_months(current, 1)
    return periods


def _share(numerator: int, denominator: int) -> float | None:
    return numerator / denominator * 100 if denominator > 0 else None


async def collect_points(
    session: AsyncSession, config: BacktestConfig
) -> list[EvaluationPoint]:
    points: list[EvaluationPoint] = []
    for period in await evaluation_periods(session, config):
        start = _month_start(period)
        end = _month_end(start)
        actual, actual_aux = await _flow_totals(session, start, end)
        unlinked = await _unlinked_commitment_like(session, start, end)
        shares = {
            "undecided_share": _share(actual_aux["undecided"], actual["expense"]),
            "unlinked_commitment_like_share": _share(unlinked, actual["expense"]),
            "committed_share": _share(actual_aux["committed"], actual["expense"]),
        }
        for day in config.as_of_days:
            if day > end.day:
                continue
            as_of = start.replace(day=day)
            projection = await get_monthly_projection(session, reference_date=as_of)
            observed, _ = await _flow_totals(session, start, as_of)
            by_kind = {item.kind: item for item in projection.expense_components}
            remaining: dict[str, int | None] = {
                "income": projection.expected_remaining_income,
                "expense": projection.expected_remaining_expense,
                **{kind: by_kind[kind].expected_remaining for kind in EXPENSE_KINDS},
            }
            forecast: dict[str, int | None] = {
                "income": projection.projected_month_income,
                "expense": projection.projected_month_expense,
                "net": projection.projected_month_end_net,
                "net_after_known_remaining": (
                    projection.net_after_known_remaining_expense
                ),
                **{
                    kind: None
                    if remaining[kind] is None
                    else observed[kind] + int(remaining[kind] or 0)
                    for kind in EXPENSE_KINDS
                },
            }
            points.append(
                EvaluationPoint(
                    period=period,
                    as_of=as_of,
                    day=day,
                    projection=projection,
                    forecast=forecast,
                    remaining=remaining,
                    observed=observed,
                    actual=actual,
                    month_shares=dict(shares),
                )
            )
    return points


async def collect_limitations(
    session: AsyncSession, points: list[EvaluationPoint]
) -> list[dict[str, Any]]:
    first_loan_snapshot = await session.scalar(select(func.min(Loan.snapshot_date)))
    without_snapshot = sum(
        1
        for point in points
        if first_loan_snapshot is not None
        and point.as_of < _as_date(first_loan_snapshot)
    )

    async def late_links(model: type) -> tuple[int, int]:
        rows = (
            await session.execute(
                select(model.created_at, Transaction.date).join(
                    Transaction, Transaction.id == model.transaction_id
                )
            )
        ).all()
        late = sum(
            1
            for created_at, transaction_date in rows
            if created_at is not None
            and _as_date(created_at) > _month_end(_as_date(transaction_date))
        )
        return late, len(rows)

    loan_late, loan_total = await late_links(LoanTransactionLink)
    plan_late, plan_total = await late_links(InstallmentTransactionLink)
    plan_statuses = Counter(
        (await session.scalars(select(InstallmentPlan.status))).all()
    )
    settings = await get_income_expectations(session)
    return [
        {
            "code": "classification_current_state",
            "detail": "카테고리 재지정, cost_kind, recurring_payment_kind, 조정 가능성 근거 컬럼은 이력이 없어 현재 값으로 재생했다. 과거 시점에는 아직 분류되지 않았을 수 있다.",
        },
        {
            "code": "transaction_availability",
            "detail": "거래일이 as-of 이하인 거래는 모두 그 시점에 이미 알려졌다고 가정했다(내보내기 지연 미반영). 삭제·병합·대체 상태와 환불 배분도 현재 값이다.",
        },
        {
            "code": "loan_snapshot_unavailable_at_as_of",
            "detail": "전망 코드는 as-of 이전 최신 대출 스냅샷만 읽는다. 그보다 이른 시점은 대출 구성요소가 0으로 재생된다.",
            "points": without_snapshot,
            "of_points": len(points),
        },
        {
            "code": "loan_monthly_payment_current_estimate",
            "detail": "연결 거래로 추정한 월상환액은 연결을 바꿀 때 최신 스냅샷 행에만 기록된다. 과거 스냅샷 행의 월상환액은 비어 있거나 그 당시 값이다.",
        },
        {
            "code": "links_created_after_transaction_month",
            "detail": "대출·할부 연결은 현재 상태로 재생했다. 거래가 속한 달이 끝난 뒤 만들어진 연결 수다(그 달의 실시간 전망에는 없었던 연결).",
            "loan_links": loan_late,
            "loan_links_total": loan_total,
            "installment_links": plan_late,
            "installment_links_total": plan_total,
        },
        {
            "code": "installment_plan_status_current",
            "detail": "전망 코드는 현재 상태가 active인 할부 계획만 읽는다. 완료·취소로 바뀐 계획은 과거 시점 재생에서도 빠진다.",
            "inactive_plans": sum(
                count for status, count in plan_statuses.items() if status != "active"
            ),
            "plans_total": sum(plan_statuses.values()),
        },
        {
            "code": "income_expectation_settings_current",
            "detail": "사용자 예상 수입 설정은 이력이 없어 현재 값을 모든 시점에 적용했다.",
            "items": len(settings.items),
        },
    ]


# --------------------------------------------------------------------------
# Aggregation (privacy-safe).
# --------------------------------------------------------------------------


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


def _stats(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"mean": None, "median": None, "p90": None}
    ordered = sorted(values)
    p90 = ordered[min(len(ordered) - 1, max(math.ceil(0.9 * len(ordered)) - 1, 0))]
    return {
        "mean": _round(mean(ordered)),
        "median": _round(median(ordered)),
        "p90": _round(p90),
    }


def _by_day(
    points: list[EvaluationPoint], days: Iterable[int]
) -> list[tuple[str, list[EvaluationPoint]]]:
    groups = [
        (str(day), [point for point in points if point.day == day]) for day in days
    ]
    return [*groups, ("all", points)]


def _accuracy(
    points: list[EvaluationPoint], component: str, show_amounts: bool
) -> dict[str, Any]:
    evaluated = [point for point in points if point.forecast[component] is not None]
    errors = [
        (int(point.forecast[component] or 0) - point.actual[component], point)
        for point in evaluated
    ]
    pct = [
        error / abs(point.actual[component]) * 100
        for error, point in errors
        if point.actual[component] != 0
    ]
    of_income = [
        error / point.actual["income"] * 100
        for error, point in errors
        if point.actual["income"] > 0
    ]
    result: dict[str, Any] = {
        "points": len(points),
        "withheld": len(points) - len(evaluated),
        "evaluated": len(evaluated),
        "over": sum(1 for error, _ in errors if error > 0),
        "under": sum(1 for error, _ in errors if error < 0),
        "exact": sum(1 for error, _ in errors if error == 0),
        "zero_actual": sum(1 for _, point in errors if point.actual[component] == 0),
        "signed_pct_error": _stats(pct),
        "abs_pct_error": _stats([abs(value) for value in pct]),
        "signed_pct_of_actual_income": _stats(of_income),
        "abs_pct_of_actual_income": _stats([abs(value) for value in of_income]),
    }
    if show_amounts:
        result["signed_error_won"] = _stats([float(error) for error, _ in errors])
    return result


def _reason_codes(projection: MonthlyProjection) -> list[str]:
    codes = []
    for reason in projection.missing_reasons:
        code = next((code for text, code in REASON_CODES if text in reason), "other")
        codes.append(code)
    return sorted(set(codes))


def _pre_payday(points: list[EvaluationPoint]) -> dict[str, Any]:
    pending = [
        point
        for point in points
        if point.actual["income"] > 0
        and point.actual["income"] - point.observed["income"]
        >= point.actual["income"] * 0.5
    ]
    statuses = Counter(
        source.status for point in pending for source in point.projection.income_sources
    )
    coverage = [
        point.projection.expected_remaining_income
        / (point.actual["income"] - point.observed["income"])
        * 100
        for point in pending
    ]
    errors = [
        (point.projection.projected_month_income - point.actual["income"])
        / point.actual["income"]
        * 100
        for point in pending
    ]
    return {
        "points": len(pending),
        "forecast_includes_regular_income": sum(
            1 for point in pending if point.projection.expected_remaining_income > 0
        ),
        "no_income_source_identified": sum(
            1 for point in pending if not point.projection.income_sources
        ),
        "income_source_status_counts": dict(sorted(statuses.items())),
        "expected_remaining_income_pct_of_actual_remaining": _stats(coverage),
        "income_signed_pct_error": _stats(errors),
    }


def _double_counting(points: list[EvaluationPoint], kind: str) -> dict[str, Any]:
    available = [point for point in points if point.remaining[kind] is not None]
    suspected = 0
    over = 0
    without_ledger_rows = 0
    excess: list[float] = []
    for point in available:
        forecast_remaining = int(point.remaining[kind] or 0)
        actual_remaining = point.actual[kind] - point.observed[kind]
        if (
            point.observed[kind] > 0
            and forecast_remaining > 0
            and actual_remaining <= 0
        ):
            suspected += 1
        if forecast_remaining > 0 and point.actual[kind] == 0:
            without_ledger_rows += 1
        if forecast_remaining > actual_remaining:
            over += 1
            if point.actual["expense"] > 0:
                excess.append(
                    (forecast_remaining - actual_remaining)
                    / point.actual["expense"]
                    * 100
                )
    return {
        "points": len(points),
        "unavailable": len(points) - len(available),
        "observed_then_added_again": suspected,
        "remaining_over_forecast": over,
        "remaining_without_any_linked_actual_in_month": without_ledger_rows,
        "excess_pct_of_month_expense": _stats(excess),
    }


def _bucket(value: float | None, edges: tuple[tuple[str, float], ...]) -> str:
    if value is None:
        return "no_expense"
    for label, upper in edges:
        if value < upper:
            return label
    return edges[-1][0]


UNDECIDED_BUCKETS = (("<10%", 10.0), ("10-30%", 30.0), (">=30%", math.inf))
UNLINKED_BUCKETS = (("0%", 1e-9), (">0%", math.inf))


def _classification_bias(points: list[EvaluationPoint]) -> dict[str, Any]:
    def bucket_summary(key: str, edges: tuple[tuple[str, float], ...]) -> dict:
        result: dict[str, Any] = {}
        for label in [label for label, _ in edges] + ["no_expense"]:
            members = [
                point
                for point in points
                if _bucket(point.month_shares.get(key), edges) == label
            ]
            if not members:
                continue
            result[label] = {
                "points": len(members),
                "net_withheld": sum(1 for point in members if point.withheld),
                "expense_signed_pct_of_actual_income": _accuracy(
                    members, "expense", False
                )["signed_pct_of_actual_income"],
                "net_signed_pct_of_actual_income": _accuracy(members, "net", False)[
                    "signed_pct_of_actual_income"
                ],
                "net_after_known_remaining_signed_pct_of_actual_income": _accuracy(
                    members, "net_after_known_remaining", False
                )["signed_pct_of_actual_income"],
            }
        return result

    def share_values(key: str) -> list[float]:
        seen: dict[str, float] = {}
        for point in points:
            value = point.month_shares.get(key)
            if value is not None:
                seen[point.period] = value
        return list(seen.values())

    variable_share = [
        int(point.remaining["variable"] or 0)
        / int(point.remaining["expense"] or 0)
        * 100
        for point in points
        if point.remaining["expense"] and point.remaining["variable"] is not None
    ]
    return {
        "note": "전망 코드는 조정 가능성을 읽지 않는다. 약정 구분은 대출·할부 연결, 할부 계획 일치, 거래처 단위 cost_kind/recurring_payment_kind로 한다.",
        "month_undecided_adjustability_share_pct": _stats(
            share_values("undecided_share")
        ),
        "month_unlinked_commitment_like_share_pct": _stats(
            share_values("unlinked_commitment_like_share")
        ),
        "month_committed_share_pct": _stats(share_values("committed_share")),
        "variable_share_of_forecast_remaining_expense_pct": _stats(variable_share),
        "by_undecided_share": bucket_summary("undecided_share", UNDECIDED_BUCKETS),
        "by_unlinked_commitment_like_share": bucket_summary(
            "unlinked_commitment_like_share", UNLINKED_BUCKETS
        ),
    }


def summarize(
    points: list[EvaluationPoint],
    config: BacktestConfig,
    limitations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    periods = sorted({point.period for point in points})
    groups = _by_day(points, config.as_of_days)
    consistency = sum(
        1
        for point in points
        if point.projection.observed_income != point.observed["income"]
        or point.projection.observed_net_expense != point.observed["expense"]
    )
    report: dict[str, Any] = {
        "tool": "forecast_backtest",
        "version": REPORT_VERSION,
        "config": {
            "as_of_days": list(config.as_of_days),
            "min_history_months": config.min_history_months,
            "show_amounts": config.show_amounts,
        },
        "evaluated": {
            "months": len(periods),
            "points": len(points),
            "first_period": periods[0] if periods else None,
            "last_period": periods[-1] if periods else None,
        },
        "definitions": {
            "forecast": "get_monthly_projection(reference_date=as-of) 그대로. 구성요소별 월 전망 = as-of까지 흐름표 관측 + 전망의 남은 기간 가정.",
            "actual": "마감월의 vw_metric_flow_lines 합계. loan/installment/recurring = committed_* 줄, variable = 총지급 - 약정 지급, net = 잔여.",
            "signed_pct_error": "(전망 - 실제) / |실제| x 100. 양수 = 과대 전망. 실제가 0인 점은 zero_actual로만 센다.",
            "signed_pct_of_actual_income": "(전망 - 실제) / 그 달 실제 수입 x 100. 순현금흐름처럼 실제가 0에 가까운 값을 위한 척도.",
            "withheld": "전망 값이 None(입력 부족·확인 필요로 전망 보류)인 점.",
        },
        "accuracy": {
            component: {
                label: _accuracy(group, component, config.show_amounts)
                for label, group in groups
            }
            for component in COMPONENTS
        },
        "withheld_reasons": {
            label: dict(
                sorted(
                    Counter(
                        code
                        for point in group
                        if point.withheld
                        for code in _reason_codes(point.projection)
                    ).items()
                )
            )
            for label, group in groups
        },
        "special_cases": {
            "pre_payday_income": {
                "definition": "그 달 실제 수입의 50% 이상이 as-of 뒤에 들어온 점.",
                **{label: _pre_payday(group) for label, group in groups},
            },
            "double_counting": {
                "definition": "observed_then_added_again = as-of까지 같은 약정 줄이 관측됐고 전망이 남은 금액을 더했는데 실제로는 as-of 뒤에 그 줄이 더 없었던 점. remaining_without_any_linked_actual_in_month = 전망이 남은 금액을 더했지만 그 달 흐름표에 연결된 실제가 전혀 없는 점(미연결·이체 기록 등).",
                **{
                    kind: {
                        label: _double_counting(group, kind) for label, group in groups
                    }
                    for kind in COMMITMENT_KINDS
                },
            },
            "classification_bias": _classification_bias(points),
        },
        "consistency": {
            "observed_mismatch_points": consistency,
            "detail": "전망 응답의 관측 수입·지출과 흐름표 as-of 합계가 다른 점의 수. 0이어야 한다.",
        },
        "limitations": limitations or [],
    }
    if config.show_amounts:
        report["points"] = [
            {
                "period": point.period,
                "as_of": point.as_of.isoformat(),
                "withheld": point.withheld,
                "reason_codes": _reason_codes(point.projection),
                "forecast": point.forecast,
                "remaining": point.remaining,
                "observed": point.observed,
                "actual": point.actual,
            }
            for point in points
        ]
    return report


async def run_backtest(session: AsyncSession, config: BacktestConfig) -> dict[str, Any]:
    points = await collect_points(session, config)
    limitations = await collect_limitations(session, points)
    return summarize(points, config, limitations)


# --------------------------------------------------------------------------
# Rendering.
# --------------------------------------------------------------------------


def _fmt(value: Any) -> str:
    """Counts and unsigned ratios (absolute errors, shares)."""
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:.1f}"
    return str(value)


def _signed(value: float | None) -> str:
    """Signed errors: + means the forecast was above the actual."""
    if value is None:
        return "-"
    return f"{value:+.1f}" if value else "0.0"


def render_markdown(report: dict[str, Any]) -> str:
    config = report["config"]
    evaluated = report["evaluated"]
    days = [str(day) for day in config["as_of_days"]] + ["all"]
    lines = [
        "# 월말 순현금흐름 전망 되짚기 결과",
        "",
        f"- 평가한 마감월: {evaluated['months']}개 ({evaluated['first_period'] or '-'} ~ {evaluated['last_period'] or '-'})",
        f"- 평가 시점: 매월 {', '.join(str(day) for day in config['as_of_days'])}일, 총 {evaluated['points']}점",
        f"- 금액 표시: {'예 (--show-amounts)' if config['show_amounts'] else '아니오 (비율·건수만)'}",
        "",
        "## 정의",
        "",
    ]
    lines += [f"- `{key}`: {text}" for key, text in report["definitions"].items()]
    lines += ["", "## 구성요소별 오차", ""]
    for component, by_day in report["accuracy"].items():
        lines += [
            f"### {COMPONENT_LABELS[component]} (`{component}`)",
            "",
            "| as-of 일 | 점 | 보류 | 과대 | 과소 | 일치 | 실제 0 | 부호 오차 중앙값 % | 절대 오차 중앙값 % | 절대 오차 p90 % | 수입 대비 부호 오차 중앙값 % |",
            "|---|---|---|---|---|---|---|---|---|---|---|",
        ]
        for day in days:
            item = by_day[day]
            lines.append(
                "| "
                + " | ".join(
                    [
                        day,
                        _fmt(item["points"]),
                        _fmt(item["withheld"]),
                        _fmt(item["over"]),
                        _fmt(item["under"]),
                        _fmt(item["exact"]),
                        _fmt(item["zero_actual"]),
                        _signed(item["signed_pct_error"]["median"]),
                        _fmt(item["abs_pct_error"]["median"]),
                        _fmt(item["abs_pct_error"]["p90"]),
                        _signed(item["signed_pct_of_actual_income"]["median"]),
                    ]
                )
                + " |"
            )
        lines.append("")
    lines += ["## 전망 보류 사유 (보류된 점 기준 건수)", ""]
    for day in days:
        reasons = report["withheld_reasons"][day]
        text = ", ".join(f"`{code}` {count}" for code, count in reasons.items()) or "-"
        lines.append(f"- {day}: {text}")
    special = report["special_cases"]
    pre = special["pre_payday_income"]
    lines += [
        "",
        "## (a) 급여일 전 정기 수입 반영",
        "",
        f"정의: {pre['definition']}",
        "",
        "| as-of 일 | 점 | 정기 수입 포함 | 수입원 없음 | 남은 수입 전망/실제 중앙값 % | 수입 부호 오차 중앙값 % | 수입원 상태 |",
        "|---|---|---|---|---|---|---|",
    ]
    for day in days:
        item = pre[day]
        statuses = ", ".join(
            f"{key} {value}"
            for key, value in item["income_source_status_counts"].items()
        )
        lines.append(
            f"| {day} | {item['points']} | {item['forecast_includes_regular_income']} | "
            f"{item['no_income_source_identified']} | "
            f"{_fmt(item['expected_remaining_income_pct_of_actual_remaining']['median'])} | "
            f"{_signed(item['income_signed_pct_error']['median'])} | {statuses or '-'} |"
        )
    double = special["double_counting"]
    lines += [
        "",
        "## (b) 관측된 약정의 재가산",
        "",
        f"정의: {double['definition']}",
        "",
        "| 구성 | as-of 일 | 점 | 계산 불가 | 관측 후 재가산 | 남은 금액 과대 | 연결된 실제 없이 가산 | 초과분/월 지출 중앙값 % |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for kind in COMMITMENT_KINDS:
        for day in days:
            item = double[kind][day]
            lines.append(
                f"| {kind} | {day} | {item['points']} | {item['unavailable']} | "
                f"{item['observed_then_added_again']} | {item['remaining_over_forecast']} | "
                f"{item['remaining_without_any_linked_actual_in_month']} | "
                f"{_fmt(item['excess_pct_of_month_expense']['median'])} |"
            )
    bias = special["classification_bias"]
    lines += [
        "",
        "## (c) 조정 가능성·약정 연결이 비어 있을 때의 치우침",
        "",
        bias["note"],
        "",
        f"- 월 지출 중 조정 가능성 미정 비중 중앙값: {_fmt(bias['month_undecided_adjustability_share_pct']['median'])}%",
        f"- 월 지출 중 약정처럼 보이나 미연결인 비중 중앙값: {_fmt(bias['month_unlinked_commitment_like_share_pct']['median'])}%",
        f"- 월 지출 중 약정 지급 비중 중앙값: {_fmt(bias['month_committed_share_pct']['median'])}%",
        f"- 전망의 남은 지출 중 변동·미분류 가정 비중 중앙값: {_fmt(bias['variable_share_of_forecast_remaining_expense_pct']['median'])}%",
        "",
        "| 구분 | 구간 | 점 | 순현금흐름 보류 | 지출 부호 오차/수입 중앙값 % | 순현금흐름 부호 오차/수입 중앙값 % | 알려진 잔여 순현금흐름 부호 오차/수입 중앙값 % |",
        "|---|---|---|---|---|---|---|",
    ]
    for name, key in (
        ("미정 비중", "by_undecided_share"),
        ("미연결 약정형 비중", "by_unlinked_commitment_like_share"),
    ):
        for label, item in bias[key].items():
            lines.append(
                f"| {name} | {label} | {item['points']} | {item['net_withheld']} | "
                f"{_signed(item['expense_signed_pct_of_actual_income']['median'])} | "
                f"{_signed(item['net_signed_pct_of_actual_income']['median'])} | "
                f"{_signed(item['net_after_known_remaining_signed_pct_of_actual_income']['median'])} |"
            )
    lines += [
        "",
        "## 정합성",
        "",
        f"- 관측값 불일치 점: {report['consistency']['observed_mismatch_points']} ({report['consistency']['detail']})",
        "",
        "## 재생의 한계",
        "",
    ]
    for item in report["limitations"]:
        counts = ", ".join(
            f"{key}={value}"
            for key, value in item.items()
            if key not in {"code", "detail"}
        )
        lines.append(
            f"- `{item['code']}`: {item['detail']}" + (f" ({counts})" if counts else "")
        )
    if config["show_amounts"]:
        lines += [
            "",
            "## 시점별 금액 (--show-amounts)",
            "",
            "| 월 | as-of | 보류 | 전망 순현금흐름 | 실제 순현금흐름 | 전망 수입 | 실제 수입 | 전망 지출 | 실제 지출 |",
            "|---|---|---|---|---|---|---|---|---|",
        ]
        for point in report.get("points", []):
            lines.append(
                f"| {point['period']} | {point['as_of']} | {point['withheld']} | "
                f"{_fmt(point['forecast']['net'])} | {_fmt(point['actual']['net'])} | "
                f"{_fmt(point['forecast']['income'])} | {_fmt(point['actual']['income'])} | "
                f"{_fmt(point['forecast']['expense'])} | {_fmt(point['actual']['expense'])} |"
            )
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------
# CLI.
# --------------------------------------------------------------------------


def _days(value: str) -> tuple[int, ...]:
    try:
        days = tuple(sorted({int(part) for part in value.split(",") if part.strip()}))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "days must be comma-separated integers"
        ) from exc
    if not days or any(day < 1 or day > 28 for day in days):
        raise argparse.ArgumentTypeError("days must be between 1 and 28")
    return days


def _period_arg(value: str) -> str:
    try:
        _month_start(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("period must be YYYY-MM") from exc
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.tools.forecast_backtest",
        description=(
            "Read-only backtest of the month-end net cashflow forecast. "
            f"Reads the database URL from ${DATABASE_URL_ENV}."
        ),
    )
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    parser.add_argument(
        "--days",
        type=_days,
        default=DEFAULT_AS_OF_DAYS,
        help="comma-separated as-of days of month (1-28), default 5,10,15,20,25",
    )
    parser.add_argument(
        "--min-history-months",
        type=int,
        default=3,
        help="months of data required before a month is evaluated (default 3)",
    )
    parser.add_argument("--from-period", type=_period_arg, default=None)
    parser.add_argument("--to-period", type=_period_arg, default=None)
    parser.add_argument(
        "--show-amounts",
        action="store_true",
        help="include won amounts per evaluation point (never names)",
    )
    parser.add_argument(
        "--output", default=None, help="write the report to this file instead of stdout"
    )
    return parser


async def _run(raw_url: str, config: BacktestConfig) -> dict[str, Any]:
    async with read_only_session(raw_url) as session:
        return await run_backtest(session, config)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    raw_url = os.environ.get(DATABASE_URL_ENV)
    if not raw_url:
        print(f"{DATABASE_URL_ENV} is not set", file=sys.stderr)
        return 2
    if args.min_history_months < 0:
        print("--min-history-months must be >= 0", file=sys.stderr)
        return 2
    config = BacktestConfig(
        as_of_days=args.days,
        min_history_months=args.min_history_months,
        show_amounts=args.show_amounts,
        from_period=args.from_period,
        to_period=args.to_period,
    )
    try:
        report = asyncio.run(_run(raw_url, config))
    except BacktestError as exc:
        print(f"forecast backtest aborted: {exc}", file=sys.stderr)
        return 1
    rendered = (
        json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.format == "json"
        else render_markdown(report)
    )
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(rendered)
    else:
        sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
