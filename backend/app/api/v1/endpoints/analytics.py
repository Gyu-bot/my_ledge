from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.schemas.analytics import (
    CategoryMoMResponse,
    FixedCostSummaryResponse,
    IncomeStabilityResponse,
    MerchantSpendResponse,
    MonthlyCashflowResponse,
    PaymentMethodPatternsResponse,
    RecurringPaymentsResponse,
    SpendingAnomaliesResponse,
)
from app.schemas.transaction import TransactionCategoryLevel, TransactionTypeFilter
from app.services.analytics_service import (
    get_category_mom,
    get_fixed_cost_summary,
    get_income_stability,
    get_merchant_spend,
    get_monthly_cashflow,
    get_payment_method_patterns,
    get_recurring_payments,
    get_spending_anomalies,
)

router = APIRouter()


@router.get("/analytics/monthly-cashflow", response_model=MonthlyCashflowResponse)
async def get_analytics_monthly_cashflow(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> MonthlyCashflowResponse:
    return await get_monthly_cashflow(
        db_session,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/analytics/category-mom", response_model=CategoryMoMResponse)
async def get_analytics_category_mom(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    level: TransactionCategoryLevel = Query(default="major"),
    type: TransactionTypeFilter = Query(default="지출"),
    db_session: AsyncSession = Depends(get_db_session),
) -> CategoryMoMResponse:
    return await get_category_mom(
        db_session,
        start_date=start_date,
        end_date=end_date,
        level=level,
        tx_type=type,
    )


@router.get("/analytics/fixed-cost-summary", response_model=FixedCostSummaryResponse)
async def get_analytics_fixed_cost_summary(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> FixedCostSummaryResponse:
    return await get_fixed_cost_summary(
        db_session,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/analytics/merchant-spend", response_model=MerchantSpendResponse)
async def get_analytics_merchant_spend(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    type: TransactionTypeFilter = Query(default="지출"),
    limit: int = Query(default=20, ge=1, le=200),
    db_session: AsyncSession = Depends(get_db_session),
) -> MerchantSpendResponse:
    return await get_merchant_spend(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type=type,
        limit=limit,
    )


@router.get("/analytics/payment-method-patterns", response_model=PaymentMethodPatternsResponse)
async def get_analytics_payment_method_patterns(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    type: TransactionTypeFilter = Query(default="지출"),
    db_session: AsyncSession = Depends(get_db_session),
) -> PaymentMethodPatternsResponse:
    return await get_payment_method_patterns(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type=type,
    )


@router.get("/analytics/income-stability", response_model=IncomeStabilityResponse)
async def get_analytics_income_stability(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> IncomeStabilityResponse:
    return await get_income_stability(
        db_session,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/analytics/recurring-payments", response_model=RecurringPaymentsResponse)
async def get_analytics_recurring_payments(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    min_occurrences: int = Query(default=2, ge=2),
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringPaymentsResponse:
    return await get_recurring_payments(
        db_session,
        start_date=start_date,
        end_date=end_date,
        min_occurrences=min_occurrences,
    )


@router.get("/analytics/spending-anomalies", response_model=SpendingAnomaliesResponse)
async def get_analytics_spending_anomalies(
    end_date: date | None = Query(default=None),
    baseline_months: int = Query(default=3, ge=1, le=12),
    anomaly_threshold: float = Query(default=0.5, ge=0.0),
    db_session: AsyncSession = Depends(get_db_session),
) -> SpendingAnomaliesResponse:
    return await get_spending_anomalies(
        db_session,
        end_date=end_date,
        baseline_months=baseline_months,
        anomaly_threshold=anomaly_threshold,
    )
