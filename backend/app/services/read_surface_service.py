"""Agent read surface (T060): one envelope over the metric views.

The read surface reuses the services the screens use (``metrics_service``,
``comparison_service``) and therefore the same SQL views. This module only
adds the shared envelope: status vocabulary, period coverage, per-kind
as-of dates, classification completeness, one basis block, and Korean labels.
It never re-sums transaction amounts in Python.
"""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nature_axes import RecurringCommitment
from app.schemas.metrics import MetricAsOf, MetricContract
from app.schemas.read_surface import (
    ADJUSTABILITY_LABELS,
    COMMITMENT_KIND_LABELS,
    COVERAGE_LABELS,
    FLOW_ROW_LABELS,
    FLOW_SECTION_LABELS,
    MONTH_STATUS_LABELS,
    PAYMENT_FORM_LABELS,
    QUESTION_LABELS,
    SNAPSHOT_KIND_LABELS,
    STATUS_LABELS,
    STATUS_REASON_LABELS,
    ClassificationCompleteness,
    CoverageGap,
    ReadAsOf,
    ReadBasis,
    ReadClassificationState,
    ReadComparisonData,
    ReadComparisonResponse,
    ReadContributionsData,
    ReadContributionsResponse,
    ReadDataStatusData,
    ReadDataStatusResponse,
    ReadMonthlyFlowData,
    ReadMonthlyFlowResponse,
    ReadPeriodScope,
    ReadPeriodState,
    ReadSpendCubeData,
    ReadSpendCubeResponse,
    ReadStatusReason,
    SnapshotKindStatus,
)
from app.services.comparison_service import (
    FLOW_MEASURES,
    get_change_contributions,
    get_monthly_flow_comparison,
)
from app.services.metric_views import (
    EXPENSE,
    FLOW_LINES_VIEW,
    MONTHLY_FLOW_SUMMARY_VIEW,
)
from app.services.metrics_service import (
    get_metric_data_status,
    get_monthly_flow,
    get_spend_cube,
    ratio,
)

MAX_PERIOD_SPAN = 240
UNCATEGORIZED_NAMES = ("", "미분류")

MONTHLY_FLOW_FIELD_LABELS: dict[str, str] = {
    **dict(FLOW_MEASURES),
    "residual_rate": "현금 잔여율",
    "transfer_activity_total": "이체 총액(양방향)",
    "other_type_total": "기타 유형 합계",
    "refund_total": "환불 합계",
    "signed_total": "원부호 합계",
    "transaction_count": "거래 수",
    "adjustability_undecided_share": "조정 가능성 미정 비중",
}


# --------------------------------------------------------------------------
# Envelope building blocks.
# --------------------------------------------------------------------------


def read_as_of(as_of: MetricAsOf) -> ReadAsOf:
    return ReadAsOf(
        transaction_as_of=as_of.transaction_as_of,
        first_transaction_date=as_of.first_transaction_date,
        last_closed_period=as_of.last_closed_period,
        in_progress_period=as_of.in_progress_period,
        snapshot_as_of=as_of.snapshot_as_of,
    )


def period_of(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def period_range(start_period: str, end_period: str) -> list[str]:
    if end_period < start_period:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="end_period must not be before start_period",
        )
    year, month = (int(part) for part in start_period.split("-"))
    periods: list[str] = []
    while True:
        current = f"{year:04d}-{month:02d}"
        periods.append(current)
        if current >= end_period:
            break
        if len(periods) > MAX_PERIOD_SPAN:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"period span must be at most {MAX_PERIOD_SPAN} months",
            )
        month += 1
        if month == 13:
            year, month = year + 1, 1
    return periods


async def load_period_summaries(
    db_session: AsyncSession,
) -> dict[str, dict[str, int]]:
    """Per-period totals from ``vw_monthly_flow_summary`` (one row per month)."""
    summary = MONTHLY_FLOW_SUMMARY_VIEW
    rows = await db_session.execute(
        select(
            summary.c.period,
            summary.c.transaction_count,
            summary.c.total_outflow,
            summary.c.adjustability_undecided_total,
        )
    )
    return {
        row.period: {
            "transaction_count": int(row.transaction_count or 0),
            "total_outflow": int(row.total_outflow or 0),
            "adjustability_undecided_total": int(
                row.adjustability_undecided_total or 0
            ),
        }
        for row in rows
    }


