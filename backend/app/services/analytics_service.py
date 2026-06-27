import math
from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta
from typing import NotRequired, TypedDict

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.purchase_gate_review import PurchaseGateReview
from app.schemas.analytics import (
    CategoryMoMItem,
    CategoryMoMResponse,
    DiscretionaryVelocityResponse,
    FixedCostSummaryResponse,
    FixedCostTrendItem,
    FixedCostTrendResponse,
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
    RecurringPaymentItem,
    RecurringPaymentsResponse,
    SpendingAnomalyItem,
    SpendingAnomaliesResponse,
)
from app.schemas.settings import DiscretionaryVelocitySettings, PurchaseGateSettings
from app.schemas.transaction import TransactionCategoryLevel, TransactionTypeFilter
from app.services.canonical_views import build_transactions_effective_select
from app.services.settlement_group_service import (
    SettlementAnalysisNetting,
    build_confirmed_settlement_analysis_netting,
)


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
    cost_kind: str | None
    fixed_cost_necessity: str | None
    spend_necessity: str | None
    loan_account_id: int | None
    recurring_payment_kind: str | None
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
    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type="all",
    )

    grouped: dict[str, dict[str, int]] = defaultdict(
        lambda: {
            "income": 0,
            "expense": 0,
            "transfer": 0,
        }
    )
    for row in rows:
        period = _month_key(row["date"])
        if row["type"] == "수입":
            grouped[period]["income"] += row["amount"]
        elif row["type"] == "지출":
            grouped[period]["expense"] += -row["amount"]
        elif row["type"] == "이체":
            grouped[period]["transfer"] += abs(row["amount"])

    items = []
    for period in sorted(grouped):
        income = grouped[period]["income"]
        expense = grouped[period]["expense"]
        transfer = grouped[period]["transfer"]
        net_cashflow = income - expense
        items.append(
            MonthlyCashflowItem(
                period=period,
                income=income,
                expense=expense,
                transfer=transfer,
                net_cashflow=net_cashflow,
                savings_rate=_safe_ratio(net_cashflow, income),
            )
        )
    return MonthlyCashflowResponse(items=items)


async def get_category_mom(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    level: TransactionCategoryLevel,
    tx_type: TransactionTypeFilter,
) -> CategoryMoMResponse:
    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type=tx_type,
    )
    if not rows:
        return CategoryMoMResponse(items=[])

    current_period = max(_month_key(row["date"]) for row in rows)
    previous_period = _previous_period(current_period)
    grouped: dict[tuple[str, str], int] = defaultdict(int)
    categories: set[str] = set()

    for row in rows:
        period = _month_key(row["date"])
        if period not in {current_period, previous_period}:
            continue
        category = _category_value(row, level)
        grouped[(period, category)] += _amount_for_analytics(row["type"], row["amount"])
        categories.add(category)

    items = []
    for category in categories:
        current_amount = grouped[(current_period, category)]
        previous_amount = grouped[(previous_period, category)]
        delta_amount = current_amount - previous_amount
        items.append(
            CategoryMoMItem(
                period=current_period,
                previous_period=previous_period,
                category=category,
                current_amount=current_amount,
                previous_amount=previous_amount,
                delta_amount=delta_amount,
                delta_pct=_safe_ratio(delta_amount, previous_amount),
            )
        )

    items.sort(key=lambda item: (-item.delta_amount, item.category))
    return CategoryMoMResponse(items=items)


