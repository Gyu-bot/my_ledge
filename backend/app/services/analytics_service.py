from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import Select, select
from sqlalchemy.engine import RowMapping
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.analytics import (
    CategoryMoMItem,
    CategoryMoMResponse,
    FixedCostSummaryResponse,
    MerchantSpendItem,
    MerchantSpendResponse,
    MonthlyCashflowItem,
    MonthlyCashflowResponse,
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
        merchant = row["description"] or "미분류"
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
