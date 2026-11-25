"""Comparison contract (T057, Implentation-plan.md 2.4).

One rule set for every comparison:

- Target period vs baseline period. The default baseline is the median of the
  most recent 6 closed months before the target. A closed month is one the
  transaction data covers through its last day (``vw_metric_as_of``).
- The user can set a baseline start date (``analytics.comparison``); only
  months on/after it count as baseline. Changing it changes every comparison.
- An in-progress target is compared only with the same elapsed days of the
  baseline months (day 1 through the transaction as-of day). No ratio metrics
  and no full-previous-month delta for an in-progress target.
- A month with no effective transactions is "no data": it is skipped, never
  counted as 0. A month with data but no amount for an item counts as 0.
- Spending seen in only one or two of the last 12 months is compared over a
  12-month window instead of month by month.
- Change lists are ordered by won contribution, not by percent.

Every amount is a SQL aggregate over ``vw_metric_flow_lines`` (the same lines
as the monthly flow and the spend cube). Python only takes medians of those
SQL aggregates and assembles the response.
"""

from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from statistics import median

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.one_off_event import OneOffEvent
from app.schemas.comparison import (
    BaselineMethod,
    ComparisonAdjustabilityView,
    ComparisonBasis,
    ComparisonLevel,
    ComparisonMeasure,
    ComparisonMonthlyFlowResponse,
    ComparisonRatio,
    ComparisonSkippedMonth,
    ComparisonValue,
    ContributionItem,
    ContributionResponse,
    OneOffContributionItem,
    OneOffContributionReference,
    OneOffMode,
    TwelveMonthWindowBasis,
)
from app.schemas.metrics import MetricAsOf
from app.services.metric_views import (
    EXPENSE,
    FLOW_LINES_VIEW,
    day_of_month,
    flow_summary_columns,
)
from app.services.metrics_service import (
    MetricContext,
    build_flow_contract,
    load_metric_context,
    month_data_coverage,
    month_status,
    period_filters,
    ratio,
)
from app.services.settings_service import (
    DEFAULT_COMPARISON_BASELINE_MONTHS,
    baseline_start_period,
    get_comparison_settings,
)

COMPARISON_DEFINITION = "comparison.v1"
TWELVE_MONTHS = 12
UNCLASSIFIED = "미분류"

_LINES = FLOW_LINES_VIEW


@dataclass(frozen=True, slots=True)
class ComparisonWindow:
    """Resolved target and baseline months for one comparison."""

    context: MetricContext
    target_period: str | None
    target_status: str | None
    target_has_data: bool
    target_start: date | None
    target_end: date | None
    cutoff_day: int | None
    baseline_periods: tuple[str, ...]
    skipped_periods: tuple[str, ...]
    baseline_months_requested: int
    limited_by: str | None
    baseline_start_date: date | None
    baseline_start_period: str | None
    first_data_period: str | None
    first_data_mid_month: bool
    first_full_period: str | None = None
    periods_with_data: frozenset[str] = field(default_factory=frozenset)

    @property
    def as_of(self) -> MetricAsOf:
        return self.context.as_of

    @property
    def is_partial(self) -> bool:
        return self.cutoff_day is not None

    @property
    def is_in_progress(self) -> bool:
        return self.target_status == "in_progress"


# --------------------------------------------------------------------------
# Period helpers.
# --------------------------------------------------------------------------


def period_of(value: date) -> str:
    return value.strftime("%Y-%m")


def shift_period(period: str, months: int) -> str:
    year, month = (int(part) for part in period.split("-"))
    index = year * 12 + (month - 1) + months
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def period_start(period: str) -> date:
    return date.fromisoformat(f"{period}-01")


def period_end(period: str) -> date:
    return date.fromisoformat(f"{shift_period(period, 1)}-01") - timedelta(days=1)


def period_range(start: str, end: str) -> list[str]:
    periods: list[str] = []
    current = start
    while current <= end:
        periods.append(current)
        current = shift_period(current, 1)
    return periods


