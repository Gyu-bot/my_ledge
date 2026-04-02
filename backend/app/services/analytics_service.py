import math
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import Select, select
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.analytics import (
    CategoryMoMItem,
    CategoryMoMResponse,
    FixedCostSummaryResponse,
    IncomeMonthlyItem,
    IncomeStabilityResponse,
    MerchantSpendItem,
    MerchantSpendResponse,
    MonthlyCashflowItem,
    MonthlyCashflowResponse,
    PaymentMethodPatternItem,
    PaymentMethodPatternsResponse,
    RecurringPaymentItem,
    RecurringPaymentsResponse,
    SpendingAnomalyItem,
    SpendingAnomaliesResponse,
)
from app.schemas.transaction import TransactionCategoryLevel, TransactionTypeFilter
from app.services.canonical_views import build_transactions_effective_select


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
        unclassified_total=unclassified_total,
        unclassified_count=unclassified_count,
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
            avg_amount=round(values["amount"] / values["count"]) if values["count"] else 0,
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
    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type="수입",
    )

    monthly: dict[str, int] = defaultdict(int)
    for row in rows:
        monthly[_month_key(row["date"])] += row["amount"]

    items = [IncomeMonthlyItem(period=p, income=monthly[p]) for p in sorted(monthly)]
    values = [item.income for item in items]

    if not values:
        return IncomeStabilityResponse(
            items=[],
            avg=0,
            stdev=None,
            coefficient_of_variation=None,
            assumptions="월별 수입 기준, 이체 제외",
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
        assumptions="월별 수입 기준, 이체 제외",
    )


async def get_recurring_payments(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    min_occurrences: int,
) -> RecurringPaymentsResponse:
    rows = await _load_analytics_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type="지출",
    )

    desc_data: dict[str, dict] = defaultdict(
        lambda: {"dates": [], "amounts": [], "category": "미분류"}
    )
    for row in rows:
        desc = row["description"] or "미분류"
        desc_data[desc]["dates"].append(row["date"])
        desc_data[desc]["amounts"].append(-row["amount"])
        desc_data[desc]["category"] = row["effective_category_major"] or "미분류"

    items = []
    for desc, data in desc_data.items():
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
            confidence = round(max(0.0, 1.0 - gap_stdev / avg_gap), 4) if avg_gap > 0 else 0.0
        else:
            confidence = 0.5

        avg_amount = round(sum(data["amounts"]) / len(data["amounts"]))
        items.append(
            RecurringPaymentItem(
                description=desc,
                category=data["category"],
                avg_amount=avg_amount,
                interval_type=interval_type,
                avg_interval_days=round(avg_gap, 2),
                occurrences=len(dates),
                confidence=confidence,
                last_date=dates[-1],
            )
        )

    items.sort(key=lambda item: (-item.confidence, -item.occurrences, item.description))
    return RecurringPaymentsResponse(
        items=items,
        assumptions="지출 거래 기준, 동일 description의 반복 간격으로 판단. 25-35일=monthly, 6-8일=weekly",
    )


async def get_spending_anomalies(
    db_session: AsyncSession,
    *,
    end_date: date | None,
    baseline_months: int,
    anomaly_threshold: float,
) -> SpendingAnomaliesResponse:
    ref_date = end_date or date.today()
    target_period = _month_key(ref_date)

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
        category = row["effective_category_major"] or "미분류"
        grouped[(period, category)] += -row["amount"]

    # baseline periods
    baseline_periods: list[str] = []
    y, m = baseline_start_year, baseline_start_month
    while _month_key(date(y, m, 1)) < target_period:
        baseline_periods.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1

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
            b_var = sum((v - baseline_avg) ** 2 for v in baseline_amounts) / len(baseline_amounts)
            b_stdev = math.sqrt(b_var)
        else:
            b_stdev = 0.0

        delta = target_amount - baseline_avg
        delta_pct = _safe_ratio(delta * 100, baseline_avg)

        if b_stdev > 0:
            anomaly_score = round(abs(delta) / b_stdev, 4)
        elif baseline_avg > 0:
            anomaly_score = round(abs(delta) / baseline_avg, 4)
        else:
            anomaly_score = 0.0

        if anomaly_score < anomaly_threshold:
            continue

        if delta > 0:
            reason = f"지출 급증 (+{round(delta_pct or 0):.0f}%)"
        else:
            reason = f"지출 급감 ({round(delta_pct or 0):.0f}%)"

        items.append(
            SpendingAnomalyItem(
                period=target_period,
                category=category,
                amount=target_amount,
                baseline_avg=baseline_avg,
                delta_pct=delta_pct,
                anomaly_score=anomaly_score,
                reason=reason,
            )
        )

    items.sort(key=lambda item: (-item.anomaly_score, item.category))
    return SpendingAnomaliesResponse(
        items=items,
        assumptions=f"기준월={target_period}, baseline={baseline_months}개월 평균 대비, threshold={anomaly_threshold}",
    )


async def _load_analytics_transactions(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    tx_type: TransactionTypeFilter,
) -> list[RowMapping]:
    query, canonical = _build_analytics_query(
        start_date=start_date,
        end_date=end_date,
        tx_type=tx_type,
    )
    result = await db_session.execute(
        query.order_by(canonical.c.date.asc(), canonical.c.time.asc(), canonical.c.id.asc())
    )
    return result.mappings().all()


def _build_analytics_query(
    *,
    start_date: date | None,
    end_date: date | None,
    tx_type: TransactionTypeFilter,
) -> tuple[Select, object]:
    canonical = build_transactions_effective_select().subquery("vw_transactions_effective")
    query = select(canonical)
    if start_date is not None:
        query = query.where(canonical.c.date >= start_date)
    if end_date is not None:
        query = query.where(canonical.c.date <= end_date)
    if tx_type != "all":
        query = query.where(canonical.c.type == tx_type)
    return query, canonical


def _amount_for_analytics(tx_type: str, amount: int) -> int:
    if tx_type == "지출":
        return -amount
    if tx_type == "이체":
        return abs(amount)
    return amount


def _category_value(row: RowMapping, level: TransactionCategoryLevel) -> str:
    if level == "major":
        return row["effective_category_major"] or "미분류"
    return row["effective_category_minor"] or "미분류"


def _month_key(value: date) -> str:
    return value.strftime("%Y-%m")


def _previous_period(period: str) -> str:
    year, month = period.split("-")
    year_int = int(year)
    month_int = int(month)
    if month_int == 1:
        return f"{year_int - 1:04d}-12"
    return f"{year_int:04d}-{month_int - 1:02d}"


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return round(numerator / denominator, 4)
