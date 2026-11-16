import math
from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta
from typing import NotRequired, TypedDict

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, not_, select, literal
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.purchase_gate_review import PurchaseGateReview
from app.schemas.analytics import (
    IncomeMonthlyItem,
    IncomeStabilityResponse,
    MerchantSpendItem,
    MerchantSpendResponse,
    MonthlyCashflowItem,
    MonthlyCashflowResponse,
    PaymentMethodPatternItem,
    PaymentMethodPatternsResponse,
    PurchaseGateCandidateItem,
    PurchaseGateCandidatesResponse,
    PurchaseGateReviewPatchRequest,
    PurchaseGateReviewResponse,
    SpendingAnomalyItem,
    SpendingAnomaliesResponse,
)
from app.schemas.settings import PurchaseGateSettings
from app.schemas.transaction import TransactionTypeFilter
from app.services.metric_views import (
    EXPENSE,
    FLOW_LINES_VIEW,
    INCOME,
    METRIC_CURRENCY,
    METRIC_TRANSACTIONS_VIEW,
    TRANSACTION_NATURE_VIEW,
    TRANSFER,
    day_of_month,
    flow_summary_columns,
)
from app.services.comparison_service import (
    ComparisonWindow,
    build_comparison_basis,
    grouped_period_amounts,
    median_won,
    period_start,
    resolve_comparison_window,
)
from app.services.metrics_service import (
    PURCHASE_NET_DEFINITION,
    build_flow_contract,
    build_purchase_net_contract,
    load_as_of,
    month_status,
)

_LINES = FLOW_LINES_VIEW
_NECESSITY_VALUES = ("essential", "discretionary")


class AnalyticsRow(TypedDict):
    id: int
    date: date
    time: time
    type: str
    amount: int
    merchant: str | None
    description: str
    payment_method: str | None
    effective_category_major: str | None
    effective_category_minor: str | None
    loan_account_id: int | None
    # T056 two axes resolved in vw_transaction_nature (the human classification
    # detectors decide from; the old columns above are only echoed).
    commitment_kind: str | None
    adjustability: str
    settlement_refund_total: NotRequired[int]


type PurchaseCandidateSignalValue = int | float | str | bool


class PurchaseCandidateBase(TypedDict):
    transaction_id: int
    date: date
    merchant: str
    amount: int
    category: str
    refund_total: int


class PurchaseCandidateAggregate(TypedDict):
    candidate_type: str
    candidate_types: list[str]
    base: PurchaseCandidateBase
    signals: dict[str, PurchaseCandidateSignalValue]
    risk_level: str
    reasons: list[str]


async def get_monthly_cashflow(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
) -> MonthlyCashflowResponse:
    totals = (
        select(_LINES.c.period, *flow_summary_columns(_LINES))
        .where(*_date_filters(start_date, end_date))
        .group_by(_LINES.c.period)
        .subquery("monthly_flow")
    )
    result = await db_session.execute(
        select(
            totals.c.period,
            totals.c.income_total,
            totals.c.total_outflow,
            totals.c.transfer_activity_total,
            totals.c.residual,
        ).order_by(totals.c.period.asc())
    )
    contract = await build_flow_contract(
        db_session,
        definition="monthly_cashflow.legacy_v1",
        scope="월별 수입·총지급·이체 활동. 월 흐름표(monthly_flow.v2)와 같은 줄에서 계산",
        start_date=start_date,
        end_date=end_date,
        field_scopes={
            "income": "income_total (수입, 이체 제외)",
            "expense": "total_outflow (총지급: 대출 원리금 포함, 환불은 게시월에서 차감)",
            "transfer": "transfer_activity_total (이체 절댓값 합, 수입·지출 아님)",
            "net_cashflow": "residual = income − expense",
            "savings_rate": "net_cashflow ÷ income. 비교 계약(T057)에 따라 마감월에만 내고 진행월은 null",
        },
    )
    items = []
    for row in result.mappings():
        income = int(row["income_total"])
        net_cashflow = int(row["residual"])
        row_status = month_status(row["period"], contract.as_of)
        items.append(
            MonthlyCashflowItem(
                period=row["period"],
                income=income,
                expense=int(row["total_outflow"]),
                transfer=int(row["transfer_activity_total"]),
                net_cashflow=net_cashflow,
                savings_rate=(
                    _safe_ratio(net_cashflow, income)
                    if row_status == "closed"
                    else None
                ),
                month_status=row_status,
            )
        )
    return MonthlyCashflowResponse(items=items, contract=contract)


async def _legacy_comparison_window(
    db_session: AsyncSession,
    *,
    as_of_period: str | None,
    target_period: str,
    through_date: date | None,
    baseline_months: int | None = None,
) -> ComparisonWindow | None:
    """Comparison-contract window for a legacy endpoint's target month.

    None when there is no data or the target is after the data's as-of month
    (legacy endpoints keep answering those requests without a contract basis).
    """
    if as_of_period is None or target_period > as_of_period:
        return None
    if baseline_months is None:
        return await resolve_comparison_window(
            db_session, target_period=target_period, through_date=through_date
        )
    return await resolve_comparison_window(
        db_session,
        target_period=target_period,
        through_date=through_date,
        baseline_months=baseline_months,
    )