def median_won(values: list[int]) -> int | None:
    """Median in won; an even count averages the middle two, rounded half up."""
    if not values:
        return None
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    pair = Decimal(ordered[middle - 1] + ordered[middle]) / 2
    return int(pair.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _difference(target: int | None, baseline: int | None) -> int | None:
    if target is None or baseline is None:
        return None
    return target - baseline


# --------------------------------------------------------------------------
# Window resolution.
# --------------------------------------------------------------------------


async def load_periods_with_data(
    db_session: AsyncSession,
    *,
    start_period: str | None = None,
    end_period: str | None = None,
) -> frozenset[str]:
    """Months with at least one effective KRW line (anything else is no data)."""
    query = (
        select(_LINES.c.period)
        .where(*period_filters(_LINES.c.period, start_period, end_period))
        .distinct()
    )
    return frozenset(await db_session.scalars(query))


async def resolve_comparison_window(
    db_session: AsyncSession,
    *,
    target_period: str | None = None,
    through_date: date | None = None,
    baseline_months: int = DEFAULT_COMPARISON_BASELINE_MONTHS,
) -> ComparisonWindow:
    """Target month, the date it is counted through, and its baseline months.

    ``through_date`` lets a legacy endpoint keep an explicit end date inside
    the target month; it never extends past the transaction as-of date.
    """
    context = await load_metric_context(db_session)
    as_of = context.as_of
    settings = await get_comparison_settings(db_session)
    start_date = settings.baseline_start_date
    start_period = baseline_start_period(start_date)
    requested = max(1, baseline_months)
    if as_of.transaction_as_of is None or as_of.first_transaction_date is None:
        return ComparisonWindow(
            context=context,
            target_period=target_period,
            target_status=None,
            target_has_data=False,
            target_start=None,
            target_end=None,
            cutoff_day=None,
            baseline_periods=(),
            skipped_periods=(),
            baseline_months_requested=requested,
            limited_by="data_start",
            baseline_start_date=start_date,
            baseline_start_period=start_period,
            first_data_period=None,
            first_data_mid_month=False,
        )

    first_period = period_of(as_of.first_transaction_date)
    first_mid_month = as_of.first_transaction_date.day != 1
    # A first month whose data starts mid-month is not a full month, so it is
    # never used as a median baseline month or inside a 12-month window.
    first_full_period = (
        shift_period(first_period, 1) if first_mid_month else first_period
    )
    as_of_period = period_of(as_of.transaction_as_of)
    if target_period is None:
        closed = as_of.last_closed_period
        target_period = (
            closed if closed is not None and closed >= first_period else as_of_period
        )
    if target_period > as_of_period:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"대상 월 {target_period}은 거래 기준일 "
                f"{as_of.transaction_as_of.isoformat()} 이후라 비교할 수 없습니다."
            ),
        )
    periods_with_data = await load_periods_with_data(
        db_session, end_period=target_period
    )

    target_status = month_status(target_period, as_of)
    target_start = period_start(target_period)
    month_last = period_end(target_period)
    target_end = (
        as_of.transaction_as_of if target_status == "in_progress" else month_last
    )
    if through_date is not None and target_start <= through_date < target_end:
        target_end = through_date
    cutoff_day = target_end.day if target_end != month_last else None

    baseline: list[str] = []
    skipped: list[str] = []
    limited_by: str | None = None
    candidate = shift_period(target_period, -1)
    while len(baseline) < requested:
        if candidate < first_full_period:
            limited_by = "data_start"
            break
        if start_period is not None and candidate < start_period:
            limited_by = "baseline_start_date"
            break
        if candidate in periods_with_data:
            baseline.append(candidate)
        else:
            skipped.append(candidate)
        candidate = shift_period(candidate, -1)

    return ComparisonWindow(
        context=context,
        target_period=target_period,
        target_status=target_status,
        target_has_data=target_period in periods_with_data,
        target_start=target_start,
        target_end=target_end,
        cutoff_day=cutoff_day,
        baseline_periods=tuple(sorted(baseline)),
        skipped_periods=tuple(sorted(skipped)),
        baseline_months_requested=requested,
        limited_by=limited_by if len(baseline) < requested else None,
        baseline_start_date=start_date,
        baseline_start_period=start_period,
        first_data_period=first_period,
        first_data_mid_month=first_mid_month,
        first_full_period=first_full_period,
        periods_with_data=periods_with_data,
    )