def imported_bounds(as_of: MetricAsOf) -> tuple[str, str] | None:
    if as_of.first_transaction_date is None or as_of.transaction_as_of is None:
        return None
    return period_of(as_of.first_transaction_date), period_of(as_of.transaction_as_of)


def period_state(
    period: str,
    *,
    as_of: MetricAsOf,
    summaries: dict[str, dict[str, int]],
) -> ReadPeriodState:
    bounds = imported_bounds(as_of)
    if bounds is None or not (bounds[0] <= period <= bounds[1]):
        return ReadPeriodState(
            period=period,
            coverage="not_imported",
            coverage_label=COVERAGE_LABELS["not_imported"],
            status="not_imported",
            status_label=STATUS_LABELS["not_imported"],
        )
    values = summaries.get(period, {})
    count = values.get("transaction_count", 0)
    outflow = values.get("total_outflow", 0)
    undecided = values.get("adjustability_undecided_total", 0)
    month_status = (
        "closed"
        if as_of.last_closed_period is not None and period <= as_of.last_closed_period
        else "in_progress"
    )
    if count == 0:
        state = "no_transactions"
    elif undecided != 0:
        state = "classification_incomplete"
    else:
        state = "ok"
    return ReadPeriodState(
        period=period,
        coverage="imported",
        coverage_label=COVERAGE_LABELS["imported"],
        month_status=month_status,
        status=state,
        status_label=STATUS_LABELS[state],
        transaction_count=count,
        total_outflow=outflow,
        adjustability_undecided_total=undecided,
        adjustability_undecided_share=ratio(undecided, outflow),
    )


def build_period_scope(
    *,
    as_of: MetricAsOf,
    summaries: dict[str, dict[str, int]],
    start_period: str | None,
    end_period: str | None,
) -> ReadPeriodScope:
    bounds = imported_bounds(as_of)
    start = start_period or (bounds[0] if bounds else None)
    end = end_period or (bounds[1] if bounds else None)
    if start is None and end is not None:
        start = end
    if end is None and start is not None:
        end = max(start, bounds[1]) if bounds else start
    periods = (
        []
        if start is None or end is None
        else [
            period_state(period, as_of=as_of, summaries=summaries)
            for period in period_range(start, end)
        ]
    )
    return ReadPeriodScope(start_period=start, end_period=end, periods=periods)


def classification_state(undecided_total: int, outflow: int) -> ReadClassificationState:
    return ReadClassificationState(
        adjustability_undecided_total=undecided_total,
        total_outflow=outflow,
        adjustability_undecided_share=ratio(undecided_total, outflow),
        complete=undecided_total == 0,
    )


def scope_classification(scope: ReadPeriodScope) -> ReadClassificationState:
    imported = [item for item in scope.periods if item.coverage == "imported"]
    return classification_state(
        sum(item.adjustability_undecided_total for item in imported),
        sum(item.total_outflow for item in imported),
    )


def _reason(code: str, periods: list[str] | None = None, detail: str | None = None):
    return ReadStatusReason(
        code=code,  # type: ignore[arg-type]
        label=STATUS_REASON_LABELS[code],
        periods=periods or [],
        detail=detail,
    )


def resolve_status(
    *,
    as_of: MetricAsOf,
    scope: ReadPeriodScope | None,
    classification: ReadClassificationState | None,
    non_krw_count: int = 0,
    extra_incomplete: list[ReadStatusReason] | None = None,
) -> tuple[str, list[ReadStatusReason]]:
    """Single status for a response plus every reason that applies.

    Precedence: not_imported > no_transactions > classification_incomplete > ok.
    query_failed is never returned here (it is an HTTP 503 body).
    """
    reasons: list[ReadStatusReason] = []
    if as_of.transaction_as_of is None:
        return "not_imported", [_reason("no_transactions_imported")]
    resolved = "ok"
    if scope is not None and scope.periods:
        missing = [p.period for p in scope.periods if p.coverage == "not_imported"]
        empty = [p.period for p in scope.periods if p.status == "no_transactions"]
        in_progress = [
            p.period for p in scope.periods if p.month_status == "in_progress"
        ]
        if missing:
            reasons.append(_reason("periods_not_imported", missing))
        if empty:
            reasons.append(_reason("periods_without_transactions", empty))
        if in_progress:
            reasons.append(_reason("in_progress_month_included", in_progress))
        imported = [p for p in scope.periods if p.coverage == "imported"]
        if not imported:
            return "not_imported", reasons
        if all(p.transaction_count == 0 for p in imported):
            return "no_transactions", reasons
    if classification is not None and classification.adjustability_undecided_total:
        resolved = "classification_incomplete"
        reasons.append(
            _reason(
                "adjustability_undecided",
                [
                    p.period
                    for p in (scope.periods if scope else [])
                    if p.adjustability_undecided_total
                ],
            )
        )
    if extra_incomplete:
        resolved = "classification_incomplete"
        reasons.extend(extra_incomplete)
    if non_krw_count:
        reasons.append(
            _reason("non_krw_excluded", detail=f"{non_krw_count}건 제외(전체 기간)")
        )
    return resolved, reasons