async def get_merchant_spend(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    tx_type: TransactionTypeFilter,
    limit: int,
) -> MerchantSpendResponse:
    scope_filters = [*_date_filters(start_date, end_date), *_type_filters(tx_type)]
    merchant = func.coalesce(func.nullif(_LINES.c.merchant, ""), "미분류")
    totals = await db_session.execute(
        select(
            merchant.label("merchant"),
            func.coalesce(func.sum(_analytics_amount()), 0).label("amount"),
            func.count(_LINES.c.transaction_id.distinct()).label("count"),
        )
        .where(*scope_filters)
        .group_by(merchant)
    )
    ranked = (
        select(
            merchant.label("merchant"),
            _LINES.c.date,
            _LINES.c.time,
            func.row_number()
            .over(
                partition_by=merchant,
                order_by=(_LINES.c.date.desc(), _LINES.c.time.desc()),
            )
            .label("position"),
        )
        .where(*scope_filters)
        .subquery("ranked")
    )
    last_seen = {
        row["merchant"]: datetime.combine(_as_date(row["date"]), _as_time(row["time"]))
        for row in (
            await db_session.execute(
                select(ranked.c.merchant, ranked.c.date, ranked.c.time).where(
                    ranked.c.position == 1
                )
            )
        ).mappings()
    }
    items = [
        MerchantSpendItem(
            merchant=row["merchant"],
            amount=int(row["amount"]),
            count=int(row["count"]),
            avg_amount=round(int(row["amount"]) / int(row["count"]), 2),
            last_seen_at=last_seen[row["merchant"]],
        )
        for row in totals.mappings()
    ]
    items.sort(key=lambda item: (-item.amount, item.merchant))
    return MerchantSpendResponse(
        items=items[:limit],
        contract=await build_flow_contract(
            db_session,
            definition="merchant_spend.legacy_v1",
            scope=(
                "거래처별 금액(지출은 환불 차감 순액, 확정 정산된 환불은 원거래 거래처로 "
                "귀속). count는 서로 다른 거래 수"
            ),
            start_date=start_date,
            end_date=end_date,
        ),
    )


async def get_payment_method_patterns(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    tx_type: TransactionTypeFilter,
) -> PaymentMethodPatternsResponse:
    scope_filters = [*_date_filters(start_date, end_date), *_type_filters(tx_type)]
    method = func.coalesce(func.nullif(_LINES.c.payment_method, ""), "알 수 없음")
    grouped = await db_session.execute(
        select(
            method.label("payment_method"),
            func.coalesce(func.sum(_analytics_amount()), 0).label("amount"),
            func.count(_LINES.c.transaction_id.distinct()).label("count"),
        )
        .where(*scope_filters)
        .group_by(method)
    )
    total_amount = int(
        await db_session.scalar(
            select(func.coalesce(func.sum(_analytics_amount()), 0)).where(
                *scope_filters
            )
        )
        or 0
    )
    items = [
        PaymentMethodPatternItem(
            payment_method=row["payment_method"],
            total_amount=int(row["amount"]),
            transaction_count=int(row["count"]),
            avg_amount=round(int(row["amount"]) / int(row["count"]))
            if row["count"]
            else 0,
            pct_of_total=_safe_ratio(int(row["amount"]) * 100, total_amount),
        )
        for row in grouped.mappings()
    ]
    items.sort(key=lambda item: (-item.total_amount, item.payment_method))
    return PaymentMethodPatternsResponse(
        items=items,
        contract=await build_flow_contract(
            db_session,
            definition="payment_method_patterns.legacy_v1",
            scope=(
                "결제수단별 금액(지출은 환불 차감 순액, 확정 정산된 환불은 원거래 "
                "결제수단으로 귀속). transaction_count는 서로 다른 거래 수"
            ),
            start_date=start_date,
            end_date=end_date,
        ),
    )


async def get_income_stability(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
) -> IncomeStabilityResponse:
    used_last_closed_month = end_date is None
    ref_date = (
        _last_closed_month_end(date.today()) if used_last_closed_month else end_date
    )
    assert ref_date is not None
    partial_cutoff_day = ref_date.day if not _is_month_end(ref_date) else None

    filters: list[ColumnElement[bool]] = [
        _LINES.c.type == INCOME,
        *_date_filters(start_date, ref_date),
    ]
    if partial_cutoff_day is not None:
        filters.append(
            not_(
                and_(
                    _LINES.c.date < date(ref_date.year, ref_date.month, 1),
                    day_of_month(_LINES.c.date) > partial_cutoff_day,
                )
            )
        )
    result = await db_session.execute(
        select(
            _LINES.c.period,
            func.coalesce(func.sum(_LINES.c.amount), 0).label("income"),
        )
        .where(*filters)
        .group_by(_LINES.c.period)
        .order_by(_LINES.c.period.asc())
    )
    items = [
        IncomeMonthlyItem(period=row["period"], income=int(row["income"]))
        for row in result.mappings()
    ]
    values = [item.income for item in items]
    contract = await build_flow_contract(
        db_session,
        definition="income_stability.legacy_v1",
        scope="월별 수입(이체 제외) 합계와 그 변동성. 수입이 관측된 월만 포함",
        start_date=start_date,
        end_date=ref_date,
        include_undecided=False,
    )

    if not values:
        return IncomeStabilityResponse(
            items=[],
            avg=0,
            stdev=None,
            coefficient_of_variation=None,
            comparison_mode="partial" if partial_cutoff_day is not None else "closed",
            reference_date=ref_date,
            is_partial_period=partial_cutoff_day is not None,
            assumptions=_build_income_stability_assumptions(
                used_last_closed_month=used_last_closed_month,
                partial_cutoff_day=partial_cutoff_day,
                ref_date=ref_date,
            ),
            contract=contract,
        )

    avg = round(sum(values) / len(values))
    variance = sum((v - avg) ** 2 for v in values) / len(values)
    stdev = round(math.sqrt(variance), 2) if len(values) > 1 else None
    cv = round(stdev / avg, 4) if (stdev is not None and avg > 0) else None
    return IncomeStabilityResponse(
        items=items,
        avg=avg,
        stdev=stdev,
        coefficient_of_variation=cv,
        comparison_mode="partial" if partial_cutoff_day is not None else "closed",
        reference_date=ref_date,
        is_partial_period=partial_cutoff_day is not None,
        assumptions=_build_income_stability_assumptions(
            used_last_closed_month=used_last_closed_month,
            partial_cutoff_day=partial_cutoff_day,
            ref_date=ref_date,
        ),
        contract=contract,
    )


