from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.analytics import (
    IncomeStabilityResponse,
    MerchantSpendResponse,
    MonthlyCashflowResponse,
    PaymentMethodPatternsResponse,
    PurchaseGateReviewPatchRequest,
    PurchaseGateReviewResponse,
)
from app.schemas.transaction import TransactionTypeFilter
from app.services.analytics_service import (
    get_income_stability,
    get_merchant_spend,
    get_monthly_cashflow,
    get_payment_method_patterns,
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