def basis_from_contract(
    contract: MetricContract, assumptions: list[str] | None = None
) -> ReadBasis:
    inclusion = contract.inclusion
    return ReadBasis(
        definition=contract.definition,
        scope=contract.scope,
        rules={
            "basis_view": inclusion.basis_view,
            "currency": inclusion.currency,
            "excluded": ", ".join(inclusion.excluded),
            "sign_convention": inclusion.sign_convention,
            "refunds": inclusion.refunds,
            "transfers": inclusion.transfers,
            "loans": inclusion.loans,
            "period_attribution": inclusion.period_attribution,
        },
        field_scopes=dict(contract.field_scopes),
        assumptions=assumptions or [],
    )


def common_labels() -> dict[str, str]:
    return {
        **{f"status.{key}": value for key, value in STATUS_LABELS.items()},
        **{f"month_status.{key}": value for key, value in MONTH_STATUS_LABELS.items()},
        **{f"coverage.{key}": value for key, value in COVERAGE_LABELS.items()},
        **{f"snapshot.{key}": value for key, value in SNAPSHOT_KIND_LABELS.items()},
    }


def flow_labels() -> dict[str, str]:
    return {
        **common_labels(),
        **{f"flow_row.{key}": value for key, value in FLOW_ROW_LABELS.items()},
        **{f"flow_section.{key}": value for key, value in FLOW_SECTION_LABELS.items()},
        **{f"field.{key}": value for key, value in MONTHLY_FLOW_FIELD_LABELS.items()},
    }


def axis_labels() -> dict[str, str]:
    return {
        **{
            f"adjustability.{key}": value for key, value in ADJUSTABILITY_LABELS.items()
        },
        **{f"payment_form.{key}": value for key, value in PAYMENT_FORM_LABELS.items()},
        **{
            f"commitment_kind.{key}": value
            for key, value in COMMITMENT_KIND_LABELS.items()
        },
    }


FLOW_ASSUMPTIONS = [
    "값은 거래 기준일까지 가져온 기록이며 오늘의 잔액이나 실시간 값이 아니다.",
    "진행월은 부분 기록이다. 비율 지표(현금 잔여율)는 마감월에만 낸다.",
    "조정 가능성 미정 지출은 보호·조정 가능 어느 쪽에도 넣지 않고 따로 센다.",
]


# --------------------------------------------------------------------------
# Wrapped screen payloads.
# --------------------------------------------------------------------------


async def read_monthly_flow(
    db_session: AsyncSession, *, start_period: str | None, end_period: str | None
) -> ReadMonthlyFlowResponse:
    flow = await get_monthly_flow(
        db_session, start_period=start_period, end_period=end_period
    )
    as_of = flow.contract.as_of
    scope = build_period_scope(
        as_of=as_of,
        summaries=await load_period_summaries(db_session),
        start_period=start_period,
        end_period=end_period,
    )
    classification = scope_classification(scope)
    state, reasons = resolve_status(
        as_of=as_of,
        scope=scope,
        classification=classification,
        non_krw_count=flow.contract.non_krw_transaction_count,
    )
    return ReadMonthlyFlowResponse(
        surface="monthly_flow",
        surface_label="월 흐름표",
        questions=["Q1"],
        status=state,
        status_label=STATUS_LABELS[state],
        status_reasons=reasons,
        as_of=read_as_of(as_of),
        period_scope=scope,
        classification=classification,
        basis=basis_from_contract(flow.contract, FLOW_ASSUMPTIONS),
        labels=flow_labels(),
        data=ReadMonthlyFlowData(items=flow.items),
    )