async def get_spending_anomalies(
    db_session: AsyncSession,
    *,
    end_date: date | None,
    baseline_months: int,
    anomaly_threshold: float,
    min_delta_amount: int = 100_000,
    page: int = 1,
    per_page: int = 10,
) -> SpendingAnomaliesResponse:
    """Category spend vs the comparison-contract baseline (T057).

    The baseline is the median of the most recent ``baseline_months`` closed
    months with data before the target (no-data months are skipped, not
    counted as 0), limited by the user's baseline start date. A partial target
    month compares the same elapsed days. The anomaly score formula is
    unchanged: |delta| ÷ stdev of the baseline months, or ÷ baseline when the
    stdev is 0.
    """
    used_last_closed_month = end_date is None
    as_of = await load_as_of(db_session)
    as_of_period = (
        _month_key(as_of.transaction_as_of)
        if as_of.transaction_as_of is not None
        else None
    )
    window: ComparisonWindow | None
    if end_date is None:
        window = (
            await resolve_comparison_window(db_session, baseline_months=baseline_months)
            if as_of_period is not None
            else None
        )
    else:
        window = await _legacy_comparison_window(
            db_session,
            as_of_period=as_of_period,
            target_period=_month_key(end_date),
            through_date=end_date,
            baseline_months=baseline_months,
        )
    if window is None or window.target_period is None or window.target_end is None:
        ref_date = end_date or _last_closed_month_end(date.today())
        target_period = _month_key(ref_date)
        partial_cutoff_day = ref_date.day if not _is_month_end(ref_date) else None
        baseline_periods: list[str] = []
    else:
        ref_date = window.target_end
        target_period = window.target_period
        partial_cutoff_day = window.cutoff_day
        baseline_periods = list(window.baseline_periods)

    category_expr = func.coalesce(
        func.nullif(_LINES.c.effective_category_major, ""), "미분류"
    )
    # (period, category) -> net spend, aggregated in SQL from the flow lines.
    grouped: dict[tuple, int] = {}
    if window is not None and window.target_has_data:
        grouped = await grouped_period_amounts(
            db_session,
            window,
            keys=[category_expr],
            amount=-_LINES.c.amount,
            filters=[_LINES.c.type == EXPENSE],
        )

    all_categories = {category for (_, category) in grouped}
    items = []
    for category in all_categories:
        if not baseline_periods:
            continue
        target_amount = grouped.get((target_period, category), 0)
        baseline_amounts = [grouped.get((p, category), 0) for p in baseline_periods]
        baseline_avg = median_won(baseline_amounts) or 0
        baseline_mean = sum(baseline_amounts) / len(baseline_amounts)
        if len(baseline_amounts) > 1:
            b_var = sum((v - baseline_mean) ** 2 for v in baseline_amounts) / len(
                baseline_amounts
            )
            b_stdev = math.sqrt(b_var)
        else:
            b_stdev = 0.0

        delta = target_amount - baseline_avg
        delta_pct = _safe_ratio(delta * 100, baseline_avg)
        delta_pct_display = delta_pct
        delta_display_capped = False
        baseline_quality = "sufficient"
        anomaly_mode = "standard"
        if baseline_avg < min_delta_amount:
            baseline_quality = "sparse_baseline"
            anomaly_mode = (
                "sparse_baseline_spike" if delta > 0 else "sparse_baseline_drop"
            )
            delta_pct_display = None
            delta_display_capped = True
        abs_delta = abs(delta)

        if b_stdev > 0:
            anomaly_score = round(abs_delta / b_stdev, 4)
        elif baseline_avg > 0:
            anomaly_score = round(abs_delta / baseline_avg, 4)
        else:
            anomaly_score = 0.0

        if abs_delta < min_delta_amount:
            continue
        if anomaly_score < anomaly_threshold:
            continue

        if baseline_quality == "sparse_baseline":
            direction_text = "급증" if delta > 0 else "급감"
            reason = f"지출 {direction_text} (비교 기준액이 작거나 순환급이어서 비율 표시는 생략)"
        elif delta > 0:
            reason = f"지출 급증 (+{round(delta_pct_display or 0):.0f}%)"
        else:
            reason = f"지출 급감 ({round(delta_pct_display or 0):.0f}%)"

        if target_amount < 0:
            reason += " · 환급이 결제보다 많아 순환급 상태입니다."

        items.append(
            SpendingAnomalyItem(
                period=target_period,
                category=category,
                amount=target_amount,
                baseline_avg=baseline_avg,
                delta_pct=delta_pct,
                delta_pct_raw=delta_pct,
                delta_pct_display=delta_pct_display,
                delta_display_capped=delta_display_capped,
                baseline_quality=baseline_quality,
                anomaly_mode=anomaly_mode,
                direction="increase" if delta > 0 else "decrease",
                anomaly_score=anomaly_score,
                reason=reason,
            )
        )

    items.sort(key=lambda item: (-item.anomaly_score, item.category))
    paged_items, total, resolved_page = _paginate_items(
        items, page=page, per_page=per_page
    )
    return SpendingAnomaliesResponse(
        total=total,
        page=resolved_page,
        per_page=per_page,
        items=paged_items,
        comparison_mode="partial" if partial_cutoff_day is not None else "closed",
        reference_date=ref_date,
        is_partial_period=partial_cutoff_day is not None,
        assumptions=_build_spending_anomalies_assumptions(
            target_period=target_period,
            baseline_months=baseline_months,
            baseline_periods=baseline_periods,
            anomaly_threshold=anomaly_threshold,
            min_delta_amount=min_delta_amount,
            used_last_closed_month=used_last_closed_month,
            partial_cutoff_day=partial_cutoff_day,
            ref_date=ref_date,
        ),
        contract=await build_flow_contract(
            db_session,
            definition="spending_anomalies.legacy_v1",
            scope=(
                "대분류 카테고리별 월 순지출(환불은 게시월에서 차감, 대출 포함)의 "
                "기준월 대비 비교 계약(comparison.v1) 기준값 비교"
            ),
            start_date=(
                period_start(baseline_periods[0]) if baseline_periods else None
            ),
            end_date=ref_date,
            field_scopes={
                "baseline_avg": (
                    "필드 이름은 유지하지만 값은 비교 계약 기준값: 기준 기간 월별 "
                    "순지출의 중앙값(원 단위 반올림). 자료 없는 달은 빼고, 자료 있는 "
                    "달의 0원은 포함"
                ),
                "anomaly_score": (
                    "|amount − baseline_avg| ÷ 기준 기간 월별 금액의 표준편차"
                    "(0이면 ÷ baseline_avg)"
                ),
            },
        ),
        comparison=build_comparison_basis(window) if window is not None else None,
    )