async def get_fixed_cost_summary(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
) -> FixedCostSummaryResponse:
    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type="지출",
    )

    expense_total = 0
    fixed_total = 0
    variable_total = 0
    essential_fixed_total = 0
    discretionary_fixed_total = 0
    essential_variable_total = 0
    discretionary_variable_total = 0
    unclassified_total = 0
    unclassified_count = 0

    for row in rows:
        amount = -row["amount"]
        expense_total += amount
        cost_kind = row["cost_kind"]
        if cost_kind == "fixed":
            fixed_total += amount
            if row["fixed_cost_necessity"] == "essential":
                essential_fixed_total += amount
            elif row["fixed_cost_necessity"] == "discretionary":
                discretionary_fixed_total += amount
        elif cost_kind == "variable":
            variable_total += amount
            if row["spend_necessity"] == "essential":
                essential_variable_total += amount
            elif row["spend_necessity"] == "discretionary":
                discretionary_variable_total += amount
        else:
            unclassified_total += amount
            unclassified_count += 1

    return FixedCostSummaryResponse(
        expense_total=expense_total,
        fixed_total=fixed_total,
        variable_total=variable_total,
        fixed_ratio=_safe_ratio(fixed_total, expense_total),
        essential_fixed_total=essential_fixed_total,
        discretionary_fixed_total=discretionary_fixed_total,
        essential_variable_total=essential_variable_total,
        discretionary_variable_total=discretionary_variable_total,
        required_spend_total=essential_fixed_total + essential_variable_total,
        discretionary_spend_total=(
            discretionary_fixed_total + discretionary_variable_total
        ),
        unclassified_total=unclassified_total,
        unclassified_count=unclassified_count,
    )


async def get_fixed_cost_trend(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
) -> FixedCostTrendResponse:
    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type="지출",
    )

    grouped: dict[str, dict[str, int]] = defaultdict(
        lambda: {
            "expense_total": 0,
            "fixed_total": 0,
            "variable_total": 0,
            "essential_fixed_total": 0,
            "discretionary_fixed_total": 0,
            "essential_variable_total": 0,
            "discretionary_variable_total": 0,
            "unclassified_total": 0,
            "unclassified_count": 0,
        }
    )
    for row in rows:
        period = _month_key(row["date"])
        amount = -row["amount"]
        grouped[period]["expense_total"] += amount
        cost_kind = row["cost_kind"]
        if cost_kind == "fixed":
            grouped[period]["fixed_total"] += amount
            if row["fixed_cost_necessity"] == "essential":
                grouped[period]["essential_fixed_total"] += amount
            elif row["fixed_cost_necessity"] == "discretionary":
                grouped[period]["discretionary_fixed_total"] += amount
        elif cost_kind == "variable":
            grouped[period]["variable_total"] += amount
            if row["spend_necessity"] == "essential":
                grouped[period]["essential_variable_total"] += amount
            elif row["spend_necessity"] == "discretionary":
                grouped[period]["discretionary_variable_total"] += amount
        else:
            grouped[period]["unclassified_total"] += amount
            grouped[period]["unclassified_count"] += 1

    return FixedCostTrendResponse(
        items=[
            FixedCostTrendItem(
                period=period,
                expense_total=values["expense_total"],
                fixed_total=values["fixed_total"],
                variable_total=values["variable_total"],
                essential_fixed_total=values["essential_fixed_total"],
                discretionary_fixed_total=values["discretionary_fixed_total"],
                essential_variable_total=values["essential_variable_total"],
                discretionary_variable_total=values["discretionary_variable_total"],
                required_spend_total=(
                    values["essential_fixed_total"] + values["essential_variable_total"]
                ),
                discretionary_spend_total=(
                    values["discretionary_fixed_total"]
                    + values["discretionary_variable_total"]
                ),
                unclassified_total=values["unclassified_total"],
                unclassified_count=values["unclassified_count"],
                fixed_ratio=_safe_ratio(values["fixed_total"], values["expense_total"]),
            )
            for period, values in sorted(grouped.items())
        ]
    )


async def get_merchant_spend(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    tx_type: TransactionTypeFilter,
    limit: int,
) -> MerchantSpendResponse:
    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type=tx_type,
    )

    grouped: dict[str, dict[str, int | datetime]] = defaultdict(
        lambda: {
            "amount": 0,
            "count": 0,
            "last_seen_at": datetime.min,
        }
    )
    for row in rows:
        merchant = row["merchant"] or "미분류"
        grouped[merchant]["amount"] += _amount_for_analytics(row["type"], row["amount"])
        grouped[merchant]["count"] += 1
        last_seen_at = datetime.combine(row["date"], row["time"])
        if last_seen_at > grouped[merchant]["last_seen_at"]:
            grouped[merchant]["last_seen_at"] = last_seen_at

    items = [
        MerchantSpendItem(
            merchant=merchant,
            amount=int(values["amount"]),
            count=int(values["count"]),
            avg_amount=round(int(values["amount"]) / int(values["count"]), 2),
            last_seen_at=values["last_seen_at"],
        )
        for merchant, values in grouped.items()
    ]
    items.sort(key=lambda item: (-item.amount, item.merchant))
    return MerchantSpendResponse(items=items[:limit])