def previous_month_window(window: ComparisonWindow) -> ComparisonWindow:
    """The same window with the previous full month as the only baseline.

    Same contract rules as the median baseline (T057): only a month before the
    target, never before the first full data month (``first_full_period``,
    so a mid-month first month is excluded) or the user's baseline start, and
    never a month without effective transactions. An in-progress target keeps
    its same-elapsed-days cut. Without a usable month the baseline is empty
    and every baseline value is withheld (null) with
    ``baseline_unavailable_reason``.
    """
    if window.target_period is None:
        return replace(window, baseline_periods=(), skipped_periods=())
    previous = shift_period(window.target_period, -1)
    baseline: tuple[str, ...] = ()
    skipped: tuple[str, ...] = ()
    limited_by: str | None = None
    if window.first_full_period is None or previous < window.first_full_period:
        limited_by = "data_start"
    elif (
        window.baseline_start_period is not None
        and previous < window.baseline_start_period
    ):
        limited_by = "baseline_start_date"
    elif previous not in window.periods_with_data:
        skipped = (previous,)
        limited_by = "no_data"
    else:
        baseline = (previous,)
    return replace(
        window,
        baseline_periods=baseline,
        skipped_periods=skipped,
        baseline_months_requested=1,
        limited_by=limited_by,
    )


async def resolve_window_for_baseline(
    db_session: AsyncSession,
    *,
    target_period: str | None,
    baseline: BaselineMethod,
) -> ComparisonWindow:
    window = await resolve_comparison_window(db_session, target_period=target_period)
    if baseline == "previous_month":
        return previous_month_window(window)
    return window


def build_comparison_basis(
    window: ComparisonWindow,
    *,
    method: BaselineMethod = "median_of_recent_closed_months",
    baseline_periods: list[str] | None = None,
) -> ComparisonBasis:
    periods = (
        list(window.baseline_periods) if baseline_periods is None else baseline_periods
    )
    count = len(periods)
    requested = 1 if method == "previous_month" else window.baseline_months_requested
    if count == 0:
        baseline_status = "none"
    elif count < requested:
        baseline_status = "fewer_than_requested"
    else:
        baseline_status = "full"
    in_progress = window.is_in_progress
    if not window.target_has_data:
        note = "대상 월에 관측된 거래가 없어 증감을 계산하지 않았습니다."
    elif window.is_partial:
        reason = "진행월이라" if in_progress else "요청한 종료일이 말일이 아니어서"
        note = (
            f"{reason} 대상 월과 기준 월 모두 1일부터 {window.cutoff_day}일까지의 "
            "누적만 비교했습니다. 이 날짜가 없는 짧은 달은 그 달 전체를 썼습니다."
        )
    else:
        note = "대상 월이 마감월이라 월 전체를 비교했습니다."
    first_in_baseline = (
        window.first_data_mid_month and window.first_data_period in periods
    )
    if first_in_baseline:
        note += (
            f" 기준 기간에 든 {window.first_data_period}는 자료가 월중에 시작된 "
            "첫 달입니다."
        )
    if window.target_period is None:
        target_data_coverage, coverage_reasons = None, []
    else:
        target_data_coverage, coverage_reasons = month_data_coverage(
            window.target_period,
            first_transaction_date=window.as_of.first_transaction_date,
            transaction_as_of=window.as_of.transaction_as_of,
            has_transactions=window.target_has_data,
        )
    if count:
        unavailable_reason = None
    elif window.limited_by is not None:
        unavailable_reason = window.limited_by
    else:
        unavailable_reason = "no_data" if window.skipped_periods else "data_start"
    return ComparisonBasis(
        definition=COMPARISON_DEFINITION,
        target_period=window.target_period,
        target_month_status=window.target_status,  # type: ignore[arg-type]
        target_coverage=(
            None
            if window.target_period is None
            else "observed"
            if window.target_has_data
            else "no_data"
        ),
        target_start_date=window.target_start,
        target_end_date=window.target_end,
        baseline_method=method,
        baseline_method_label=(
            "전월(같은 경과일)"
            if method == "previous_month" and window.is_partial
            else "전월"
            if method == "previous_month"
            else f"최근 {window.baseline_months_requested}개 마감월 중앙값"
        ),
        baseline_months_requested=requested,
        baseline_periods=periods,
        baseline_month_count=count,
        baseline_status=baseline_status,
        baseline_limited_by=(
            window.limited_by  # type: ignore[arg-type]
            if baseline_status != "full"
            and window.limited_by in ("data_start", "baseline_start_date")
            else None
        ),
        baseline_start_date=window.baseline_start_date,
        baseline_start_period=window.baseline_start_period,
        first_data_period=window.first_data_period,
        first_data_period_starts_mid_month=window.first_data_mid_month,
        skipped_periods=[
            ComparisonSkippedMonth(period=period, reason="no_data")
            for period in window.skipped_periods
        ],
        partial_month_handling=(
            "same_elapsed_days" if window.is_partial else "closed_month_full"
        ),
        elapsed_day=window.cutoff_day,
        partial_month_note=note,
        ratio_metrics_available=not in_progress and window.target_period is not None,
        previous_full_month_delta_available=(
            window.target_period is not None
            and not window.is_partial
            and window.target_has_data
            and count > 0
        ),
        baseline_unavailable_reason=unavailable_reason,  # type: ignore[arg-type]
        target_data_coverage=target_data_coverage,  # type: ignore[arg-type]
        target_data_coverage_reasons=coverage_reasons,  # type: ignore[arg-type]
    )