async def _purchase_review_totals(
    db_session: AsyncSession,
    *,
    start_date: date,
    end_date: date,
    cutoff_day: int | None = None,
    group_by_period: bool = True,
) -> list[RowMapping]:
    """Positive purchase nets only: ad hoc, adjustable, effective KRW rows.

    Distinct from cashflow: later allocated refunds reduce the original purchase;
    standalone refund rows and zero/over-refunded purchases do not count.
    """
    tx = METRIC_TRANSACTIONS_VIEW
    nature = TRANSACTION_NATURE_VIEW
    filters = [
        tx.c.type == EXPENSE,
        func.upper(tx.c.currency) == METRIC_CURRENCY,
        tx.c.date.between(start_date, end_date),
        tx.c.purchase_net_amount < 0,
        nature.c.loan_account_id.is_(None),
        nature.c.commitment_kind.is_(None),
        nature.c.adjustability == "adjustable",
    ]
    if cutoff_day is not None:
        filters.append(day_of_month(tx.c.date) <= cutoff_day)
    rows: list[RowMapping] = []
    for dimension, key in (
        (
            "merchant",
            func.coalesce(
                func.nullif(tx.c.merchant, ""),
                func.nullif(tx.c.description, ""),
                "미분류",
            ),
        ),
        (
            "category",
            func.coalesce(func.nullif(tx.c.effective_category_major, ""), "미분류"),
        ),
    ):
        period = tx.c.period if group_by_period else literal("target")
        result = await db_session.execute(
            select(
                literal(dimension).label("dimension"),
                period.label("period"),
                key.label("key"),
                func.sum(-tx.c.purchase_net_amount).label("amount"),
            )
            .select_from(tx.join(nature, nature.c.transaction_id == tx.c.id))
            .where(*filters)
            .group_by(period, key)
        )
        rows.extend(result.mappings().all())
    return rows