async def get_payment_method_patterns(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    tx_type: TransactionTypeFilter,
) -> PaymentMethodPatternsResponse:
    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type=tx_type,
    )

    grouped: dict[str, dict[str, int]] = defaultdict(lambda: {"amount": 0, "count": 0})
    for row in rows:
        method = row["payment_method"] or "알 수 없음"
        grouped[method]["amount"] += _amount_for_analytics(row["type"], row["amount"])
        grouped[method]["count"] += 1

    total_amount = sum(v["amount"] for v in grouped.values())
    items = [
        PaymentMethodPatternItem(
            payment_method=method,
            total_amount=values["amount"],
            transaction_count=values["count"],
            avg_amount=round(values["amount"] / values["count"])
            if values["count"]
            else 0,
            pct_of_total=_safe_ratio(values["amount"] * 100, total_amount),
        )
        for method, values in grouped.items()
    ]
    items.sort(key=lambda item: (-item.total_amount, item.payment_method))
    return PaymentMethodPatternsResponse(items=items)


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

    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=ref_date,
        tx_type="수입",
    )

    monthly: dict[str, int] = defaultdict(int)
    for row in rows:
        row_date = row["date"]
        if (
            partial_cutoff_day is not None
            and row_date < date(ref_date.year, ref_date.month, 1)
            and row_date.day > partial_cutoff_day
        ):
            continue
        monthly[_month_key(row_date)] += row["amount"]

    items = [IncomeMonthlyItem(period=p, income=monthly[p]) for p in sorted(monthly)]
    values = [item.income for item in items]

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
    )