async def read_spend_cube(
    db_session: AsyncSession,
    *,
    start_period: str | None,
    end_period: str | None,
    group_by: list[str],
    filters: dict[str, str],
    limit: int,
) -> ReadSpendCubeResponse:
    cube = await get_spend_cube(
        db_session,
        start_period=start_period,
        end_period=end_period,
        group_by=group_by,
        filters=filters,
        limit=limit + 1,
    )
    rows = cube.rows[:limit]
    as_of = cube.contract.as_of
    scope = build_period_scope(
        as_of=as_of,
        summaries=await load_period_summaries(db_session),
        start_period=start_period,
        end_period=end_period,
    )
    classification = classification_state(
        int(cube.contract.adjustability_undecided_total or 0), cube.total_amount
    )
    state, reasons = resolve_status(
        as_of=as_of,
        scope=scope,
        classification=classification,
        non_krw_count=cube.contract.non_krw_transaction_count,
    )
    return ReadSpendCubeResponse(
        surface="spend_cube",
        surface_label="지출 큐브 질의",
        questions=["Q1", "Q3"],
        status=state,
        status_label=STATUS_LABELS[state],
        status_reasons=reasons,
        as_of=read_as_of(as_of),
        period_scope=scope,
        classification=classification,
        basis=basis_from_contract(
            cube.contract,
            [
                *FLOW_ASSUMPTIONS,
                "같은 거래처라도 카테고리가 다르면 다른 칸으로 센다.",
                "필터는 값이 정확히 같은 칸만 고른다. 미분류 카테고리는 빈 문자열이다.",
            ],
        ),
        labels={**flow_labels(), **axis_labels()},
        data=ReadSpendCubeData(
            group_by=cube.group_by,
            filters=filters,
            total_amount=cube.total_amount,
            row_count=len(rows),
            truncated=len(cube.rows) > limit,
            rows=rows,
        ),
    )


def _single_period_scope(
    *,
    as_of: MetricAsOf,
    summaries: dict[str, dict[str, int]],
    period: str | None,
) -> ReadPeriodScope:
    if period is None:
        return ReadPeriodScope(start_period=None, end_period=None, periods=[])
    return build_period_scope(
        as_of=as_of, summaries=summaries, start_period=period, end_period=period
    )


COMPARISON_ASSUMPTIONS = [
    "기준값은 최근 마감월(기본 6개월) 월별 금액의 중앙값이다. 자료 없는 달은 0원으로 세지 않는다.",
    "진행월 대상은 같은 경과일까지의 누적끼리 비교하고 비율·전월 전체 대비 증감을 내지 않는다.",
    "변화 목록은 증감률이 아니라 금액 기여 절댓값 순이다.",
]


async def read_comparison(
    db_session: AsyncSession, *, period: str | None
) -> ReadComparisonResponse:
    result = await get_monthly_flow_comparison(db_session, period=period)
    as_of = result.contract.as_of
    target = result.comparison.target_period or period
    scope = _single_period_scope(
        as_of=as_of,
        summaries=await load_period_summaries(db_session),
        period=target,
    )
    classification = (
        scope_classification(scope) if scope.periods else classification_state(0, 0)
    )
    state, reasons = resolve_status(
        as_of=as_of,
        scope=scope,
        classification=classification,
        non_krw_count=result.contract.non_krw_transaction_count,
    )
    return ReadComparisonResponse(
        surface="comparison_monthly_flow",
        surface_label="월 흐름표 비교",
        questions=["Q1", "Q2"],
        status=state,
        status_label=STATUS_LABELS[state],
        status_reasons=reasons,
        as_of=read_as_of(as_of),
        period_scope=scope,
        classification=classification,
        basis=basis_from_contract(
            result.contract, [*FLOW_ASSUMPTIONS, *COMPARISON_ASSUMPTIONS]
        ),
        labels=flow_labels(),
        data=ReadComparisonData(
            comparison=result.comparison,
            measures=result.measures,
            residual_rate=result.residual_rate,
        ),
    )