def window_line_filters(
    window: ComparisonWindow, periods: list[str]
) -> list[ColumnElement[bool]]:
    """Flow-line filters for the given months under the window's day cut."""
    filters: list[ColumnElement[bool]] = [_LINES.c.period.in_(periods)]
    if window.target_end is not None:
        filters.append(_LINES.c.date <= window.target_end)
    if window.cutoff_day is not None:
        filters.append(day_of_month(_LINES.c.date) <= window.cutoff_day)
    return filters


def category_key(column: ColumnElement | None = None) -> ColumnElement:
    source = _LINES.c.effective_category_major if column is None else column
    return func.coalesce(func.nullif(source, ""), UNCLASSIFIED)


def merchant_key() -> ColumnElement:
    return func.coalesce(func.nullif(_LINES.c.merchant, ""), UNCLASSIFIED)


async def grouped_period_amounts(
    db_session: AsyncSession,
    window: ComparisonWindow,
    *,
    keys: list[ColumnElement],
    amount: ColumnElement,
    filters: list[ColumnElement[bool]],
) -> dict[tuple, int]:
    """``{(period, *key values): SQL sum}`` for target and baseline months."""
    if window.target_period is None:
        return {}
    periods = [*window.baseline_periods, window.target_period]
    labelled = [key.label(f"key_{index}") for index, key in enumerate(keys)]
    total = func.coalesce(func.sum(amount), 0)
    query = (
        select(_LINES.c.period, *labelled, total.label("amount"))
        .where(*filters, *window_line_filters(window, periods))
        .group_by(_LINES.c.period, *labelled)
    )
    return {
        (row[0], *row[1:-1]): int(row[-1])
        for row in (await db_session.execute(query)).all()
    }


# --------------------------------------------------------------------------
# Month-total comparison along the monthly-flow rows.
# --------------------------------------------------------------------------

