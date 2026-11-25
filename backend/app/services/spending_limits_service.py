"""T062: retrospective category-pair references and append-only human limits."""

from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import and_, case, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nature_axes import RecurringCommitment
from app.models.spending_limit import SpendingLimitRevision
from app.schemas.read_surface import ADJUSTABILITY_LABELS, STATUS_LABELS, ReadBasis
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
from app.services.comparison_service import (
    load_periods_with_data,
    period_of,
    period_range,
    shift_period,
)
from app.services.metric_views import EXPENSE, FLOW_LINES_VIEW
from app.services.metrics_service import flow_inclusion, load_as_of, load_metric_context
from app.services.read_surface_service import (
    basis_rules,
    flow_labels,
    load_single_period_scope,
    read_as_of,
    resolve_status,
    scope_classification,
)
from app.services.upload_rollback_service import LOCK_KEY

HISTORY_RULE = (
    "한도는 새 적용 시작월로만 추가합니다. 이미 마감된 달과 같은 대상의 마지막 적용 "
    "시작월 이전·동일 월은 바꿀 수 없습니다. 각 달은 그 달 이하의 최신 버전을 읽습니다. "
    "금액을 비워 저장하면 한도 해제이며, 이전 버전을 지우지 않습니다."
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


async def _annual_equivalents(
    db: AsyncSession, *, start: str, end: str
) -> list[AnnualEquivalent]:
    """One SQL statement over flow lines; Python only shapes SQL totals/months.

    Qualify the whole pair before removing registered yearly lines. Keep those
    lines (including refund parts) exclusively in their commitment bucket.
    Empty and null minor categories share the explicit missing-minor bucket.
    View membership already resolves dates, exclusions, overrides and refunds;
    never re-match merchants or infer a cycle here. Only human input can set
    cycle=yearly; origin may still be migration after a person edits a bundle.
    """
    lines = FLOW_LINES_VIEW
    commitment = RecurringCommitment.__table__
    major = func.coalesce(lines.c.effective_category_major, "").label("category")
    minor = func.nullif(lines.c.effective_category_minor, "").label("category_minor")
    monthly = (
        select(
            major,
            minor,
            lines.c.period,
            commitment.c.id.label("commitment_id"),
            commitment.c.label.label("commitment_label"),
            func.sum(-lines.c.amount).label("amount"),
            func.count().label("line_count"),
        )
        .select_from(
            lines.outerjoin(
                commitment,
                and_(
                    commitment.c.id == lines.c.recurring_commitment_id,
                    commitment.c.cycle == "yearly",
                ),
            )
        )
        .where(
            lines.c.type == EXPENSE,
            lines.c.period.between(start, end),
            lines.c.one_off_event_id.is_(None),
        )
        .group_by(major, minor, lines.c.period, commitment.c.id, commitment.c.label)
        .cte("annual_source_months")
    )
    pair_months = (
        select(
            monthly.c.category,
            monthly.c.category_minor,
            monthly.c.period,
            func.sum(monthly.c.amount).label("pattern_amount"),
            func.sum(
                case((monthly.c.commitment_id.is_(None), monthly.c.line_count), else_=0)
            ).label("line_count"),
            func.sum(
                case((monthly.c.commitment_id.is_(None), monthly.c.amount), else_=0)
            ).label("amount"),
        )
        .group_by(monthly.c.category, monthly.c.category_minor, monthly.c.period)
        .cte("annual_pair_months")
    )
    buckets = union_all(
        select(
            pair_months.c.category,
            pair_months.c.category_minor,
            pair_months.c.period,
            literal(None, type_=commitment.c.id.type).label("commitment_id"),
            literal(None, type_=commitment.c.label.type).label("commitment_label"),
            pair_months.c.pattern_amount,
            pair_months.c.amount,
            pair_months.c.line_count,
        ),
        select(
            monthly.c.category,
            monthly.c.category_minor,
            monthly.c.period,
            monthly.c.commitment_id,
            monthly.c.commitment_label,
            monthly.c.amount.label("pattern_amount"),
            monthly.c.amount,
            monthly.c.line_count,
        ).where(monthly.c.commitment_id.is_not(None)),
    ).cte("annual_buckets")
    partition = [buckets.c.category, buckets.c.category_minor, buckets.c.commitment_id]
    query = select(
        buckets,
        func.sum(buckets.c.amount).over(partition_by=partition).label("window_amount"),
        func.sum(buckets.c.line_count)
        .over(partition_by=partition)
        .label("window_line_count"),
        func.count(case((buckets.c.pattern_amount > 0, 1)))
        .over(partition_by=partition)
        .label("pattern_months"),
        func.count(case((buckets.c.amount > 0, 1)))
        .over(partition_by=partition)
        .label("active_months"),
    ).order_by(buckets.c.period)
    items: dict[tuple[str, str | None, int | None], AnnualEquivalent] = {}
    for row in (await db.execute(query)).mappings():
        registered = row["commitment_id"] is not None
        if row["window_line_count"] == 0:
            continue
        if not registered and not 1 <= row["pattern_months"] <= 2:
            continue
        key = (row["category"], row["category_minor"], row["commitment_id"])
        if key not in items:
            items[key] = AnnualEquivalent(
                category=row["category"],
                category_minor=row["category_minor"],
                source="registered_yearly_commitment"
                if registered
                else "observed_pattern",
                commitment_id=row["commitment_id"],
                commitment_label=row["commitment_label"],
                window_amount=int(row["window_amount"]),
                monthly_equivalent=int(
                    (Decimal(row["window_amount"]) / 12).quantize(
                        Decimal(1), rounding=ROUND_HALF_UP
                    )
                ),
                active_months_in_window=int(row["active_months"]),
                observed_periods=[],
            )
        if row["amount"] > 0:
            items[key].observed_periods.append(row["period"])
    return sorted(
        items.values(),
        key=lambda item: (
            -item.window_amount,
            item.category,
            item.category_minor or "",
            item.source,
            item.commitment_id or 0,
        ),
    )


async def _spending_actuals(
    db: AsyncSession, *, period: str
) -> dict[tuple[str, str], tuple[int, int]]:
    lines = FLOW_LINES_VIEW
    expenses = (
        select(
            lines.c.effective_category_major,
            lines.c.adjustability,
            (-lines.c.amount).label("amount"),
            lines.c.one_off_event_id,
        )
        .where(lines.c.period == period, lines.c.type == EXPENSE)
        .cte("spending_reference_expenses")
    )
    groups = []
    for kind, column in (
        ("category", expenses.c.effective_category_major),
        ("adjustability", expenses.c.adjustability),
    ):
        key = func.coalesce(column, "")
        groups.append(
            select(
                literal(kind).label("kind"),
                key.label("value"),
                func.sum(expenses.c.amount).label("actual"),
                func.sum(
                    case(
                        (expenses.c.one_off_event_id.is_not(None), expenses.c.amount),
                        else_=0,
                    )
                ).label("one_off"),
            ).group_by(key)
        )
    return {
        (row.kind, row.value): (int(row.actual), int(row.one_off))
        for row in await db.execute(union_all(*groups))
    }


async def read_spending_reference(
    db: AsyncSession, *, period: str | None
) -> ReadSpendingReferenceResponse:
    context = await load_metric_context(db)
    as_of = context.as_of
    first_date = as_of.first_transaction_date
    first_period = period_of(first_date) if first_date else None
    if period is None:
        closed = as_of.last_closed_period
        period = (
            closed
            if closed and first_period and closed >= first_period
            else as_of.in_progress_period
        )
    elif as_of.transaction_as_of and period > period_of(as_of.transaction_as_of):
        raise HTTPException(
            422,
            f"대상 월 {period}은 거래 기준일 "
            f"{as_of.transaction_as_of.isoformat()} 이후라 비교할 수 없습니다.",
        )
    scope = await load_single_period_scope(db, as_of=as_of, period=period)
    classification = scope_classification(scope)
    status, status_reasons = resolve_status(
        as_of=as_of,
        scope=scope,
        classification=classification,
        non_krw_count=context.non_krw_count,
    )
    state = scope.periods[0] if scope.periods else None
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
    actuals = (
        await _spending_actuals(db, period=period)
        if has_actual and period is not None
        else {}
    )
    targets = (
        set(actuals)
        | set(latest)
        | {("adjustability", value) for value in ADJUSTABILITY_VALUES}
    )
    comparisons = []
    for kind, value in sorted(targets):
        revision = latest.get((kind, value))
        limit_amount = revision.amount if revision else None
        actual, one_off_amount = actuals.get((kind, value), (0, 0))
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
                actual_amount=actual if has_actual else None,
                one_off_amount=one_off_amount if has_actual else None,
                limit_amount=limit_amount,
                limit_revision_id=revision.id if revision else None,
                effective_from_period=revision.effective_from_period
                if revision
                else None,
                difference_amount=actual - limit_amount
                if missing is None and limit_amount is not None
                else None,
                missing_reason=missing,
                missing_reason_label=MISSING_LABELS.get(missing),
            )
        )
    annual_items = []
    annual_reason = "incomplete_twelve_month_window"
    start = end = None
    if period is not None:
        start, end = shift_period(period, -11), period
        if state and state.month_status == "in_progress":
            annual_reason = "month_in_progress"
        elif (
            first_date is not None
            and first_period is not None
            and has_actual
            and (
                first_period < start or (first_period == start and first_date.day == 1)
            )
        ):
            observed = await load_periods_with_data(
                db, start_period=start, end_period=end
            )
            if all(month in observed for month in period_range(start, end)):
                annual_reason = None
                annual_items = await _annual_equivalents(db, start=start, end=end)
    basis = ReadBasis(
        definition="spending_reference.v1",
        scope="과거 유효 KRW 지출(환불 차감, 대출 포함). 대분류와 조정 가능성은 겹치는 두 보기이며 합산하지 않습니다.",
        rules={
            **basis_rules(flow_inclusion()),
            "annual_like": "대상 마감월로 끝나는 완전한 12개월 창에서 일회성을 먼저 제외한 월 순지출이 양수인 달이 정확히 1~2개인 유효 대분류·소분류 쌍(observed_pattern). null·빈 소분류는 소분류 없음 쌍으로 묶음. 월중 시작 첫 달·자료 없는 달을 포함한 창은 판정하지 않음. T057 기여 목록은 변경하지 않음.",
            "registered_yearly_commitment": "사람이 cycle=yearly로 지정한 약정(기존 이행 묶음을 편집한 경우 포함)에 흐름표가 귀속한 지출 줄을 약정 ID·유효 대분류·소분류별로 별도 표시. 주기·분류를 자동 지정하지 않으며 관측된 12개월 순액을 제공(0·음수도 환불 순액 그대로).",
            "annual_deduplication": "전체 쌍의 양수 순지출 월 수로 패턴을 판정한 뒤, 등록 연간 약정에 귀속된 구매·환불 줄을 패턴 금액에서 제외. 남은 지출 줄이 없으면 쌍을 생략. 줄이 남으면 0·음수 순액도 그대로 표시. 약정 항목은 같은 줄을 한 번만 포함.",
            "annual_list": "12개월 순액 내림차순, 대분류·소분류·source·약정 ID 순으로 동률 해소. 전체 목록 반환, 제한·잘림 없음. observed_periods는 각 항목의 차감 후 월 순액이 양수인 달을 오름차순으로 표시.",
            "monthly_equivalent": "12개월 순액 ÷ 12, 원 단위 사사오입. 참고값이며 total_outflow·한도 대비 실적에 더하거나 대체하지 않음. 진행월에는 제공하지 않음.",
            "limit_history": HISTORY_RULE,
            "comparison": "자료가 있는 완전한 마감월에만 실적 − 해당 월 한도. 미설정·한도 해제·진행월·부분월·자료 없음은 null과 missing_reason. 한도끼리 합산하지 않음.",
        },
        field_scopes={
            "data.total_outflow": "선택 월의 기존 월 흐름표 총지급(진행월은 관측 누적).",
            "data.comparisons[].actual_amount": "선택 월의 유효 KRW 지출 줄 순액(일회성 포함). 자료 있는 달의 거래 없는 대상은 0원.",
            "data.comparisons[].one_off_amount": "같은 대상·월의 실적 중 일회성 순액.",
            "data.annual_items": "window_start_period~window_end_period의 관측 패턴 쌍과 사람이 등록한 연간 약정별 관측 순액. 한도 비교와 별도.",
        },
        assumptions=[
            "한도 금액·대상·시작월은 사람이 직접 입력합니다. 추천·남은 예산·적립 계획을 만들지 않습니다."
        ],
    )
    return ReadSpendingReferenceResponse(
        surface="spending_reference",
        surface_label="연간성 지출 참고와 한도 대비",
        questions=["Q1", "Q3"],
        status=status,
        status_label=STATUS_LABELS[status],
        status_reasons=status_reasons,
        as_of=read_as_of(as_of),
        period_scope=scope,
        classification=classification,
        basis=basis,
        labels={
            **flow_labels(),
            "target_kind.category": "카테고리 (대분류)",
            "target_kind.adjustability": "조정 가능성",
        },
        data=SpendingReferenceData(
            period=period,
            total_outflow=state.total_outflow if state and has_actual else None,
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