async def get_recurring_payments(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    min_occurrences: int,
    page: int = 1,
    per_page: int = 10,
) -> RecurringPaymentsResponse:
    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type="지출",
    )

    merchant_data: dict[str, dict] = defaultdict(
        lambda: {
            "dates": [],
            "amounts": [],
            "category": "미분류",
            "transaction_ids": [],
            "kind_counts": defaultdict(int),
        }
    )
    for row in rows:
        merchant = row["merchant"] or row["description"] or "미분류"
        merchant_data[merchant]["dates"].append(row["date"])
        merchant_data[merchant]["amounts"].append(-row["amount"])
        merchant_data[merchant]["category"] = (
            row["effective_category_major"] or "미분류"
        )
        merchant_data[merchant]["transaction_ids"].append(row["id"])
        kind = row["recurring_payment_kind"] or "unclassified"
        merchant_data[merchant]["kind_counts"][kind] += 1

    items = []
    for merchant, data in merchant_data.items():
        dates = sorted(data["dates"])
        if len(dates) < min_occurrences:
            continue

        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        avg_gap = sum(gaps) / len(gaps)

        if 25 <= avg_gap <= 35:
            interval_type = "monthly"
        elif 6 <= avg_gap <= 8:
            interval_type = "weekly"
        else:
            interval_type = "irregular"

        if len(gaps) > 1:
            gap_variance = sum((g - avg_gap) ** 2 for g in gaps) / len(gaps)
            gap_stdev = math.sqrt(gap_variance)
            confidence = (
                round(max(0.0, 1.0 - gap_stdev / avg_gap), 4) if avg_gap > 0 else 0.0
            )
        else:
            confidence = 0.5

        avg_amount = round(sum(data["amounts"]) / len(data["amounts"]))
        kind_counts = data["kind_counts"]
        items.append(
            RecurringPaymentItem(
                merchant=merchant,
                category=data["category"],
                avg_amount=avg_amount,
                interval_type=interval_type,
                avg_interval_days=round(avg_gap, 2),
                occurrences=len(dates),
                confidence=confidence,
                last_date=dates[-1],
                recurring_payment_kind=_resolved_recurring_payment_kind(kind_counts),
                installment_count=kind_counts["installment"],
                monthly_recurring_count=kind_counts["monthly_recurring"],
                not_recurring_count=kind_counts["not_recurring"],
                unclassified_count=kind_counts["unclassified"],
                transaction_ids=data["transaction_ids"],
            )
        )

    items.sort(key=lambda item: (-item.confidence, -item.occurrences, item.merchant))
    paged_items, total, resolved_page = _paginate_items(
        items, page=page, per_page=per_page
    )
    return RecurringPaymentsResponse(
        total=total,
        page=resolved_page,
        per_page=per_page,
        items=paged_items,
        assumptions=(
            "지출 거래 기준, 동일 거래처의 반복 간격으로 판단. "
            "25-35일=monthly, 6-8일=weekly. "
            "recurring_payment_kind는 사용자가 수동 분류한 거래값을 집계한다."
        ),
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
    used_last_closed_month = end_date is None
    ref_date = (
        _last_closed_month_end(date.today()) if used_last_closed_month else end_date
    )
    assert ref_date is not None
    target_period = _month_key(ref_date)
    partial_cutoff_day = ref_date.day if not _is_month_end(ref_date) else None

    # baseline: baseline_months개월 이전부터 target 전달까지
    year_int = int(target_period[:4])
    month_int = int(target_period[5:7])
    baseline_start_month = month_int - baseline_months
    baseline_start_year = year_int
    while baseline_start_month <= 0:
        baseline_start_month += 12
        baseline_start_year -= 1

    load_start = date(baseline_start_year, baseline_start_month, 1)
    load_end = ref_date

    # baseline periods
    baseline_periods: list[str] = []
    y, m = baseline_start_year, baseline_start_month
    while _month_key(date(y, m, 1)) < target_period:
        baseline_periods.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    baseline_period_set = set(baseline_periods)

    rows = await _load_analytics_transactions(
        db_session,
        start_date=load_start,
        end_date=load_end,
        tx_type="지출",
    )

    # (period, category) → amount
    grouped: dict[tuple[str, str], int] = defaultdict(int)
    for row in rows:
        period = _month_key(row["date"])
        if (
            partial_cutoff_day is not None
            and period in baseline_period_set
            and row["date"].day > partial_cutoff_day
        ):
            continue
        category = row["effective_category_major"] or "미분류"
        grouped[(period, category)] += -row["amount"]

    # 카테고리별 baseline 통계
    all_categories = {cat for (_, cat) in grouped.keys()}
    items = []
    for category in all_categories:
        target_amount = grouped.get((target_period, category), 0)
        baseline_amounts = [grouped.get((p, category), 0) for p in baseline_periods]
        if not baseline_periods:
            continue
        baseline_avg = round(sum(baseline_amounts) / len(baseline_amounts))
        if len(baseline_amounts) > 1:
            b_var = sum((v - baseline_avg) ** 2 for v in baseline_amounts) / len(
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
            anomaly_mode = "sparse_baseline_spike"
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

        if anomaly_mode == "sparse_baseline_spike":
            reason = "지출 급증 (baseline이 작아 비율 표시는 생략)"
        elif delta > 0:
            reason = f"지출 급증 (+{round(delta_pct_display or 0):.0f}%)"
        else:
            reason = f"지출 급감 ({round(delta_pct_display or 0):.0f}%)"

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
            anomaly_threshold=anomaly_threshold,
            min_delta_amount=min_delta_amount,
            used_last_closed_month=used_last_closed_month,
            partial_cutoff_day=partial_cutoff_day,
            ref_date=ref_date,
        ),
    )


