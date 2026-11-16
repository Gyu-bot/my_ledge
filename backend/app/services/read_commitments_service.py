"""Commitments list for the agent read surface (T060, Q4).

Loans, installment plans, and recurring-payment bundles in one list with the
recorded attributes (monthly burden, cycle, end, remaining count,
adjustability) and, for one period, an observation state. This describes the
record; it does not forecast and never says a payment was missed.

Observed amounts come from ``vw_metric_flow_lines`` (the same lines as the
monthly flow's committed rows), so the per-commitment amounts of a period add
up to the period's ``committed_total``.
"""

import calendar
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.loan import Loan
from app.models.nature_axes import RecurringCommitment
from app.schemas.metrics import MetricAsOf
from app.schemas.metrics import MONTH_DATA_COVERAGE_RULE
from app.schemas.read_surface import (
    ADJUSTABILITY_LABELS,
    COMMITMENT_KIND_LABELS,
    CYCLE_LABELS,
    END_DATE_STATUS_LABELS,
    LIFECYCLE_LABELS,
    MONTHLY_BURDEN_ORIGIN_LABELS,
    MONTHLY_BURDEN_BASIS_LABELS,
    OBSERVATION_REASON_LABELS,
    OBSERVATION_STATE_LABELS,
    STATUS_LABELS,
    CommitmentItem,
    CommitmentObservation,
    CommitmentSummaryItem,
    ReadBasis,
    ReadCommitmentsData,
    ReadCommitmentsResponse,
    ReadPeriodScope,
)
from app.services.installment_service import _add_months as add_months
from app.services.loan_mapping_service import list_loan_accounts
from app.services.metric_views import (
    EXPENSE,
    FLOW_LINES_VIEW,
    METRIC_TRANSACTIONS_VIEW,
    MONTHLY_FLOW_SUMMARY_VIEW,
)
from app.services.metrics_service import load_as_of
from app.services.read_surface_service import (
    _reason,
    build_period_scope,
    common_labels,
    load_period_summaries,
    period_of,
    read_as_of,
    resolve_status,
)

MAX_IDS = 20
_LOAN_ACTIVE = {"active"}
_LOAN_ENDED = {
    "matured",
    "matured_and_missing_from_latest_snapshot",
    "past_maturity_with_last_observed_balance",
}

KeyTuple = tuple[str, int]


def default_period(as_of: MetricAsOf) -> str | None:
    return as_of.last_closed_period or as_of.in_progress_period


def _period_bounds(period: str) -> tuple[date, date]:
    start = date.fromisoformat(f"{period}-01")
    last_day = calendar.monthrange(start.year, start.month)[1]
    return start, start.replace(day=last_day)