async def get_purchase_gate_candidates(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    settings: PurchaseGateSettings,
    comparison_window: ComparisonWindow | None = None,
    review_status: str | None = None,
    page: int = 1,
    per_page: int = 10,
) -> PurchaseGateCandidatesResponse:
    ref_end = end_date or date.today()
    ref_start = start_date or date(ref_end.year, ref_end.month, 1)
    lookback_start = _add_months(ref_start, -settings.new_merchant_lookback_months)
    if comparison_window is not None:
        ref_start = comparison_window.target_start or ref_start
        ref_end = comparison_window.target_end or ref_end
        if comparison_window.baseline_periods:
            lookback_start = min(
                lookback_start, period_start(comparison_window.baseline_periods[0])
            )
    rows = await _load_purchase_net_rows(
        db_session,
        start_date=lookback_start,
        end_date=ref_end,
        tx_type="지출",
    )

    possible_cancellations = _possible_cancellation_evidence(rows)
    eligible_rows = [row for row in rows if _is_purchase_gate_base_row(row)]
    purchase_rows = [
        row
        for row in eligible_rows
        if row["amount"] < 0 and _purchase_gate_net_amount(row) > 0
    ]
    current_rows = [row for row in purchase_rows if ref_start <= row["date"] <= ref_end]
    prior_merchants = {
        row["merchant"] or row["description"] or "미분류"
        for row in purchase_rows
        if row["date"] < ref_start
    }
    # The purchase-net definition differs from posting-month cashflow. SQL
    # aggregates view-provided per-purchase amounts; Python only detects candidates
    # and takes the median/legacy mean of those monthly aggregates.
    totals = await _purchase_review_totals(
        db_session,
        start_date=lookback_start,
        end_date=ref_start - timedelta(days=1),
        cutoff_day=comparison_window.cutoff_day if comparison_window else None,
    )
    prior_merchant_monthly: dict[tuple[str, str], int] = defaultdict(int)
    prior_discretionary_monthly: dict[tuple[str, str], int] = defaultdict(int)
    current_merchant_total: dict[str, int] = defaultdict(int)
    current_discretionary_category_total: dict[str, int] = defaultdict(int)
    for row in totals:
        period = row["period"]
        if comparison_window is None or period in comparison_window.baseline_periods:
            if row["dimension"] == "merchant":
                prior_merchant_monthly[(row["key"], period)] = int(row["amount"])
            else:
                prior_discretionary_monthly[(row["key"], period)] = int(row["amount"])
    current_totals = await _purchase_review_totals(
        db_session,
        start_date=ref_start,
        end_date=ref_end,
        group_by_period=False,
    )
    for row in current_totals:
        if row["dimension"] == "merchant":
            current_merchant_total[row["key"]] = int(row["amount"])
        else:
            current_discretionary_category_total[row["key"]] = int(row["amount"])
    if comparison_window is not None:
        # Include real zero months, skip months without ledger data. Novelty is
        # evaluated in the same closed-month window as spike comparisons.
        prior_merchants = {
            row["key"]
            for row in totals
            if row["dimension"] == "merchant"
            and row["period"] in comparison_window.baseline_periods
        }

    def baseline(monthly: dict[tuple[str, str], int], key: str) -> int:
        if comparison_window is not None:
            return (
                median_won(
                    [
                        monthly.get((key, period), 0)
                        for period in comparison_window.baseline_periods
                    ]
                )
                or 0
            )
        return _monthly_average(
            value for (group, _), value in monthly.items() if group == key
        )

    enabled = set(settings.enabled_candidate_types)
    excluded_categories = set(settings.excluded_category_names)
    excluded_merchants = set(settings.excluded_merchants)
    candidate_map: dict[int, PurchaseCandidateAggregate] = {}

    for row in current_rows:
        merchant = row["merchant"] or row["description"] or "미분류"
        category = row["effective_category_major"] or "미분류"
        if merchant in excluded_merchants or category in excluded_categories:
            continue
        amount = _purchase_gate_net_amount(row)
        if amount < settings.min_candidate_amount:
            continue
        base: PurchaseCandidateBase = {
            "transaction_id": row["id"],
            "date": row["date"],
            "merchant": merchant,
            "amount": amount,
            "category": category,
            "refund_total": int(row.get("settlement_refund_total") or 0),
        }
        if "large_oneoff" in enabled and amount >= settings.large_purchase_threshold:
            _append_purchase_candidate_reason(
                candidate_map,
                candidate_type="large_oneoff",
                base=base,
                signals={"threshold": settings.large_purchase_threshold},
                risk_level="warning",
                reasons=[f"{amount:,}원 지출이 큰 지출 기준을 넘었습니다."],
            )
        if "new_merchant" in enabled and merchant not in prior_merchants:
            _append_purchase_candidate_reason(
                candidate_map,
                candidate_type="new_merchant",
                base=base,
                signals={
                    "lookback_months": settings.new_merchant_lookback_months,
                    **(
                        {
                            "baseline_month_count": len(
                                comparison_window.baseline_periods
                            )
                        }
                        if comparison_window is not None
                        else {}
                    ),
                },
                risk_level="warning",
                reasons=[
                    (
                        "비교 기준 기간에 같은 경과일까지의 구매 기록이 없는 거래처입니다."
                        if comparison_window is not None
                        else f"최근 {settings.new_merchant_lookback_months}개월 내 처음 등장한 거래처입니다."
                    )
                ],
            )
        merchant_baseline = baseline(prior_merchant_monthly, merchant)
        merchant_current = current_merchant_total[merchant]
        merchant_spike_ratio = _safe_ratio(merchant_current, merchant_baseline)
        if (
            "merchant_spike" in enabled
            and merchant_baseline > 0
            and merchant_spike_ratio is not None
            and merchant_spike_ratio >= settings.merchant_spike_ratio
        ):
            _append_purchase_candidate_reason(
                candidate_map,
                candidate_type="merchant_spike",
                base=base,
                signals={
                    "baseline_avg": merchant_baseline,
                    "current_total": merchant_current,
                    **(
                        {"ratio": merchant_spike_ratio}
                        if comparison_window is None or not comparison_window.is_partial
                        else {}
                    ),
                    "threshold_ratio": settings.merchant_spike_ratio,
                },
                risk_level="warning",
                reasons=[
                    (
                        f"{merchant} 지출이 기준값보다 {merchant_current - merchant_baseline:,}원 큽니다."
                        if comparison_window is not None
                        else f"{merchant} 지출이 baseline 대비 {merchant_spike_ratio:.2f}x입니다."
                    )
                ],
            )
        discretionary_baseline = baseline(prior_discretionary_monthly, category)
        discretionary_current = current_discretionary_category_total[category]
        discretionary_spike_ratio = _safe_ratio(
            discretionary_current,
            discretionary_baseline,
        )
        if (
            "discretionary_spike" in enabled
            and discretionary_baseline > 0
            and discretionary_spike_ratio is not None
            and discretionary_spike_ratio >= settings.discretionary_spike_ratio
        ):
            _append_purchase_candidate_reason(
                candidate_map,
                candidate_type="discretionary_spike",
                base=base,
                signals={
                    "baseline_avg": discretionary_baseline,
                    "current_total": discretionary_current,
                    **(
                        {"ratio": discretionary_spike_ratio}
                        if comparison_window is None or not comparison_window.is_partial
                        else {}
                    ),
                    "threshold_ratio": settings.discretionary_spike_ratio,
                },
                risk_level="warning",
                reasons=[
                    (
                        f"{category} 재량 지출이 기준값보다 {discretionary_current - discretionary_baseline:,}원 큽니다."
                        if comparison_window is not None
                        else f"{category} 재량 지출이 baseline 대비 {discretionary_spike_ratio:.2f}x입니다."
                    )
                ],
            )

    items = [
        _purchase_candidate_item(
            candidate_type=str(candidate["candidate_type"]),
            candidate_types=list(candidate["candidate_types"]),
            base=candidate["base"],
            signals=dict(candidate["signals"]),
            risk_level=str(candidate["risk_level"]),
            reasons=list(candidate["reasons"]),
            settings=settings,
        )
        for candidate in candidate_map.values()
    ]
    for item in items:
        evidence = possible_cancellations.get(item.transaction_id)
        if evidence is not None:
            item.possible_cancellation = True
            item.cancellation_evidence_transaction_ids = evidence
            item.confidence = "low"
            item.risk_level = "unknown"
            item.review_priority = "normal"
            item.reasons = [
                "같은 날·거래처·결제수단에 동일 금액의 반대 부호 거래가 있어 취소 가능성을 먼저 확인해야 합니다."
            ]
            item.assumptions.append(
                "취소 연결은 확정되지 않았으며 표시 금액은 개별 결제액입니다. 확인 전 반복 구매 제한을 제안하지 않습니다."
            )
            item.future_friction_suggestion = None

    legacy_candidate_keys_by_canonical = {
        item.candidate_key: [
            _legacy_candidate_key(candidate_type, item.transaction_id)
            for candidate_type in item.candidate_types
        ]
        for item in items
    }
    review_map = await _load_purchase_gate_review_statuses(
        db_session,
        [item.candidate_key for item in items],
        legacy_candidate_keys_by_canonical=legacy_candidate_keys_by_canonical,
    )
    for item in items:
        review = review_map.get(item.candidate_key)
        if review is not None:
            item.review_status = review.review_status
            item.review_memo = review.memo
            item.reviewed_at = review.reviewed_at
            item.cooldown_until = review.cooldown_until
        else:
            item.review_status = "pending"
    if review_status is not None:
        items = [item for item in items if item.review_status == review_status]

    items.sort(key=lambda item: (-item.amount, item.candidate_type, item.merchant))
    paged_items, total, resolved_page = _paginate_items(
        items, page=page, per_page=per_page
    )
    return PurchaseGateCandidatesResponse(
        total=total,
        page=resolved_page,
        per_page=per_page,
        items=paged_items,
        start_date=ref_start,
        end_date=ref_end,
        assumptions=[
            "후보는 구매 금지/허용 판단이 아니라 사용자 검토 queue입니다.",
            f"기본 cooldown은 {settings.review_cooldown_days}일입니다.",
        ],
        contract=await build_purchase_net_contract(
            db_session,
            definition=f"spending_review_candidates.{PURCHASE_NET_DEFINITION}",
            scope=(
                "사후 검토 후보. 구매 단위 순액(확정 정산 환불을 원거래에서 차감) 기준이며 "
                "월 현금흐름 실적이 아님"
            ),
        ),
    )


