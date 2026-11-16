from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.analytics import (
    FixedCostSummaryResponse,
    FixedCostTrendResponse,
    IncomeStabilityResponse,
    MerchantSpendResponse,
    MonthlyCashflowResponse,
    PaymentMethodPatternsResponse,
    PurchaseGateReviewPatchRequest,
    PurchaseGateReviewResponse,
    RecurringPaymentsResponse,
)
from app.schemas.transaction import TransactionTypeFilter
from app.services.analytics_service import (
    get_fixed_cost_summary,
    get_fixed_cost_trend,
    get_income_stability,
    get_merchant_spend,
    get_monthly_cashflow,
    get_payment_method_patterns,
    get_recurring_payments,
    update_purchase_gate_candidate_review,
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


@router.get("/analytics/fixed-cost-trend", response_model=FixedCostTrendResponse)
async def get_analytics_fixed_cost_trend(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> FixedCostTrendResponse:
    return await get_fixed_cost_trend(
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


@router.get(
    "/analytics/payment-method-patterns", response_model=PaymentMethodPatternsResponse
)
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
    activity: Literal["all", "active", "history"] = Query(default="all"),
    recent_days: int = Query(default=90, ge=1, le=730),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=1, le=100),
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringPaymentsResponse:
    return await get_recurring_payments(
        db_session,
        start_date=start_date,
        end_date=end_date,
        min_occurrences=min_occurrences,
        activity=activity,
        recent_days=recent_days,
        page=page,
        per_page=per_page,
    )


@router.patch(
    "/analytics/purchase-gate-candidates/{candidate_key}/review",
    response_model=PurchaseGateReviewResponse,
    dependencies=[Depends(require_api_key)],
)
async def patch_analytics_purchase_gate_candidate_review(
    candidate_key: str,
    payload: PurchaseGateReviewPatchRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> PurchaseGateReviewResponse:
    return await update_purchase_gate_candidate_review(
        db_session,
        candidate_key=candidate_key,
        payload=payload,
    )