def _won(value: Decimal | int | None) -> int | None:
    if value is None:
        return None
    return int(Decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _key_column():
    lines = FLOW_LINES_VIEW
    return (
        lines.c.commitment_kind,
        func.coalesce(
            lines.c.loan_account_id,
            lines.c.installment_plan_id,
            lines.c.recurring_commitment_id,
        ).label("source_id"),
    )


async def _period_observations(
    db_session: AsyncSession, period: str
) -> tuple[dict[KeyTuple, tuple[int, int]], dict[KeyTuple, list[int]]]:
    lines = FLOW_LINES_VIEW
    kind, source_id = _key_column()
    where = (
        lines.c.type == EXPENSE,
        lines.c.commitment_kind.is_not(None),
        lines.c.period == period,
    )
    totals = {
        (row.commitment_kind, int(row.source_id)): (
            int(row.amount or 0),
            int(row.transaction_count or 0),
        )
        for row in await db_session.execute(
            select(
                kind,
                source_id,
                func.coalesce(func.sum(-lines.c.amount), 0).label("amount"),
                func.count(lines.c.transaction_id.distinct()).label(
                    "transaction_count"
                ),
            )
            .where(*where)
            .group_by(kind, source_id)
        )
    }
    ids: dict[KeyTuple, list[int]] = {}
    for row in await db_session.execute(
        select(kind, source_id, lines.c.transaction_id)
        .where(*where)
        .distinct()
        .order_by(kind, source_id, lines.c.transaction_id)
    ):
        bucket = ids.setdefault((row.commitment_kind, int(row.source_id)), [])
        if len(bucket) < MAX_IDS:
            bucket.append(int(row.transaction_id))
    return totals, ids


async def _history(
    db_session: AsyncSession, as_of: MetricAsOf
) -> tuple[dict[KeyTuple, dict[str, object]], dict[KeyTuple, tuple[str, int]]]:
    """All-time member stats and the last closed month with an observation."""
    lines = FLOW_LINES_VIEW
    kind, source_id = _key_column()
    stats = {
        (row.commitment_kind, int(row.source_id)): {
            "count": int(row.transaction_count or 0),
            "first_date": row.first_date,
            "last_date": row.last_date,
        }
        for row in await db_session.execute(
            select(
                kind,
                source_id,
                func.count(lines.c.transaction_id.distinct()).label(
                    "transaction_count"
                ),
                func.min(lines.c.date).label("first_date"),
                func.max(lines.c.date).label("last_date"),
            )
            .where(lines.c.type == EXPENSE, lines.c.commitment_kind.is_not(None))
            .group_by(kind, source_id)
        )
    }
    last_observed: dict[KeyTuple, tuple[str, int]] = {}
    if as_of.last_closed_period is not None:
        for row in await db_session.execute(
            select(
                kind,
                source_id,
                lines.c.period,
                func.coalesce(func.sum(-lines.c.amount), 0).label("amount"),
            )
            .where(
                lines.c.type == EXPENSE,
                lines.c.commitment_kind.is_not(None),
                lines.c.period <= as_of.last_closed_period,
            )
            .group_by(kind, source_id, lines.c.period)
            .order_by(lines.c.period.asc())
        ):
            # Ascending periods: the last write per key is the latest month.
            last_observed[(row.commitment_kind, int(row.source_id))] = (
                row.period,
                int(row.amount or 0),
            )
    return stats, last_observed


def _as_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _observation(
    *,
    period: str | None,
    state: str,
    reason: str,
    totals: tuple[int, int],
    ids: list[int],
) -> CommitmentObservation:
    return CommitmentObservation(
        period=period or "",
        state=state,  # type: ignore[arg-type]
        state_label=OBSERVATION_STATE_LABELS[state],
        reason=reason,  # type: ignore[arg-type]
        reason_label=OBSERVATION_REASON_LABELS[reason],
        observed_amount=totals[0],
        observed_transaction_count=totals[1],
        transaction_ids=ids,
    )


class _Context:
    def __init__(
        self,
        *,
        period: str | None,
        imported: bool,
        missing_reason: str,
        in_progress: bool,
        totals: dict[KeyTuple, tuple[int, int]],
        ids: dict[KeyTuple, list[int]],
    ) -> None:
        self.period = period
        self.imported = imported
        self.missing_reason = missing_reason
        self.in_progress = in_progress
        self.totals = totals
        self.ids = ids
        if period is not None:
            self.start, self.end = _period_bounds(period)

    def observed(self, key: KeyTuple) -> tuple[int, int]:
        return self.totals.get(key, (0, 0))

    def has_observation(self, key: KeyTuple) -> bool:
        return self.observed(key)[1] > 0

    def make(
        self, key: KeyTuple, state: str, reason: str, ids: list[int] | None = None
    ):
        return _observation(
            period=self.period,
            state=state,
            reason=reason,
            totals=self.observed(key),
            ids=self.ids.get(key, []) if ids is None else ids,
        )


async def _latest_loan_payments(
    db_session: AsyncSession,
) -> dict[tuple[str, str], tuple[Decimal | None, str | None]]:
    latest = (
        select(
            Loan.lender,
            Loan.product_name,
            func.max(Loan.snapshot_date).label("snapshot_date"),
        )
        .group_by(Loan.lender, Loan.product_name)
        .subquery()
    )
    rows = await db_session.execute(
        select(
            Loan.lender,
            Loan.product_name,
            Loan.monthly_payment,
            Loan.monthly_payment_source,
        ).join(
            latest,
            (Loan.lender == latest.c.lender)
            & (Loan.product_name == latest.c.product_name)
            & (Loan.snapshot_date == latest.c.snapshot_date),
        )
    )
    return {
        (row.lender, row.product_name): (
            row.monthly_payment,
            row.monthly_payment_source,
        )
        for row in rows
    }


PROTECTED_BASIS = "대출·할부는 끝날 때까지 보호로 고정한다(2.2)."


def _end_date_fields(status: str, reason: str) -> dict[str, str]:
    return {
        "end_date_status": status,
        "end_date_status_label": END_DATE_STATUS_LABELS[status],
        "end_date_reason": reason,
    }


def _burden_origin_fields(origin: str) -> dict[str, str]:
    return {
        "monthly_burden_origin": origin,
        "monthly_burden_origin_label": MONTHLY_BURDEN_ORIGIN_LABELS[origin],
    }


def _loan_burden_origin(monthly: int | None, source: str | None) -> str:
    if monthly is None:
        return "not_available"
    if source == "manual":
        return "entered_by_person"
    if source == "estimated_from_linked_transactions":
        return "estimated_from_linked_transactions"
    return "source_not_recorded"


def _recurring_end_date(commitment: RecurringCommitment) -> dict[str, str]:
    if commitment.end_date is not None:
        return _end_date_fields("recorded", "사람이 기록한 묶음 종료일")
    if commitment.cycle == "n_times":
        if commitment.total_count is not None:
            return _end_date_fields(
                "not_applicable",
                "회차 약정은 날짜가 아니라 총 횟수(total_count)로 끝난다. 종료일은 "
                "기록되지 않았고 추정하지 않는다.",
            )
        return _end_date_fields(
            "not_recorded", "회차 약정인데 종료일도 총 횟수도 기록되지 않음"
        )
    return _end_date_fields(
        "open_ended",
        "정기 지급 묶음은 사람이 종료일을 기록하기 전까지 끝이 정해지지 않는다.",
    )


async def _loan_items(
    db_session: AsyncSession,
    ctx: _Context,
    stats: dict[KeyTuple, dict[str, object]],
    last_observed: dict[KeyTuple, tuple[str, int]],
) -> list[CommitmentItem]:
    accounts = (await list_loan_accounts(db_session, include_hidden=True)).items
    payments = await _latest_loan_payments(db_session)
    items: list[CommitmentItem] = []
    for index, account in enumerate(accounts):
        key: KeyTuple = ("loan", account.loan_account_id or -1)
        if account.is_hidden and not ctx.has_observation(key):
            continue
        payment, payment_source = payments.get(
            (account.lender, account.product_name), (None, None)
        )
        monthly = _won(payment)
        if monthly is not None and monthly <= 0:
            monthly = None
        lifecycle = (
            "active"
            if account.lifecycle_status in _LOAN_ACTIVE
            else "ended"
            if account.lifecycle_status in _LOAN_ENDED
            else "unknown"
        )
        cycle = "monthly" if monthly is not None else None
        start, maturity = account.loan_start_date, account.loan_maturity_date
        if ctx.period is None:
            observation = ctx.make(key, "not_determinable", ctx.missing_reason)
        elif ctx.has_observation(key):
            observation = ctx.make(key, "observed", "linked_transactions_in_period")
        elif not ctx.imported:
            observation = ctx.make(key, "not_determinable", ctx.missing_reason)
        elif (maturity is not None and maturity < ctx.start) or (
            start is not None and start > ctx.end
        ):
            observation = ctx.make(key, "not_expected", "outside_commitment_dates")
        elif cycle is None:
            observation = ctx.make(key, "not_determinable", "cycle_not_recorded")
        elif ctx.in_progress:
            observation = ctx.make(
                key, "not_determinable", "in_progress_month_not_yet_observed"
            )
        else:
            observation = ctx.make(
                key, "expected_not_observed", "no_linked_repayment_in_month"
            )
        member = stats.get(key, {})
        last = last_observed.get(key)
        items.append(
            CommitmentItem(
                commitment_key=(
                    f"loan:{account.loan_account_id}"
                    if account.loan_account_id is not None
                    else f"loan:snapshot-only:{index}"
                ),
                kind="loan",
                kind_label=COMMITMENT_KIND_LABELS["loan"],
                source_id=account.loan_account_id,
                name=account.display_name,
                lifecycle=lifecycle,  # type: ignore[arg-type]
                lifecycle_label=LIFECYCLE_LABELS[lifecycle],
                lifecycle_detail=account.lifecycle_status,
                cycle=cycle,  # type: ignore[arg-type]
                cycle_label=CYCLE_LABELS[cycle] if cycle else "주기 미기록",
                monthly_burden=monthly,
                monthly_burden_basis=(
                    "recorded_monthly_payment"
                    if monthly is not None
                    else "not_available"
                ),
                monthly_burden_basis_label=MONTHLY_BURDEN_BASIS_LABELS[
                    "recorded_monthly_payment"
                    if monthly is not None
                    else "not_available"
                ],
                monthly_burden_source=payment_source,
                **_burden_origin_fields(_loan_burden_origin(monthly, payment_source)),
                start_date=start,
                end_date=maturity,
                **(
                    _end_date_fields("recorded", "대출 스냅샷·계좌에 기록된 만기일")
                    if maturity is not None
                    else _end_date_fields(
                        "not_recorded",
                        "대출 만기일이 기록되지 않음. 서버는 만기를 추정하지 않는다.",
                    )
                ),
                linked_count=int(member.get("count", 0)) or None,  # type: ignore[call-overload]
                adjustability="protected",
                adjustability_label=ADJUSTABILITY_LABELS["protected"],
                adjustability_basis=PROTECTED_BASIS,
                last_observed_period=last[0] if last else None,
                last_observed_amount=last[1] if last else None,
                observation=observation,
            )
        )
    return items


async def _installment_links(
    db_session: AsyncSession,
) -> dict[int, dict[int, int]]:
    """plan id -> installment number -> effective transaction id."""
    tx = METRIC_TRANSACTIONS_VIEW
    links: dict[int, dict[int, int]] = {}
    for row in await db_session.execute(
        select(tx.c.installment_plan_id, tx.c.installment_number, tx.c.id).where(
            tx.c.installment_plan_id.is_not(None)
        )
    ):
        links.setdefault(int(row.installment_plan_id), {})[
            int(row.installment_number)
        ] = int(row.id)
    return links


async def _flagged_unlinked(
    db_session: AsyncSession, period: str | None
) -> dict[str, list[int]]:
    """Merchant -> unlinked transactions a person marked as installment."""
    if period is None:
        return {}
    lines = FLOW_LINES_VIEW
    flagged: dict[str, list[int]] = {}
    for row in await db_session.execute(
        select(lines.c.merchant, lines.c.transaction_id)
        .where(
            lines.c.type == EXPENSE,
            lines.c.period == period,
            lines.c.mapping_note == "installment_link_unconfirmed",
        )
        .distinct()
        .order_by(lines.c.merchant, lines.c.transaction_id)
    ):
        flagged.setdefault(row.merchant or "", []).append(int(row.transaction_id))
    return flagged


async def _installment_items(
    db_session: AsyncSession,
    ctx: _Context,
    as_of: MetricAsOf,
    last_observed: dict[KeyTuple, tuple[str, int]],
) -> list[CommitmentItem]:
    plans = (
        (await db_session.execute(select(InstallmentPlan).order_by(InstallmentPlan.id)))
        .scalars()
        .all()
    )
    links = await _installment_links(db_session)
    flagged = await _flagged_unlinked(db_session, ctx.period)
    items: list[CommitmentItem] = []
    for plan in plans:
        key: KeyTuple = ("installment", plan.id)
        due_dates = [
            add_months(plan.first_payment_date, number - 1)
            for number in range(1, plan.total_installments + 1)
        ]
        plan_links = links.get(plan.id, {})
        due_numbers = [
            number
            for number, due in enumerate(due_dates, start=1)
            if ctx.period is not None and period_of(due) == ctx.period
        ]
        linked_due = [plan_links[n] for n in due_numbers if n in plan_links]
        inactive = plan.status != "active"
        if ctx.period is None or (not ctx.imported and not ctx.has_observation(key)):
            observation = ctx.make(key, "not_determinable", ctx.missing_reason)
        elif ctx.has_observation(key):
            observation = ctx.make(key, "observed", "linked_transactions_in_period")
        elif linked_due:
            observation = ctx.make(
                key, "observed", "linked_transactions_in_period", ids=linked_due
            )
        elif not due_numbers:
            observation = ctx.make(key, "not_expected", "outside_commitment_dates")
        elif flagged.get(plan.merchant):
            observation = ctx.make(
                key,
                "unlinked_transaction_present",
                "flagged_unlinked_installment_transaction",
                ids=flagged[plan.merchant][:MAX_IDS],
            )
        elif inactive:
            observation = ctx.make(key, "not_expected", "commitment_inactive")
        elif ctx.in_progress:
            observation = ctx.make(
                key, "not_determinable", "in_progress_month_not_yet_observed"
            )
        else:
            observation = ctx.make(
                key,
                "expected_not_observed",
                "no_linked_transaction_for_due_installment",
            )
        remaining = (
            sum(1 for due in due_dates if due > as_of.transaction_as_of)
            if as_of.transaction_as_of is not None
            else None
        )
        last = last_observed.get(key)
        lifecycle = "active" if plan.status == "active" else "ended"
        items.append(
            CommitmentItem(
                commitment_key=f"installment:{plan.id}",
                kind="installment",
                kind_label=COMMITMENT_KIND_LABELS["installment"],
                source_id=plan.id,
                name=plan.display_name,
                lifecycle=lifecycle,  # type: ignore[arg-type]
                lifecycle_label=LIFECYCLE_LABELS[lifecycle],
                lifecycle_detail=plan.status,
                cycle="monthly",
                cycle_label=CYCLE_LABELS["monthly"],
                monthly_burden=plan.monthly_amount,
                monthly_burden_basis="plan_monthly_amount",
                monthly_burden_basis_label=MONTHLY_BURDEN_BASIS_LABELS[
                    "plan_monthly_amount"
                ],
                **_burden_origin_fields("installment_plan_record"),
                start_date=plan.first_payment_date,
                end_date=due_dates[-1] if due_dates else None,
                **(
                    _end_date_fields(
                        "recorded",
                        "할부 계획의 첫 결제일과 총 회차로 정해지는 마지막 회차 예정일",
                    )
                    if due_dates
                    else _end_date_fields(
                        "not_recorded", "할부 계획에 회차가 기록되지 않음"
                    )
                ),
                total_count=plan.total_installments,
                remaining_count=remaining,
                linked_count=len(plan_links),
                adjustability="protected",
                adjustability_label=ADJUSTABILITY_LABELS["protected"],
                adjustability_basis=PROTECTED_BASIS,
                last_observed_period=last[0] if last else None,
                last_observed_amount=last[1] if last else None,
                observation=observation,
            )
        )
    return items


def _recurring_observation(
    ctx: _Context,
    key: KeyTuple,
    commitment: RecurringCommitment,
    member: dict[str, object],
) -> CommitmentObservation:
    if ctx.period is None or (not ctx.imported and not ctx.has_observation(key)):
        return ctx.make(key, "not_determinable", ctx.missing_reason)
    if ctx.has_observation(key):
        return ctx.make(key, "observed", "member_transactions_in_period")
    if (commitment.start_date is not None and commitment.start_date > ctx.end) or (
        commitment.end_date is not None and commitment.end_date < ctx.start
    ):
        return ctx.make(key, "not_expected", "outside_commitment_dates")
    if commitment.cycle is None:
        return ctx.make(key, "not_determinable", "cycle_not_recorded")
    if commitment.cycle == "n_times":
        if (
            commitment.total_count is not None
            and int(
                member.get("count", 0)  # type: ignore[call-overload]
            )
            >= commitment.total_count
        ):
            return ctx.make(key, "not_expected", "all_counts_observed")
        return ctx.make(key, "not_determinable", "cycle_interval_not_recorded")
    anchor = commitment.start_date or _as_date(member.get("first_date"))
    if anchor is None:
        return ctx.make(key, "not_determinable", "start_not_recorded")
    if anchor > ctx.end:
        return ctx.make(key, "not_expected", "outside_commitment_dates")
    if commitment.cycle == "yearly" and anchor.month != ctx.start.month:
        return ctx.make(key, "not_expected", "off_cycle_month")
    if ctx.in_progress:
        return ctx.make(key, "not_determinable", "in_progress_month_not_yet_observed")
    return ctx.make(
        key, "expected_not_observed", "no_member_transaction_in_cycle_month"
    )


async def _recurring_items(
    db_session: AsyncSession,
    ctx: _Context,
    as_of: MetricAsOf,
    stats: dict[KeyTuple, dict[str, object]],
    last_observed: dict[KeyTuple, tuple[str, int]],
) -> list[CommitmentItem]:
    commitments = (
        (
            await db_session.execute(
                select(RecurringCommitment).order_by(RecurringCommitment.id)
            )
        )
        .scalars()
        .all()
    )
    items: list[CommitmentItem] = []
    for commitment in commitments:
        key: KeyTuple = ("recurring", commitment.id)
        member = stats.get(key, {})
        last = last_observed.get(key)
        ended = (
            commitment.end_date is not None
            and as_of.transaction_as_of is not None
            and commitment.end_date < as_of.transaction_as_of
        )
        lifecycle = "ended" if ended else "active"
        monthly = last[1] if (commitment.cycle == "monthly" and last) else None
        basis = "last_observed_closed_month" if monthly is not None else "not_available"
        count = int(member.get("count", 0))  # type: ignore[call-overload]
        remaining = (
            max(commitment.total_count - count, 0)
            if commitment.cycle == "n_times" and commitment.total_count is not None
            else None
        )
        adjustability = commitment.adjustability or "undecided"
        name = commitment.label or (
            f"{commitment.category_major}"
            + (f" / {commitment.category_minor}" if commitment.category_minor else "")
            + (f" · {commitment.merchant}" if commitment.merchant else "")
        )
        items.append(
            CommitmentItem(
                attributes_confirmed_at=commitment.attributes_confirmed_at,
                needs_attribute_confirmation=(
                    commitment.origin == "migration"
                    and commitment.attributes_confirmed_at is None
                ),
                commitment_key=f"recurring:{commitment.id}",
                kind="recurring",
                kind_label=COMMITMENT_KIND_LABELS["recurring"],
                source_id=commitment.id,
                name=name,
                lifecycle=lifecycle,  # type: ignore[arg-type]
                lifecycle_label=LIFECYCLE_LABELS[lifecycle],
                lifecycle_detail=f"match_scope={commitment.match_scope}",
                cycle=commitment.cycle,  # type: ignore[arg-type]
                cycle_label=(
                    CYCLE_LABELS[commitment.cycle]
                    if commitment.cycle
                    else "주기 미기록"
                ),
                monthly_burden=monthly,
                monthly_burden_basis=basis,  # type: ignore[arg-type]
                monthly_burden_basis_label=MONTHLY_BURDEN_BASIS_LABELS[basis],
                **_burden_origin_fields(
                    "observed_closed_month" if monthly is not None else "not_available"
                ),
                start_date=commitment.start_date,
                end_date=commitment.end_date,
                **_recurring_end_date(commitment),
                total_count=commitment.total_count,
                remaining_count=remaining,
                linked_count=count,
                adjustability=adjustability,  # type: ignore[arg-type]
                adjustability_label=ADJUSTABILITY_LABELS[adjustability],
                adjustability_basis=(
                    "약정 단위로 사람이 정한 값"
                    if commitment.adjustability
                    else "약정 단위 값이 없음(미정). 거래 지정·카테고리 기본값은 거래마다 따로 적용된다."
                ),
                last_observed_period=last[0] if last else None,
                last_observed_amount=last[1] if last else None,
                observation=_recurring_observation(ctx, key, commitment, member),
            )
        )
    return items


def _summary_item(item: CommitmentItem) -> CommitmentSummaryItem:
    return CommitmentSummaryItem(
        needs_attribute_confirmation=item.needs_attribute_confirmation,
        commitment_key=item.commitment_key,
        kind=item.kind,
        name=item.name,
        lifecycle=item.lifecycle,
        cycle=item.cycle,
        monthly_burden=item.monthly_burden,
        monthly_burden_basis=item.monthly_burden_basis,
        monthly_burden_origin=item.monthly_burden_origin,
        adjustability=item.adjustability,
        end_date=item.end_date,
        end_date_status=item.end_date_status,
        end_date_reason=item.end_date_reason,
        observation_state=item.observation.state,
        observed_amount=item.observation.observed_amount,
    )


async def read_commitments(
    db_session: AsyncSession,
    *,
    period: str | None,
    status_filter: str = "all",
    view: str = "detail",
) -> ReadCommitmentsResponse:
    as_of = await load_as_of(db_session)
    target = period or default_period(as_of)
    summaries = await load_period_summaries(db_session)
    scope = (
        build_period_scope(
            as_of=as_of, summaries=summaries, start_period=target, end_period=target
        )
        if target is not None
        else ReadPeriodScope(start_period=None, end_period=None, periods=[])
    )
    period_state = scope.periods[0] if scope.periods else None
    totals: dict[KeyTuple, tuple[int, int]] = {}
    ids: dict[KeyTuple, list[int]] = {}
    if target is not None:
        totals, ids = await _period_observations(db_session, target)
    ctx = _Context(
        period=target,
        imported=bool(
            period_state
            and period_state.coverage == "imported"
            and period_state.transaction_count > 0
        ),
        missing_reason=(
            "period_without_transactions"
            if period_state is not None and period_state.coverage == "imported"
            else "period_not_imported"
        ),
        in_progress=bool(period_state and period_state.month_status == "in_progress"),
        totals=totals,
        ids=ids,
    )
    stats, last_observed = await _history(db_session, as_of)
    items = [
        *await _loan_items(db_session, ctx, stats, last_observed),
        *await _installment_items(db_session, ctx, as_of, last_observed),
        *await _recurring_items(db_session, ctx, as_of, stats, last_observed),
    ]
    committed_total = 0
    if target is not None:
        committed_total = int(
            await db_session.scalar(
                select(MONTHLY_FLOW_SUMMARY_VIEW.c.committed_total).where(
                    MONTHLY_FLOW_SUMMARY_VIEW.c.period == target
                )
            )
            or 0
        )
    counts_by_state: dict[str, int] = {state: 0 for state in OBSERVATION_STATE_LABELS}
    for item in items:
        counts_by_state[item.observation.state] += 1
    missing_cycle = [
        item
        for item in items
        if item.kind == "recurring"
        and item.lifecycle == "active"
        and item.cycle is None
    ]
    missing_adjustability = [
        item
        for item in items
        if item.kind == "recurring"
        and item.lifecycle == "active"
        and item.adjustability == "undecided"
    ]
    extra = (
        [
            _reason(
                "commitment_attributes_missing",
                detail=(
                    f"주기 미기록 {len(missing_cycle)}건, "
                    f"조정 가능성 미정 {len(missing_adjustability)}건"
                ),
            )
        ]
        if (missing_cycle or missing_adjustability)
        and as_of.transaction_as_of is not None
        else None
    )
    state, reasons = resolve_status(
        as_of=as_of, scope=scope, classification=None, extra_incomplete=extra
    )
    selected = [
        item
        for item in items
        if status_filter == "all" or item.lifecycle == status_filter
    ]
    return ReadCommitmentsResponse(
        surface="commitments",
        surface_label="약정 목록",
        questions=["Q4"],
        status=state,
        status_label=STATUS_LABELS[state],
        status_reasons=reasons,
        as_of=read_as_of(as_of),
        period_scope=scope,
        classification=None,
        basis=ReadBasis(
            definition="commitments.v1",
            scope=(
                "약정 목록: 대출, 할부 계획, 사람이 등록한 정기 지급 묶음. 기록된 속성과 "
                "선택한 기간의 관측 여부. 관측 금액은 월 흐름표의 약정 지급 줄과 같은 거래다."
            ),
            rules={
                "month_data_coverage": MONTH_DATA_COVERAGE_RULE,
                "observation": (
                    "observed: 그 기간 약정에 속한(연결된) 지출이 있음. "
                    "expected_not_observed: 마감월이고 기록된 주기상 있어야 하는데 없음. "
                    "unlinked_transaction_present: 할부 회차가 있는 달에 같은 거래처의 "
                    "'할부 연결 미확인' 표시 거래가 있음. not_expected: 시작 전·종료 뒤·주기 밖. "
                    "not_determinable: 주기·시작 시점이 기록되지 않았거나 진행월이거나 "
                    "가져오지 않은 기간."
                ),
                "loan_cycle": (
                    "대출의 주기는 따로 기록되지 않는다. 최신 대출 스냅샷에 월 상환액이 "
                    "있으면 매월로 보고, 없으면 주기 미기록으로 둔다."
                ),
                "installment_schedule": (
                    "할부 회차 예정일은 첫 결제일에서 회차마다 한 달씩 더한 날이다"
                    "(기존 할부 화면과 같은 규칙)."
                ),
                "yearly_anchor": (
                    "매년 묶음은 시작일의 달, 시작일이 없으면 처음 관측된 거래의 달을 "
                    "해당 달로 본다."
                ),
                "end_date_status": (
                    "end_date가 null이면 end_date_status가 이유를 준다: open_ended(정기 "
                    "지급 묶음은 끝이 정해지지 않음), not_recorded(대출 만기 등 기록 없음), "
                    "not_applicable(회차 약정은 횟수로 끝남). 종료일은 추정하지 않는다."
                ),
                "monthly_burden_origin": (
                    "monthly_burden_origin은 월 부담 값의 출처다. 대출의 "
                    "recorded_monthly_payment는 '스냅샷에 저장된 값'이며, 그 값을 사람이 "
                    "넣었으면 entered_by_person, 연결 거래로 추정해 저장했으면 "
                    "estimated_from_linked_transactions다."
                ),
                "filters": (
                    "status=active|ended|all(기본 all)은 lifecycle로 items를 고른다(unknown은 "
                    "all에서만). view=summary면 items는 비고 item_summaries에 간단한 행을 준다. "
                    "totals와 counts_by_state는 필터와 무관하게 모든 약정 기준이다."
                ),
                "monthly_burden": (
                    "대출은 스냅샷의 월 상환액, 할부는 계획의 월 금액, 매월 묶음은 최근 "
                    "마감월에 관측된 합계. 매년·회차 묶음은 월 부담을 내지 않는다(월 환산은 T062)."
                ),
            },
            assumptions=[
                "이 목록은 기록된 약정의 속성이며 앞으로의 지급을 전망하지 않는다.",
                "관측되지 않음은 연결된 거래가 기록에 없다는 뜻이다. 지급하지 않았다는 증거가 아니다.",
                "대출과 할부는 끝날 때까지 조정 가능성이 보호로 고정된다.",
            ],
        ),
        labels={
            **common_labels(),
            **{f"observation.{k}": v for k, v in OBSERVATION_STATE_LABELS.items()},
            **{
                f"observation_reason.{k}": v
                for k, v in OBSERVATION_REASON_LABELS.items()
            },
            **{f"cycle.{k}": v for k, v in CYCLE_LABELS.items()},
            **{f"lifecycle.{k}": v for k, v in LIFECYCLE_LABELS.items()},
            **{f"commitment_kind.{k}": v for k, v in COMMITMENT_KIND_LABELS.items()},
            **{f"adjustability.{k}": v for k, v in ADJUSTABILITY_LABELS.items()},
            "totals.monthly_burden_recorded": "기록된 월 부담 합계(진행 중 약정)",
            "totals.observed_committed_total": "이 기간 관측된 약정 지급 합계(월 흐름표)",
        },
        data=ReadCommitmentsData(
            pending_confirmation_count=sum(
                item.needs_attribute_confirmation for item in items
            ),
            period=target,
            period_month_status=period_state.month_status if period_state else None,
            totals={
                "monthly_burden_recorded": sum(
                    item.monthly_burden or 0
                    for item in items
                    if item.lifecycle == "active"
                ),
                "observed_committed_total": committed_total,
            },
            counts_by_state=counts_by_state,
            items=selected if view == "detail" else [],
            status_filter=status_filter,  # type: ignore[arg-type]
            view=view,  # type: ignore[arg-type]
            total_item_count=len(items),
            returned_item_count=len(selected),
            item_summaries=(
                [_summary_item(item) for item in selected]
                if view == "summary"
                else None
            ),
        ),
    )