async def update_purchase_gate_candidate_review(
    db_session: AsyncSession,
    *,
    candidate_key: str,
    payload: PurchaseGateReviewPatchRequest,
) -> PurchaseGateReviewResponse:
    candidate_type, transaction_id, canonical_candidate_key = _parse_candidate_key(
        candidate_key
    )
    review_keys = [canonical_candidate_key]
    if candidate_key != canonical_candidate_key:
        review_keys.append(candidate_key)
    result = await db_session.execute(
        select(PurchaseGateReview).where(
            PurchaseGateReview.candidate_key.in_(review_keys)
        )
    )
    loaded_reviews = {review.candidate_key: review for review in result.scalars().all()}
    review = loaded_reviews.get(canonical_candidate_key) or loaded_reviews.get(
        candidate_key
    )
    if review is None:
        review = PurchaseGateReview(
            candidate_key=canonical_candidate_key,
            candidate_type=candidate_type,
            transaction_id=transaction_id,
            review_status=payload.review_status,
        )
        db_session.add(review)
    else:
        review.candidate_key = canonical_candidate_key
        review.transaction_id = transaction_id
        review.review_status = payload.review_status
    review.memo = payload.memo
    review.reviewed_at = datetime.now(UTC)
    if payload.cooldown_days is not None:
        review.cooldown_until = review.reviewed_at + timedelta(
            days=payload.cooldown_days
        )
    elif payload.review_status == "snoozed":
        review.cooldown_until = review.reviewed_at + timedelta(days=14)
    elif payload.review_status in {"pending", "reviewed", "ignored", "dismissed"}:
        review.cooldown_until = None
    try:
        await db_session.commit()
    except Exception:
        await db_session.rollback()
        raise
    await db_session.refresh(review)
    return PurchaseGateReviewResponse(
        candidate_key=review.candidate_key,
        candidate_type=review.candidate_type,
        transaction_id=review.transaction_id,
        review_status=review.review_status,
        memo=review.memo,
        reviewed_at=review.reviewed_at,
        cooldown_until=review.cooldown_until,
    )


async def _load_purchase_net_rows(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    tx_type: TransactionTypeFilter,
) -> list[AnalyticsRow]:
    """Per-purchase rows for detectors (purchase_net.v1, not cashflow actuals).

    ``purchase_net_amount`` is computed in ``vw_metric_transactions``: confirmed
    refund allocations net into the original purchase and only the unallocated
    remainder stays on the refund row. Rows whose net is zero are omitted.
    """
    tx = METRIC_TRANSACTIONS_VIEW
    nature = TRANSACTION_NATURE_VIEW
    query = (
        select(
            tx,
            nature.c.commitment_kind.label("nature_commitment_kind"),
            nature.c.adjustability.label("nature_adjustability"),
        )
        .select_from(
            tx.outerjoin(nature, nature.c.transaction_id == tx.c.id),
        )
        .where(func.upper(tx.c.currency) == METRIC_CURRENCY)
        .where(tx.c.purchase_net_amount != 0)
    )
    if start_date is not None:
        query = query.where(tx.c.date >= start_date)
    if end_date is not None:
        query = query.where(tx.c.date <= end_date)
    if tx_type == "income_expense":
        query = query.where(tx.c.type.in_([INCOME, EXPENSE]))
    elif tx_type != "all":
        query = query.where(tx.c.type == tx_type)
    result = await db_session.execute(
        query.order_by(tx.c.date.asc(), tx.c.time.asc(), tx.c.id.asc())
    )
    return [_parse_purchase_net_row(row) for row in result.mappings().all()]


def _parse_purchase_net_row(row: RowMapping) -> AnalyticsRow:
    amount = int(row["amount"])
    is_purchase = row["type"] == EXPENSE and amount < 0
    return {
        "id": int(row["id"]),
        "date": _as_date(row["date"]),
        "time": _as_time(row["time"]),
        "type": str(row["type"]),
        "amount": int(row["purchase_net_amount"]),
        "merchant": row["merchant"],
        "description": str(row["description"]),
        "payment_method": row["payment_method"],
        "effective_category_major": row["effective_category_major"],
        "effective_category_minor": row["effective_category_minor"],
        "loan_account_id": row["loan_account_id"],
        "commitment_kind": row["nature_commitment_kind"],
        "adjustability": row["nature_adjustability"] or "undecided",
        "settlement_refund_total": (
            int(row["settlement_refund_total"] or 0) if is_purchase else 0
        ),
    }