FLOW_MEASURES: tuple[tuple[str, str], ...] = (
    ("income_total", "수입"),
    ("committed_loan_total", "약정 지급 · 대출 원리금"),
    ("committed_installment_total", "약정 지급 · 할부 회차"),
    ("committed_recurring_total", "약정 지급 · 정기 지급"),
    ("committed_total", "약정 지급 합계"),
    ("ad_hoc_protected_total", "수시 지출 · 보호"),
    ("ad_hoc_adjustable_total", "수시 지출 · 조정 가능"),
    ("undecided_total", "미정"),
    ("total_outflow", "총지급"),
    ("living_spend", "생활 지출"),
    ("protected_spend", "보호 지출"),
    ("adjustable_spend", "조정 가능 지출"),
    ("adjustability_undecided_total", "조정 가능성 미정 지출"),
    ("residual", "잔여"),
    ("transfer_net", "이체 순액"),
    ("one_off_total", "총지급 중 일회성"),
    ("ongoing_outflow", "경상 지급"),
    ("ongoing_living_spend", "경상 생활 지출"),
)


async def get_monthly_flow_comparison(
    db_session: AsyncSession,
    *,
    period: str | None,
    baseline: BaselineMethod = "median_of_recent_closed_months",
) -> ComparisonMonthlyFlowResponse:
    window = await resolve_window_for_baseline(
        db_session, target_period=period, baseline=baseline
    )
    totals: dict[str, dict[str, int]] = {}
    if window.target_period is not None:
        periods = [*window.baseline_periods, window.target_period]
        query = (
            select(_LINES.c.period, *flow_summary_columns(_LINES))
            .where(*window_line_filters(window, periods))
            .group_by(_LINES.c.period)
        )
        for row in (await db_session.execute(query)).mappings():
            totals[row["period"]] = {key: int(row[key]) for key, _ in FLOW_MEASURES}
    target = totals.get(window.target_period or "")
    measures = []
    for key, label in FLOW_MEASURES:
        # Every baseline month has data by construction; the target may not.
        values = [
            ComparisonValue(period=period, amount=totals.get(period, {}).get(key, 0))
            for period in window.baseline_periods
        ]
        target_amount = target[key] if target is not None else None
        baseline_amount = median_won([value.amount for value in values])
        measures.append(
            ComparisonMeasure(
                key=key,
                label=label,
                target_amount=target_amount,
                baseline_amount=baseline_amount,
                change_amount=_difference(target_amount, baseline_amount),
                baseline_values=values,
            )
        )
    residual_rate: ComparisonRatio | None = None
    if window.target_period is not None and not window.is_in_progress:
        rates = [
            rate
            for period in window.baseline_periods
            if (
                rate := ratio(
                    totals.get(period, {}).get("residual", 0),
                    totals.get(period, {}).get("income_total", 0),
                )
            )
            is not None
        ]
        residual_rate = ComparisonRatio(
            target_rate=(
                ratio(target["residual"], target["income_total"])
                if target is not None
                else None
            ),
            baseline_rate=round(median(rates), 4) if rates else None,
        )
    contract = await build_flow_contract(
        db_session,
        definition=f"{COMPARISON_DEFINITION}.monthly_flow",
        scope=(
            "월 흐름표 줄별 대상 월 금액과 기준 기간 중앙값의 비교. 금액은 "
            "vw_metric_flow_lines에서 월 흐름표와 같은 식으로 집계"
        ),
        start_date=window.target_start,
        end_date=window.target_end,
        context=window.context,
        field_scopes={
            "measures[].target_amount": "대상 월(진행월이면 거래 기준일까지) 금액",
            "measures[].baseline_amount": "기준 기간 월별 금액의 중앙값(같은 경과일 규칙 적용)",
            "ongoing_outflow": "월별 총지급에서 일회성 순지출을 차감한 뒤 기준월 중앙값 계산",
            "ongoing_living_spend": "월별 생활 지출에서 일회성 순지출을 차감한 뒤 기준월 중앙값 계산",
            "measures[].change_amount": "target_amount − baseline_amount (원)",
            "residual_rate": "현금 잔여율 = residual ÷ income_total. 마감월 대상에만",
        },
    )
    return ComparisonMonthlyFlowResponse(
        contract=contract,
        comparison=build_comparison_basis(window, method=baseline),
        measures=measures,
        residual_rate=residual_rate,
    )