async def get_discretionary_velocity(
    db_session: AsyncSession,
    *,
    as_of_date: date | None,
    settings: DiscretionaryVelocitySettings,
) -> DiscretionaryVelocityResponse:
    ref_date = as_of_date or date.today()
    period = _month_key(ref_date)
    month_start = date(ref_date.year, ref_date.month, 1)
    month_end = _last_day_of_month(ref_date)
    month_progress_ratio = round(ref_date.day / month_end.day, 4)
    baseline_start = _add_months(month_start, -settings.baseline_months)

    rows = await _load_analytics_transactions(
        db_session,
        start_date=baseline_start,
        end_date=ref_date,
        tx_type="지출",
    )

    baseline_monthly: dict[str, int] = defaultdict(int)
    current_discretionary_spend = 0
    current_total_classifiable_spend = 0
    current_classified_spend = 0
    current_unclassified_spend = 0

    excluded_categories = set(settings.excluded_category_names)
    excluded_merchants = set(settings.excluded_merchants)
    for row in rows:
        if row["loan_account_id"] is not None:
            continue
        merchant = row["merchant"] or row["description"] or "미분류"
        category = row["effective_category_major"] or "미분류"
        if merchant in excluded_merchants or category in excluded_categories:
            continue
        amount = max(0, -row["amount"])
        if amount == 0:
            continue

        row_period = _month_key(row["date"])
        is_discretionary = row["spend_necessity"] == "discretionary"
        is_classified = row["spend_necessity"] in {"essential", "discretionary"}

        if row_period == period:
            current_total_classifiable_spend += amount
            if is_classified:
                current_classified_spend += amount
            else:
                current_unclassified_spend += amount
            if is_discretionary:
                current_discretionary_spend += amount
        elif is_discretionary:
            baseline_monthly[row_period] += amount

    baseline_values = _exclude_outlier_amounts(list(baseline_monthly.values()))
    baseline_monthly_spend = (
        round(sum(baseline_values) / len(baseline_values)) if baseline_values else 0
    )
    baseline_spend_at_same_progress = round(
        baseline_monthly_spend * month_progress_ratio
    )
    velocity_ratio = _safe_ratio(
        current_discretionary_spend,
        baseline_spend_at_same_progress,
    )
    classification_coverage_ratio = _safe_ratio(
        current_classified_spend,
        current_total_classifiable_spend,
    )

    if classification_coverage_ratio is not None and (
        classification_coverage_ratio < settings.minimum_classification_coverage
    ):
        risk_level = "needs_classification"
        confidence = "low"
        reasons = ["분류 커버리지가 낮아 재량 지출 속도 해석 신뢰도가 낮습니다."]
    elif velocity_ratio is None:
        risk_level = "unknown"
        confidence = "low"
        reasons = ["비교 가능한 재량 지출 baseline이 없습니다."]
    elif velocity_ratio >= settings.high_velocity_ratio:
        risk_level = "high"
        confidence = "medium"
        reasons = [f"재량 지출 속도가 baseline 대비 {velocity_ratio:.2f}x입니다."]
    elif velocity_ratio >= settings.warning_velocity_ratio:
        risk_level = "warning"
        confidence = "medium"
        reasons = [f"재량 지출 속도가 baseline 대비 {velocity_ratio:.2f}x입니다."]
    else:
        risk_level = "normal"
        confidence = "medium"
        reasons = [f"재량 지출 속도가 baseline 대비 {velocity_ratio:.2f}x입니다."]

    return DiscretionaryVelocityResponse(
        period=period,
        as_of_date=ref_date,
        month_progress_ratio=month_progress_ratio,
        discretionary_spend=current_discretionary_spend,
        baseline_monthly_spend=baseline_monthly_spend,
        baseline_spend_at_same_progress=baseline_spend_at_same_progress,
        velocity_ratio=velocity_ratio,
        risk_level=risk_level,
        confidence=confidence,
        classification_coverage_ratio=classification_coverage_ratio,
        unclassified_spend=current_unclassified_spend,
        income_basis=None,
        reasons=reasons,
        assumptions=[
            f"최근 {settings.baseline_months}개 마감월 중 데이터가 있는 월의 재량 지출을 사용합니다.",
            "baseline_spend_at_same_progress는 마감월 월평균에 월 진행률을 곱한 값입니다.",
        ],
    )