def _date_filters(
    start_date: date | None, end_date: date | None
) -> list[ColumnElement[bool]]:
    filters: list[ColumnElement[bool]] = []
    if start_date is not None:
        filters.append(_LINES.c.date >= start_date)
    if end_date is not None:
        filters.append(_LINES.c.date <= end_date)
    return filters


def _type_filters(tx_type: TransactionTypeFilter) -> list[ColumnElement[bool]]:
    if tx_type == "income_expense":
        return [_LINES.c.type.in_([INCOME, EXPENSE])]
    if tx_type == "all":
        return []
    return [_LINES.c.type == tx_type]


def _analytics_amount() -> ColumnElement:
    """Legacy analytics amount: spend paid-positive, transfers absolute."""
    return case(
        (_LINES.c.type == EXPENSE, -_LINES.c.amount),
        (_LINES.c.type == TRANSFER, func.abs(_LINES.c.amount)),
        else_=_LINES.c.amount,
    )


def _as_date(value: object) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _as_time(value: object) -> time:
    if isinstance(value, time):
        return value
    return time.fromisoformat(str(value))


def _month_key(value: date) -> str:
    return value.strftime("%Y-%m")


def _is_month_end(value: date) -> bool:
    return value.day == _last_day_of_month(value).day


def _last_day_of_month(value: date) -> date:
    if value.month == 12:
        return date(value.year, 12, 31)
    return date(value.year, value.month + 1, 1) - timedelta(days=1)


def _last_closed_month_end(value: date) -> date:
    first_day_of_month = date(value.year, value.month, 1)
    return first_day_of_month - timedelta(days=1)


def _build_spending_anomalies_assumptions(
    *,
    target_period: str,
    baseline_months: int,
    baseline_periods: list[str],
    anomaly_threshold: float,
    min_delta_amount: int,
    used_last_closed_month: bool,
    partial_cutoff_day: int | None,
    ref_date: date,
) -> str:
    used = ", ".join(baseline_periods) if baseline_periods else "없음"
    parts = [
        f"기준월={target_period}",
        (
            f"baseline=최근 마감월 최대 {baseline_months}개의 중앙값 대비"
            f"(사용한 달: {used}; 자료 없는 달 제외, 기준 구간 시작일 적용)"
        ),
    ]
    if used_last_closed_month:
        parts.append(
            f"직전 마감월 기준(as_of={ref_date.isoformat()}, 자료 기준일로 판단)"
        )
    elif partial_cutoff_day is not None:
        parts.append(
            f"부분 기간 비교(기준일={ref_date.isoformat()}, 이전 월도 매월 {partial_cutoff_day}일까지만 집계)"
        )
    parts.append(
        f"threshold={anomaly_threshold} anomaly_score 기준 (표준편차가 있으면 |delta|/stdev, 없으면 |delta|/baseline_avg)"
    )
    parts.append(
        f"min_delta_amount={min_delta_amount} (baseline 대비 절대 변동액 하한)"
    )
    return ", ".join(parts)


def _build_income_stability_assumptions(
    *,
    used_last_closed_month: bool,
    partial_cutoff_day: int | None,
    ref_date: date,
) -> str:
    parts = [
        "월별 수입 기준, 이체 제외",
        "수입이 관측된 월만 평균과 변동성에 포함하며 수입 미관측 월을 0원으로 추정하지 않습니다",
        "조회 시작월 및 원본 업로드의 월별 수집 완전성은 검증하지 않은 관측값입니다",
    ]
    if used_last_closed_month:
        parts.append(f"직전 마감월 기준(as_of={ref_date.isoformat()})")
    elif partial_cutoff_day is not None:
        parts.append(
            f"부분 기간 비교(기준일={ref_date.isoformat()}, 이전 월도 매월 {partial_cutoff_day}일까지만 집계)"
        )
    return ", ".join(parts)


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, _last_day_of_month(date(year, month, 1)).day)
    return date(year, month, day)


def _monthly_average(values: Iterable[int]) -> int:
    amounts = list(values)
    if not amounts:
        return 0
    return round(sum(amounts) / len(amounts))


async def _load_purchase_gate_review_statuses(
    db_session: AsyncSession,
    candidate_keys: list[str],
    *,
    legacy_candidate_keys_by_canonical: dict[str, list[str]] | None = None,
) -> dict[str, PurchaseGateReview]:
    if not candidate_keys:
        return {}
    lookup_keys = set(candidate_keys)
    if legacy_candidate_keys_by_canonical is not None:
        for legacy_keys in legacy_candidate_keys_by_canonical.values():
            lookup_keys.update(legacy_keys)
    result = await db_session.execute(
        select(PurchaseGateReview).where(
            PurchaseGateReview.candidate_key.in_(lookup_keys)
        )
    )
    review_map = {review.candidate_key: review for review in result.scalars().all()}
    resolved: dict[str, PurchaseGateReview] = {}
    for candidate_key in candidate_keys:
        review = review_map.get(candidate_key)
        if review is None and legacy_candidate_keys_by_canonical is not None:
            for legacy_key in legacy_candidate_keys_by_canonical.get(candidate_key, []):
                review = review_map.get(legacy_key)
                if review is not None:
                    break
        if review is not None:
            resolved[candidate_key] = review
    return resolved


def _parse_candidate_key(candidate_key: str) -> tuple[str, int, str]:
    candidate_type, separator, transaction_id_text = candidate_key.partition(":")
    if not separator or not candidate_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "candidate_key must use 'transaction:<transaction_id>' or "
                "'<candidate_type>:<transaction_id>'"
            ),
        )
    try:
        transaction_id = int(transaction_id_text)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="candidate_key transaction id must be an integer",
        ) from exc
    return candidate_type, transaction_id, _canonical_candidate_key(transaction_id)