# --------------------------------------------------------------------------
# Change contributions by category (and merchant within category).
# --------------------------------------------------------------------------


def adjustability_filters(
    view: ComparisonAdjustabilityView,
) -> list[ColumnElement[bool]]:
    if view == "all":
        return []
    return [_LINES.c.adjustability == view]


def _sort_items(items: list[ContributionItem]) -> list[ContributionItem]:
    with_change = [item for item in items if item.change_amount is not None]
    without = [item for item in items if item.change_amount is None]
    with_change.sort(
        key=lambda item: (
            -abs(item.change_amount or 0),
            -item.target_amount,
            item.category,
            item.merchant or "",
        )
    )
    without.sort(
        key=lambda item: (-item.target_amount, item.category, item.merchant or "")
    )
    return with_change + without


async def _one_off_reference(
    db_session: AsyncSession,
    window: ComparisonWindow,
    filters: list[ColumnElement[bool]],
    mode: OneOffMode,
) -> OneOffContributionReference:
    event_id = _LINES.c.one_off_event_id
    grouped = await grouped_period_amounts(
        db_session,
        window,
        keys=[event_id],
        amount=-_LINES.c.amount,
        filters=[*filters, event_id.is_not(None)],
    )
    totals: dict[str, int] = {}
    target: dict[int, int] = {}
    for (period, key), amount in grouped.items():
        totals[period] = totals.get(period, 0) + amount
        if period == window.target_period:
            target[key] = amount
    events = (
        await db_session.execute(
            select(OneOffEvent.id, OneOffEvent.name).where(OneOffEvent.id.in_(target))
        )
        if target
        else ()
    )
    items = [
        OneOffContributionItem(event_id=key, name=name, amount=target[key])
        for key, name in events
    ]
    return OneOffContributionReference(
        mode=mode,
        target_total=totals.get(window.target_period or "", 0)
        if window.target_has_data
        else None,
        target_events=sorted(
            items, key=lambda item: (-abs(item.amount), item.event_id)
        ),
        baseline_values=[
            ComparisonValue(period=period, amount=totals.get(period, 0))
            for period in window.baseline_periods
        ],
    )