async def read_contributions(
    db_session: AsyncSession,
    *,
    period: str | None,
    adjustability: str,
    level: str,
    category: str | None,
    limit: int,
) -> ReadContributionsResponse:
    result = await get_change_contributions(
        db_session,
        period=period,
        adjustability=adjustability,  # type: ignore[arg-type]
        level=level,  # type: ignore[arg-type]
        category=category,
        limit=limit,
    )
    as_of = result.contract.as_of
    target = result.comparison.target_period or period
    scope = _single_period_scope(
        as_of=as_of,
        summaries=await load_period_summaries(db_session),
        period=target,
    )
    classification = (
        scope_classification(scope) if scope.periods else classification_state(0, 0)
    )
    state, reasons = resolve_status(
        as_of=as_of,
        scope=scope,
        classification=classification,
        non_krw_count=result.contract.non_krw_transaction_count,
    )
    return ReadContributionsResponse(
        surface="comparison_contributions",
        surface_label="변화 기여",
        questions=["Q2", "Q3"],
        status=state,
        status_label=STATUS_LABELS[state],
        status_reasons=reasons,
        as_of=read_as_of(as_of),
        period_scope=scope,
        classification=classification,
        basis=basis_from_contract(
            result.contract, [*FLOW_ASSUMPTIONS, *COMPARISON_ASSUMPTIONS]
        ),
        labels={**flow_labels(), **axis_labels()},
        data=ReadContributionsData(
            comparison=result.comparison,
            adjustability=result.adjustability,
            level=result.level,
            category=result.category,
            ordering=result.ordering,
            target_total=result.target_total,
            baseline_total=result.baseline_total,
            change_total=result.change_total,
            items=result.items,
            twelve_month_window=result.twelve_month_window,
            twelve_month_items=result.twelve_month_items,
        ),
    )


# --------------------------------------------------------------------------
# Data status (Q6).
# --------------------------------------------------------------------------


async def _classification_counts(db_session: AsyncSession) -> dict[str, int]:
    lines = FLOW_LINES_VIEW
    is_expense = lines.c.type == EXPENSE
    uncategorized = or_(
        lines.c.effective_category_major.is_(None),
        lines.c.effective_category_major.in_(UNCATEGORIZED_NAMES),
    )
    row = (
        await db_session.execute(
            select(
                func.count(
                    func.distinct(
                        case(
                            (
                                lines.c.adjustability == "undecided",
                                lines.c.transaction_id,
                            )
                        )
                    )
                ).label("undecided_count"),
                func.coalesce(
                    func.sum(case((uncategorized, -lines.c.amount), else_=0)), 0
                ).label("uncategorized_total"),
                func.count(
                    func.distinct(case((uncategorized, lines.c.transaction_id)))
                ).label("uncategorized_count"),
                func.count(
                    func.distinct(
                        case(
                            (
                                lines.c.mapping_note == "installment_link_unconfirmed",
                                lines.c.transaction_id,
                            )
                        )
                    )
                ).label("installment_unconfirmed_count"),
            ).where(is_expense)
        )
    ).one()
    commitments = RecurringCommitment
    commitment_row = (
        await db_session.execute(
            select(
                func.count(case((commitments.cycle.is_(None), 1))).label("no_cycle"),
                func.count(case((commitments.adjustability.is_(None), 1))).label(
                    "no_adjustability"
                ),
            )
        )
    ).one()
    return {
        "undecided_count": int(row.undecided_count or 0),
        "uncategorized_total": int(row.uncategorized_total or 0),
        "uncategorized_count": int(row.uncategorized_count or 0),
        "installment_unconfirmed_count": int(row.installment_unconfirmed_count or 0),
        "commitments_without_cycle": int(commitment_row.no_cycle or 0),
        "commitments_without_adjustability": int(commitment_row.no_adjustability or 0),
    }


def _lag_days(transaction_as_of: date | None, snapshot: date | None) -> int | None:
    if transaction_as_of is None or snapshot is None:
        return None
    return (transaction_as_of - snapshot).days