async def get_purchase_gate_candidates(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    settings: PurchaseGateSettings,
    review_status: str | None = None,
    page: int = 1,
    per_page: int = 10,
) -> PurchaseGateCandidatesResponse:
    ref_end = end_date or date.today()
    ref_start = start_date or date(ref_end.year, ref_end.month, 1)
    lookback_start = _add_months(ref_start, -settings.new_merchant_lookback_months)
    rows = await _load_analytics_transactions(
        db_session,
        start_date=lookback_start,
        end_date=ref_end,
        tx_type="지출",
    )

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
    prior_merchant_monthly: dict[tuple[str, str], int] = defaultdict(int)
    prior_discretionary_monthly: dict[tuple[str, str], int] = defaultdict(int)
    current_merchant_total: dict[str, int] = defaultdict(int)
    current_discretionary_category_total: dict[str, int] = defaultdict(int)

    for row in purchase_rows:
        merchant = row["merchant"] or row["description"] or "미분류"
        category = row["effective_category_major"] or "미분류"
        amount = _purchase_gate_net_amount(row)
        row_period = _month_key(row["date"])
        if ref_start <= row["date"] <= ref_end:
            current_merchant_total[merchant] += amount
            current_discretionary_category_total[category] += amount
        elif row["date"] < ref_start:
            prior_merchant_monthly[(merchant, row_period)] += amount
            prior_discretionary_monthly[(category, row_period)] += amount

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
                signals={"lookback_months": settings.new_merchant_lookback_months},
                risk_level="warning",
                reasons=[
                    f"최근 {settings.new_merchant_lookback_months}개월 내 처음 등장한 거래처입니다."
                ],
            )
        merchant_baseline = _monthly_average(
            amount
            for (baseline_merchant, _), amount in prior_merchant_monthly.items()
            if baseline_merchant == merchant
        )
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
                    "ratio": merchant_spike_ratio,
                    "threshold_ratio": settings.merchant_spike_ratio,
                },
                risk_level="warning",
                reasons=[
                    f"{merchant} 지출이 baseline 대비 {merchant_spike_ratio:.2f}x입니다."
                ],
            )
        discretionary_baseline = _monthly_average(
            amount
            for (baseline_category, _), amount in prior_discretionary_monthly.items()
            if baseline_category == category
        )
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
                    "ratio": discretionary_spike_ratio,
                    "threshold_ratio": settings.discretionary_spike_ratio,
                },
                risk_level="warning",
                reasons=[
                    f"{category} 재량 지출이 baseline 대비 {discretionary_spike_ratio:.2f}x입니다."
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
        assumptions=[
            "후보는 구매 금지/허용 판단이 아니라 사용자 검토 queue입니다.",
            f"기본 cooldown은 {settings.review_cooldown_days}일입니다.",
        ],
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


async def _load_analytics_transactions(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    tx_type: TransactionTypeFilter,
) -> list[AnalyticsRow]:
    canonical = build_transactions_effective_select().subquery(
        "vw_transactions_effective"
    )
    query = select(canonical)
    if start_date is not None:
        query = query.where(canonical.c.date >= start_date)
    if end_date is not None:
        query = query.where(canonical.c.date <= end_date)
    if tx_type != "all":
        query = query.where(canonical.c.type == tx_type)
    result = await db_session.execute(
        query.order_by(
            canonical.c.date.asc(), canonical.c.time.asc(), canonical.c.id.asc()
        )
    )
    rows = [_parse_analytics_row(row) for row in result.mappings().all()]
    if not rows:
        return []
    settlement_netting = await build_confirmed_settlement_analysis_netting(db_session)
    adjusted_rows: list[AnalyticsRow] = []
    for row in rows:
        adjusted_row = _apply_settlement_netting(row, settlement_netting)
        if adjusted_row is not None:
            adjusted_rows.append(adjusted_row)
    return adjusted_rows


def _parse_analytics_row(row: RowMapping) -> AnalyticsRow:
    parsed: AnalyticsRow = {
        "id": int(row["id"]),
        "date": row["date"],
        "time": row["time"],
        "type": str(row["type"]),
        "amount": int(row["amount"]),
        "merchant": row["merchant"],
        "description": str(row["description"]),
        "payment_method": row["payment_method"],
        "effective_category_major": row["effective_category_major"],
        "effective_category_minor": row["effective_category_minor"],
        "cost_kind": row["cost_kind"],
        "fixed_cost_necessity": row["fixed_cost_necessity"],
        "spend_necessity": row["spend_necessity"],
        "loan_account_id": row["loan_account_id"],
        "recurring_payment_kind": row["recurring_payment_kind"],
    }
    settlement_refund_total = row.get("settlement_refund_total")
    if settlement_refund_total is not None:
        parsed["settlement_refund_total"] = int(settlement_refund_total)
    return parsed


def _apply_settlement_netting(
    row: AnalyticsRow,
    settlement_netting: SettlementAnalysisNetting,
) -> AnalyticsRow | None:
    adjusted: AnalyticsRow = {
        "id": row["id"],
        "date": row["date"],
        "time": row["time"],
        "type": row["type"],
        "amount": row["amount"],
        "merchant": row["merchant"],
        "description": row["description"],
        "payment_method": row["payment_method"],
        "effective_category_major": row["effective_category_major"],
        "effective_category_minor": row["effective_category_minor"],
        "cost_kind": row["cost_kind"],
        "fixed_cost_necessity": row["fixed_cost_necessity"],
        "spend_necessity": row["spend_necessity"],
        "loan_account_id": row["loan_account_id"],
        "recurring_payment_kind": row["recurring_payment_kind"],
    }
    adjusted["settlement_refund_total"] = 0

    if row["type"] != "지출":
        return adjusted

    amount = row["amount"]
    transaction_id = row["id"]
    if amount < 0:
        refund_total = settlement_netting.refund_total_by_original_transaction_id.get(
            transaction_id,
            0,
        )
        adjusted["amount"] = amount + refund_total
        adjusted["settlement_refund_total"] = refund_total
    elif transaction_id in settlement_netting.excluded_refund_transaction_ids:
        adjusted["amount"] = 0

    if adjusted["amount"] == 0:
        return None
    return adjusted


def _amount_for_analytics(tx_type: str, amount: int) -> int:
    if tx_type == "지출":
        return -amount
    if tx_type == "이체":
        return abs(amount)
    return amount


def _category_value(row: AnalyticsRow, level: TransactionCategoryLevel) -> str:
    if level == "major":
        return row["effective_category_major"] or "미분류"
    return row["effective_category_minor"] or "미분류"


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
    anomaly_threshold: float,
    min_delta_amount: int,
    used_last_closed_month: bool,
    partial_cutoff_day: int | None,
    ref_date: date,
) -> str:
    parts = [
        f"기준월={target_period}",
        f"baseline={baseline_months}개월 평균 대비",
    ]
    if used_last_closed_month:
        parts.append(f"직전 마감월 기준(as_of={ref_date.isoformat()})")
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
    parts = ["월별 수입 기준, 이체 제외"]
    if used_last_closed_month:
        parts.append(f"직전 마감월 기준(as_of={ref_date.isoformat()})")
    elif partial_cutoff_day is not None:
        parts.append(
            f"부분 기간 비교(기준일={ref_date.isoformat()}, 이전 월도 매월 {partial_cutoff_day}일까지만 집계)"
        )
    return ", ".join(parts)


def _previous_period(period: str) -> str:
    year, month = period.split("-")
    year_int = int(year)
    month_int = int(month)
    if month_int == 1:
        return f"{year_int - 1:04d}-12"
    return f"{year_int:04d}-{month_int - 1:02d}"


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, _last_day_of_month(date(year, month, 1)).day)
    return date(year, month, day)


def _exclude_outlier_amounts(values: list[int]) -> list[int]:
    if len(values) < 3:
        return values
    ordered = sorted(values)
    median = ordered[len(ordered) // 2]
    if median <= 0:
        return values
    filtered = [value for value in values if abs(value - median) / median <= 0.3]
    return filtered or values


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


def _is_purchase_gate_base_row(row: AnalyticsRow) -> bool:
    return (
        row["loan_account_id"] is None
        and row["cost_kind"] != "fixed"
        and row["spend_necessity"] == "discretionary"
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


def _resolved_recurring_payment_kind(kind_counts: dict[str, int]) -> str | None:
    classified = [
        kind
        for kind in ("installment", "monthly_recurring", "not_recurring")
        if kind_counts[kind] > 0
    ]
    if len(classified) == 1 and kind_counts["unclassified"] == 0:
        return classified[0]
    return None


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