async def get_change_contributions(
    db_session: AsyncSession,
    *,
    period: str | None,
    adjustability: ComparisonAdjustabilityView,
    level: ComparisonLevel,
    category: str | None,
    limit: int | None,
    baseline: BaselineMethod = "median_of_recent_closed_months",
    one_off: OneOffMode = "exclude",
) -> ContributionResponse:
    """``limit=None`` returns every item (the read surface counts and cuts)."""
    window = await resolve_window_for_baseline(
        db_session, target_period=period, baseline=baseline
    )
    # Against one previous month every item is compared month by month, so
    # the items add up to change_total; the 12-month view is reported as is.
    split_annual_like = baseline != "previous_month"
    base_filters: list[ColumnElement[bool]] = [
        _LINES.c.type == EXPENSE,
        *adjustability_filters(adjustability),
    ]
    if category is not None:
        base_filters.append(category_key() == category)
    reference = await _one_off_reference(db_session, window, base_filters, one_off)
    if one_off == "exclude":
        base_filters.append(_LINES.c.one_off_event_id.is_(None))
    keys = [category_key()] if level == "category" else [category_key(), merchant_key()]
    spend = -_LINES.c.amount

    monthly = (
        await grouped_period_amounts(
            db_session, window, keys=keys, amount=spend, filters=base_filters
        )
        if window.target_has_data
        else {}
    )
    period_totals = await grouped_period_amounts(
        db_session, window, keys=[], amount=spend, filters=base_filters
    )
    twelve_basis, twelve = await _twelve_month_amounts(
        db_session, window, keys=keys, filters=base_filters
    )

    target_period = window.target_period
    baseline_periods = list(window.baseline_periods)
    item_keys = {key[1:] for key in monthly} | set(twelve)
    monthly_items: list[ContributionItem] = []
    twelve_items: list[ContributionItem] = []
    for item_key in item_keys:
        target_month_amount = monthly.get((target_period, *item_key), 0)
        stats = twelve.get(item_key)
        active = stats["active_months"] if stats is not None else 0
        names = {
            "category": item_key[0],
            "merchant": item_key[1] if level == "merchant" else None,
        }
        annual_like = twelve_basis.target_window_complete and 1 <= active <= 2
        if annual_like and stats is not None:
            baseline_amount = (
                stats["baseline_amount"]
                if twelve_basis.baseline_window_available
                else None
            )
            twelve_items.append(
                ContributionItem(
                    **names,
                    cadence="annual_like",
                    window="twelve_month",
                    target_amount=stats["target_amount"],
                    target_period_amount=target_month_amount,
                    baseline_amount=baseline_amount,
                    change_amount=_difference(stats["target_amount"], baseline_amount),
                    active_months_in_window=active,
                    baseline_note=(
                        None
                        if twelve_basis.baseline_window_available
                        else "직전 12개월 창을 쓸 수 없어 기준값이 없습니다."
                    ),
                )
            )
            if split_annual_like:
                continue
        values = [monthly.get((period, *item_key), 0) for period in baseline_periods]
        baseline_amount = median_won(values)
        if target_month_amount == 0 and not baseline_amount:
            continue
        monthly_items.append(
            ContributionItem(
                **names,
                cadence="annual_like"
                if annual_like and stats is not None
                else "monthly",
                window="monthly",
                target_amount=target_month_amount,
                target_period_amount=target_month_amount,
                baseline_amount=baseline_amount,
                change_amount=_difference(target_month_amount, baseline_amount),
                baseline_observed_month_count=sum(1 for value in values if value),
                baseline_zero_month_count=sum(1 for value in values if not value),
                active_months_in_window=active,
                baseline_note=(
                    None if baseline_periods else "기준 기간이 없어 기준값이 없습니다."
                ),
            )
        )

    target_total = (
        period_totals.get((target_period,), 0)
        if target_period is not None and window.target_has_data
        else None
    )
    baseline_total = median_won(
        [period_totals.get((period,), 0) for period in baseline_periods]
    )
    contract = await build_flow_contract(
        db_session,
        definition=f"{COMPARISON_DEFINITION}.contributions",
        scope=(
            "지출 변화의 금액 기여. 유효 KRW 지출 순액(환불 차감, 대출 포함)을 "
            "카테고리(또는 카테고리 안의 거래처)별로 vw_metric_flow_lines에서 집계하고 "
            "기준 기간 중앙값과 비교. 조정 가능성 보기: all = 전체(미정 포함), "
            "protected = 보호, adjustable = 조정 가능. "
            + (
                "유효 일회성을 뺀 경상 지출 비교."
                if one_off == "exclude"
                else "유효 일회성을 포함한 지출 비교."
            )
        ),
        start_date=window.target_start,
        end_date=window.target_end,
        context=window.context,
        field_scopes={
            "items[].target_amount": "거래가 관측된 대상 월의 항목별 금액. 대상 월 자체에 자료가 없으면 목록을 비움",
            "items[].change_amount": "target_amount − baseline_amount (원), 정렬은 절댓값 내림차순",
            "twelve_month_items[].target_amount": "대상 월로 끝나는 12개월 합계",
            "twelve_month_items[].baseline_amount": "그 직전 12개월 합계",
            "baseline_total": "이 보기의 월 합계 중앙값. 항목 중앙값의 합과 다를 수 있음",
            "one_off": "같은 범위·카테고리·조정 가능성·경과일의 게시월 일회성 순지출",
        },
    )
    return ContributionResponse(
        contract=contract,
        comparison=build_comparison_basis(window, method=baseline),
        adjustability=adjustability,
        level=level,
        category=category,
        target_total=target_total,
        baseline_total=baseline_total,
        change_total=_difference(target_total, baseline_total),
        one_off=reference,
        items=_sort_items(monthly_items)[:limit],
        twelve_month_window=twelve_basis,
        twelve_month_items=_sort_items(twelve_items)[:limit],
    )