async def read_data_status(db_session: AsyncSession) -> ReadDataStatusResponse:
    base = await get_metric_data_status(db_session)
    as_of = base.as_of
    summaries = await load_period_summaries(db_session)
    scope = build_period_scope(
        as_of=as_of, summaries=summaries, start_period=None, end_period=None
    )
    counts = await _classification_counts(db_session)
    classification = classification_state(
        base.adjustability_undecided_total, base.total_outflow
    )
    missing_attributes = (
        counts["commitments_without_cycle"]
        + counts["commitments_without_adjustability"]
    )
    extra = (
        [
            _reason(
                "commitment_attributes_missing",
                detail=(
                    f"주기 미기록 {counts['commitments_without_cycle']}건, "
                    f"조정 가능성 미정 {counts['commitments_without_adjustability']}건"
                ),
            )
        ]
        if missing_attributes and as_of.transaction_as_of is not None
        else None
    )
    state, reasons = resolve_status(
        as_of=as_of,
        scope=scope,
        classification=classification,
        non_krw_count=base.non_krw_transaction_count,
        extra_incomplete=extra,
    )
    snapshot_values = as_of.snapshot_as_of.model_dump()
    bounds = imported_bounds(as_of)
    share = classification.adjustability_undecided_share
    return ReadDataStatusResponse(
        surface="data_status",
        surface_label="자료 현황",
        questions=["Q6"],
        status=state,
        status_label=STATUS_LABELS[state],
        status_reasons=reasons,
        as_of=read_as_of(as_of),
        period_scope=scope,
        classification=classification,
        basis=ReadBasis(
            definition="data_status.v1",
            scope=(
                "자료 현황: 거래 기준일과 종류별 스냅샷 기준일, 마감월·진행월, 가져온 "
                "기간 안의 거래 0건 달, 금액 기준 분류 완성도"
            ),
            rules={
                "coverage": (
                    "가져온 기간은 첫 유효 거래가 있는 달부터 거래 기준일이 있는 달까지다. "
                    "그 밖의 달은 not_imported, 그 안에서 유효 거래가 0건인 달은 "
                    "no_transactions다."
                ),
                "snapshot_as_of": "스냅샷 기준일은 종류마다 따로 두고 합치지 않는다.",
                "undecided_share": "미정 비중 = 조정 가능성 미정 지출 ÷ 총지급(금액 기준).",
            },
            assumptions=[
                "업로드 기록에는 파일이 덮는 기간이 없어서, 가져온 기간은 유효 거래의 첫 날과 "
                "마지막 날로 정한다.",
                "자료가 오래되었는지는 이 표면이 판단하지 않는다. 기준일을 그대로 준다.",
            ],
        ),
        labels={**common_labels(), **axis_labels()},
        data=ReadDataStatusData(
            transaction_coverage={
                "first_transaction_date": (
                    as_of.first_transaction_date.isoformat()
                    if as_of.first_transaction_date
                    else None
                ),
                "transaction_as_of": (
                    as_of.transaction_as_of.isoformat()
                    if as_of.transaction_as_of
                    else None
                ),
                "first_period": bounds[0] if bounds else None,
                "last_period": bounds[1] if bounds else None,
                "imported_period_count": len(scope.periods),
            },
            closed_periods=base.closed_periods,
            in_progress_period=base.in_progress_period,
            snapshots=[
                SnapshotKindStatus(
                    kind=kind,  # type: ignore[arg-type]
                    kind_label=SNAPSHOT_KIND_LABELS[kind],
                    as_of=snapshot_values[kind],
                    days_before_transaction_as_of=_lag_days(
                        as_of.transaction_as_of, snapshot_values[kind]
                    ),
                )
                for kind in SNAPSHOT_KIND_LABELS
            ],
            classification=ClassificationCompleteness(
                adjustability_undecided_total=base.adjustability_undecided_total,
                adjustability_undecided_transaction_count=counts["undecided_count"],
                total_outflow=base.total_outflow,
                adjustability_undecided_share=share,
                adjustability_decided_share=(
                    None if share is None else round(1 - share, 4)
                ),
                uncategorized_expense_total=counts["uncategorized_total"],
                uncategorized_expense_transaction_count=counts["uncategorized_count"],
                installment_link_unconfirmed_transaction_count=counts[
                    "installment_unconfirmed_count"
                ],
                commitments_without_cycle=counts["commitments_without_cycle"],
                commitments_without_adjustability=counts[
                    "commitments_without_adjustability"
                ],
            ),
            coverage_gaps=[
                CoverageGap(period=item.period)
                for item in scope.periods
                if item.status == "no_transactions"
            ],
            periods=scope.periods,
            excluded_currency=base.excluded_currency,
            non_krw_transaction_count=base.non_krw_transaction_count,
            month_end_forecast={
                "path": "/api/v1/canonical-views/dashboard",
                "field": "month_projection",
                "note": (
                    "진행월 월말 순현금흐름 전망은 기존 응답이 그대로 낸다(로직 점검·수정은 "
                    "T064 별도 승인). 이 표면은 전망을 다시 계산하거나 관측값과 합치지 않는다."
                ),
            },
        ),
    )


def question_labels() -> dict[str, str]:
    return dict(QUESTION_LABELS)