def _possible_cancellation_evidence(rows: list[AnalyticsRow]) -> dict[int, list[int]]:
    groups: dict[tuple[date, str, str, int], list[AnalyticsRow]] = defaultdict(list)
    for row in rows:
        merchant = row["merchant"] or row["description"]
        payment_method = row["payment_method"]
        if not merchant or not payment_method or row.get("settlement_refund_total", 0):
            continue
        groups[(row["date"], merchant, payment_method, abs(row["amount"]))].append(row)
    evidence = {}
    for group in groups.values():
        charges = [row for row in group if row["amount"] < 0]
        refunds = [row for row in group if row["amount"] > 0]
        if len(charges) == 1 and len(refunds) == 1:
            evidence[charges[0]["id"]] = [charges[0]["id"], refunds[0]["id"]]
    return evidence


def _is_purchase_gate_base_row(row: AnalyticsRow) -> bool:
    """Ad hoc adjustable purchase (T056 axes from vw_transaction_nature).

    Old rule: no loan link, ``cost_kind`` not fixed, ``spend_necessity``
    discretionary. Fixed cost is a committed (recurring bundle) payment and
    discretionary is ``adjustable``; loan- and installment-linked rows are
    committed too, so only ad hoc rows remain.
    """
    return (
        row["loan_account_id"] is None
        and row["commitment_kind"] is None
        and row["adjustability"] == "adjustable"
        and row["amount"] != 0
    )


def _is_purchase_gate_queue_row(row: AnalyticsRow) -> bool:
    return _is_purchase_gate_base_row(row) and max(0, -row["amount"]) > 0


def _purchase_gate_net_amount(
    row: AnalyticsRow,
) -> int:
    return max(0, -int(row["amount"]))


def _append_purchase_candidate_reason(
    candidate_map: dict[int, PurchaseCandidateAggregate],
    *,
    candidate_type: str,
    base: PurchaseCandidateBase,
    signals: dict[str, PurchaseCandidateSignalValue],
    risk_level: str,
    reasons: list[str],
) -> None:
    transaction_id = base["transaction_id"]
    namespaced_signals = _namespace_purchase_candidate_signals(candidate_type, signals)
    candidate = candidate_map.get(transaction_id)
    if candidate is None:
        candidate_map[transaction_id] = {
            "candidate_type": candidate_type,
            "candidate_types": [candidate_type],
            "base": base,
            "signals": namespaced_signals,
            "risk_level": risk_level,
            "reasons": list(reasons),
        }
        return

    candidate_types = candidate["candidate_types"]
    if candidate_type not in candidate_types:
        candidate_types.append(candidate_type)
    candidate["signals"].update(namespaced_signals)
    candidate["risk_level"] = _higher_purchase_gate_risk_level(
        candidate["risk_level"],
        risk_level,
    )
    existing_reasons = candidate["reasons"]
    for reason in reasons:
        if reason not in existing_reasons:
            existing_reasons.append(reason)


def _namespace_purchase_candidate_signals(
    candidate_type: str,
    signals: dict[str, PurchaseCandidateSignalValue],
) -> dict[str, PurchaseCandidateSignalValue]:
    return {
        f"{candidate_type}_{signal_name}": value
        for signal_name, value in signals.items()
    }


def _higher_purchase_gate_risk_level(current: str, incoming: str) -> str:
    priority = {"normal": 0, "warning": 1, "high": 2}
    return incoming if priority.get(incoming, 0) > priority.get(current, 0) else current


def _canonical_candidate_key(transaction_id: int) -> str:
    return f"transaction:{transaction_id}"


def _legacy_candidate_key(candidate_type: str, transaction_id: int) -> str:
    return f"{candidate_type}:{transaction_id}"


def _purchase_candidate_item(
    *,
    candidate_type: str,
    candidate_types: list[str],
    base: PurchaseCandidateBase,
    signals: dict[str, PurchaseCandidateSignalValue],
    risk_level: str,
    reasons: list[str],
    settings: PurchaseGateSettings,
) -> PurchaseGateCandidateItem:
    transaction_id = base["transaction_id"]
    item_signals = dict(signals)
    item_reasons = list(reasons)
    refund_total = base["refund_total"]
    if refund_total > 0:
        item_signals["refund_netting_refund_total"] = refund_total
        item_reasons.append(
            f"부분 환불/결제취소 {refund_total:,}원을 차감한 순지출 기준입니다."
        )
    return PurchaseGateCandidateItem(
        candidate_type=candidate_type,
        candidate_types=candidate_types,
        transaction_id=transaction_id,
        candidate_key=_canonical_candidate_key(transaction_id),
        date=base["date"],
        merchant=base["merchant"],
        amount=base["amount"],
        category=base["category"],
        signals=item_signals,
        risk_level=risk_level,
        review_priority=risk_level,
        confidence="medium",
        suggested_review_window=f"{settings.review_cooldown_days}d",
        reasons=item_reasons,
        assumptions=[
            "My Ledge는 후보와 근거만 제공하고 최종 구매 판단은 하지 않습니다."
        ],
        review_status="pending",
        future_friction_suggestion={
            "condition": {
                "merchant": str(base["merchant"]),
                "min_amount": int(base["amount"]),
                "candidate_types": candidate_types,
            },
            "action": "review_before_repeat_spend",
        },
    )


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return round(numerator / denominator, 4)


def _paginate_items[T](
    items: list[T], *, page: int, per_page: int
) -> tuple[list[T], int, int]:
    total = len(items)
    resolved_page = 1 if total == 0 else min(page, math.ceil(total / per_page))
    start_index = (resolved_page - 1) * per_page
    return items[start_index : start_index + per_page], total, resolved_page
