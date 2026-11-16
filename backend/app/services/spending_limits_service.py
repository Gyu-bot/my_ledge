"""T062: reuse T057 annual contributions and T054 SQL actuals; append-only limits."""

from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.spending_limit import SpendingLimitRevision
from app.schemas.read_surface import ADJUSTABILITY_LABELS, ReadBasis
from app.schemas.spending_limits import (
    ADJUSTABILITY_VALUES,
    AnnualEquivalent,
    LimitComparison,
    MissingReason,
    ReadSpendingReferenceResponse,
    SpendingLimitCreate,
    SpendingLimitHistoryResponse,
    SpendingLimitRevisionResponse,
    SpendingReferenceData,
)
from app.services.comparison_service import get_change_contributions
from app.services.metrics_service import get_spend_cube, load_as_of
from app.services.read_surface_service import read_monthly_flow
from app.services.upload_rollback_service import LOCK_KEY

HISTORY_RULE = (
    "한도는 새 적용 시작월로만 추가합니다. 이미 마감된 달과 같은 대상의 마지막 적용 "
    "시작월 이전·동일 월은 바꿀 수 없습니다. 각 달은 그 달 이하의 최신 버전을 읽습니다. "
    "금액 null은 한도 해제이며, 이전 버전을 지우지 않습니다."
)
MISSING_LABELS = {
    "no_limit_set": "이 달에 적용할 한도가 없습니다.",
    "month_in_progress": "진행월은 한도와 비교하지 않습니다.",
    "not_imported": "아직 가져오지 않은 기간입니다.",
    "no_transactions": "거래가 없는 달은 0원 실적으로 간주해 비교하지 않습니다.",
    "partial_month": "월중에 시작한 부분 기록이라 한도와 비교하지 않습니다.",
}


async def list_limits(db: AsyncSession) -> SpendingLimitHistoryResponse:
    revisions = (
        await db.scalars(
            select(SpendingLimitRevision).order_by(
                SpendingLimitRevision.target_kind,
                SpendingLimitRevision.target_value,
                SpendingLimitRevision.effective_from_period,
            )
        )
    ).all()
    as_of = await load_as_of(db)
    return SpendingLimitHistoryResponse(
        revisions=[
            SpendingLimitRevisionResponse.model_validate(row) for row in revisions
        ],
        last_closed_period=as_of.last_closed_period,
        history_rule=HISTORY_RULE,
    )


async def create_limit(
    db: AsyncSession, payload: SpendingLimitCreate
) -> SpendingLimitRevisionResponse:
    # Serialize against imports/rollbacks too: data must not close the requested
    # month between checking as-of and saving its limit. No service is restarted.
    if db.get_bind().dialect.name == "postgresql":
        await db.execute(select(func.pg_advisory_xact_lock(LOCK_KEY)))
    as_of = await load_as_of(db)
    if (
        as_of.last_closed_period
        and payload.effective_from_period <= as_of.last_closed_period
    ):
        raise HTTPException(
            422,
            "이미 마감된 달의 한도는 바꿀 수 없습니다. 마감되지 않은 적용 시작월을 입력해 주세요.",
        )
    latest = await db.scalar(
        select(func.max(SpendingLimitRevision.effective_from_period)).where(
            SpendingLimitRevision.target_kind == payload.target_kind,
            SpendingLimitRevision.target_value == payload.target_value,
        )
    )
    if latest and payload.effective_from_period <= latest:
        raise HTTPException(
            409, "같은 대상의 마지막 적용 시작월보다 뒤인 달로 새 버전을 추가해 주세요."
        )
    revision = SpendingLimitRevision(**payload.model_dump())
    db.add(revision)
    await db.commit()
    await db.refresh(revision)
    return SpendingLimitRevisionResponse.model_validate(revision)