async def _twelve_month_amounts(
    db_session: AsyncSession,
    window: ComparisonWindow,
    *,
    keys: list[ColumnElement],
    filters: list[ColumnElement[bool]],
) -> tuple[TwelveMonthWindowBasis, dict[tuple, dict[str, int]]]:
    target_period = window.target_period
    if target_period is None:
        return (
            TwelveMonthWindowBasis(
                target_window_start_period=None,
                target_window_end_period=None,
                baseline_window_start_period=None,
                baseline_window_end_period=None,
                target_window_complete=False,
                baseline_window_available=False,
                baseline_window_unavailable_reason="data_start",
            ),
            {},
        )
    target_start = shift_period(target_period, -(TWELVE_MONTHS - 1))
    baseline_end = shift_period(target_period, -TWELVE_MONTHS)
    baseline_start = shift_period(baseline_end, -(TWELVE_MONTHS - 1))
    target_window = period_range(target_start, target_period)
    baseline_window = period_range(baseline_start, baseline_end)
    first_period = window.first_full_period or target_period
    target_complete = target_start >= first_period and all(
        period in window.periods_with_data for period in target_window
    )
    reason: str | None = None
    if baseline_start < first_period:
        reason = "data_start"
    elif (
        window.baseline_start_period is not None
        and baseline_start < window.baseline_start_period
    ):
        reason = "baseline_start_date"
    elif not all(period in window.periods_with_data for period in baseline_window):
        reason = "no_data"
    basis = TwelveMonthWindowBasis(
        target_window_start_period=target_start,
        target_window_end_period=target_period,
        baseline_window_start_period=baseline_start,
        baseline_window_end_period=baseline_end,
        target_window_complete=target_complete,
        baseline_window_available=reason is None,
        baseline_window_unavailable_reason=reason,  # type: ignore[arg-type]
    )

    if not window.target_has_data:
        return basis, {}

    labelled = [key.label(f"key_{index}") for index, key in enumerate(keys)]
    line_filters: list[ColumnElement[bool]] = [
        *filters,
        _LINES.c.period.in_([*baseline_window, *target_window]),
    ]
    if window.target_end is not None:
        line_filters.append(_LINES.c.date <= window.target_end)
    if window.cutoff_day is not None:
        # The same position in the baseline window is cut at the same day.
        line_filters.append(
            ~and_(
                _LINES.c.period == baseline_end,
                day_of_month(_LINES.c.date) > window.cutoff_day,
            )
        )
    monthly = (
        select(
            _LINES.c.period.label("period"),
            *labelled,
            func.coalesce(func.sum(-_LINES.c.amount), 0).label("amount"),
        )
        .where(*line_filters)
        .group_by(_LINES.c.period, *labelled)
        .subquery("item_months")
    )
    key_columns = [monthly.c[f"key_{index}"] for index in range(len(keys))]
    in_target = monthly.c.period.in_(target_window)
    in_baseline = monthly.c.period.in_(baseline_window)
    query = select(
        *key_columns,
        func.count(case((and_(in_target, monthly.c.amount > 0), 1))).label(
            "active_months"
        ),
        func.coalesce(func.sum(case((in_target, monthly.c.amount), else_=0)), 0).label(
            "target_amount"
        ),
        func.coalesce(
            func.sum(case((in_baseline, monthly.c.amount), else_=0)), 0
        ).label("baseline_amount"),
    ).group_by(*key_columns)
    result: dict[tuple, dict[str, int]] = {}
    for row in (await db_session.execute(query)).mappings():
        item_key = tuple(row[f"key_{index}"] for index in range(len(keys)))
        result[item_key] = {
            "active_months": int(row["active_months"]),
            "target_amount": int(row["target_amount"]),
            "baseline_amount": int(row["baseline_amount"]),
        }
    return basis, result