async def read_spending_reference(
    db: AsyncSession, *, period: str | None
) -> ReadSpendingReferenceResponse:
    # The flow envelope carries the same dates, coverage and completeness as the
    # screen's actuals. No amount is recomputed from transactions in Python.
    if period is None:
        as_of = await load_as_of(db)
        first_period = (
            as_of.first_transaction_date.strftime("%Y-%m")
            if as_of.first_transaction_date
            else None
        )
        closed = as_of.last_closed_period
        period = (
            closed
            if closed and first_period and closed >= first_period
            else as_of.in_progress_period
        )
    flow = await read_monthly_flow(db, start_period=period, end_period=period)
    state = next(
        (
            item
            for item in (flow.period_scope.periods if flow.period_scope else [])
            if item.period == period
        ),
        None,
    )
    reason: MissingReason | None = None
    if state is None or state.coverage == "not_imported":
        reason = "not_imported"
    elif state.month_status == "in_progress":
        reason = "month_in_progress"
    elif state.transaction_count == 0:
        reason = "no_transactions"
    elif state.data_coverage != "full":
        reason = "partial_month"
    has_actual = state is not None and state.transaction_count > 0
    latest: dict[tuple[str, str], SpendingLimitRevision] = {}
    if period is not None:
        revisions = (
            await db.scalars(
                select(SpendingLimitRevision)
                .where(
                    SpendingLimitRevision.effective_from_period <= period,
                )
                .order_by(SpendingLimitRevision.effective_from_period)
            )
        ).all()
        for revision in revisions:
            latest[(revision.target_kind, revision.target_value)] = revision
    actuals: dict[tuple[str, str], int] = {}
    if has_actual:
        for kind, dimension in (
            ("category", "effective_category_major"),
            ("adjustability", "adjustability"),
        ):
            cube = await get_spend_cube(
                db,
                start_period=period,
                end_period=period,
                group_by=[dimension],
                filters={},
                limit=None,
            )
            for row in cube.rows:
                actuals[(kind, getattr(row, dimension) or "")] = row.amount
    targets = (
        set(actuals)
        | set(latest)
        | {("adjustability", value) for value in ADJUSTABILITY_VALUES}
    )
    comparisons = []
    for kind, value in sorted(targets):
        revision = latest.get((kind, value))
        limit_amount = revision.amount if revision else None
        actual = actuals.get((kind, value), 0) if has_actual else None
        missing = reason or ("no_limit_set" if limit_amount is None else None)
        comparisons.append(
            LimitComparison(
                target_kind=kind,
                target_value=value,
                target_label=(
                    ADJUSTABILITY_LABELS[value]
                    if kind == "adjustability"
                    else value or "미분류"
                ),
                actual_amount=actual,
                limit_amount=limit_amount,
                limit_revision_id=revision.id if revision else None,
                effective_from_period=revision.effective_from_period
                if revision
                else None,
                difference_amount=actual - limit_amount
                if missing is None and actual is not None and limit_amount is not None
                else None,
                missing_reason=missing,
                missing_reason_label=MISSING_LABELS.get(missing),
            )
        )
    annual_items = []
    annual_reason = None
    start = end = None
    if period is not None:
        contributions = await get_change_contributions(
            db,
            period=period,
            adjustability="all",
            level="category",
            category=None,
            limit=None,
        )
        window = contributions.twelve_month_window
        start, end = window.target_window_start_period, window.target_window_end_period
        if state and state.month_status == "in_progress":
            annual_reason = "month_in_progress"
        elif not window.target_window_complete:
            annual_reason = "incomplete_twelve_month_window"
        else:
            annual_items = [
                AnnualEquivalent(
                    category=item.category,
                    window_amount=item.target_amount,
                    monthly_equivalent=int(
                        (Decimal(item.target_amount) / 12).quantize(
                            Decimal(1), rounding=ROUND_HALF_UP
                        )
                    ),
                    active_months_in_window=item.active_months_in_window,
                )
                for item in contributions.twelve_month_items
            ]
    else:
        annual_reason = "incomplete_twelve_month_window"
    basis = ReadBasis(
        definition="spending_reference.v1",
        scope="과거 유효 KRW 지출(환불 차감, 대출 포함). 대분류와 조정 가능성은 겹치는 두 보기이며 합산하지 않습니다.",
        rules={
            **flow.basis.rules,
            "annual_like": "T057 twelve_month_items 그대로: 대상 월로 끝나는 완전한 12개월 창에서 월 지출 순액이 양수인 달이 1~2개인 대분류. 월중 시작 첫 달·자료 없는 달을 포함한 창은 판정하지 않음. 분류나 약정 주기를 자동 지정하지 않음.",
            "monthly_equivalent": "12개월 순액 ÷ 12, 원 단위 사사오입. 참고값이며 total_outflow·한도 대비 실적에 더하거나 대체하지 않음. 진행월에는 제공하지 않음.",
            "limit_history": HISTORY_RULE,
            "comparison": "자료가 있는 완전한 마감월에만 실적 − 해당 월 한도. 미설정·한도 해제·진행월·부분월·자료 없음은 null과 missing_reason. 한도끼리 합산하지 않음.",
        },
        field_scopes={
            "data.total_outflow": "선택 월의 기존 월 흐름표 총지급(진행월은 관측 누적).",
            "data.comparisons[].actual_amount": "선택 월의 SQL 지출 큐브 순액. 자료 있는 달의 거래 없는 대상은 0원.",
            "data.annual_items": "window_start_period~window_end_period의 T057 12개월 기여 목록. 한도 비교와 별도.",
        },
        assumptions=[
            "한도 금액·대상·시작월은 사람이 직접 입력합니다. 추천·남은 예산·적립 계획을 만들지 않습니다."
        ],
    )
    return ReadSpendingReferenceResponse(
        **flow.model_dump(
            exclude={"data", "surface", "surface_label", "questions", "basis", "labels"}
        ),
        surface="spending_reference",
        surface_label="연간성 지출 참고와 한도 대비",
        questions=["Q1", "Q3"],
        basis=basis,
        labels={
            **flow.labels,
            "target_kind.category": "카테고리 (대분류)",
            "target_kind.adjustability": "조정 가능성",
        },
        data=SpendingReferenceData(
            period=period,
            total_outflow=state.total_outflow if has_actual else None,
            window_start_period=start,
            window_end_period=end,
            annual_missing_reason=annual_reason,
            annual_missing_reason_label=(
                "진행월에는 12개월 월 환산을 표시하지 않습니다."
                if annual_reason == "month_in_progress"
                else "최근 12개월이 완전한 자료가 있는 달이 아니어서 판정하지 않았습니다."
                if annual_reason
                else None
            ),
            annual_items=annual_items,
            comparisons=comparisons,
        ),
    )
