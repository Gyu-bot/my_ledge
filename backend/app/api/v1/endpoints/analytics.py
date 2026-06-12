from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.analytics import (
    CategoryMoMResponse,
    DiscretionaryVelocityResponse,
    FixedCostSummaryResponse,
    FixedCostTrendResponse,
    IncomeStabilityResponse,
    MerchantSpendResponse,
    MonthlyCashflowResponse,
    PaymentMethodPatternsResponse,
    PurchaseGateCandidatesResponse,
    PurchaseGateReviewPatchRequest,
    PurchaseGateReviewResponse,
    RecurringPaymentsResponse,
    SpendingAnomaliesResponse,
)
from app.schemas.transaction import TransactionCategoryLevel, TransactionTypeFilter
from app.services.analytics_service import (
    get_category_mom,
    get_discretionary_velocity,
    get_fixed_cost_summary,
    get_fixed_cost_trend,
    get_income_stability,
    get_merchant_spend,
    get_monthly_cashflow,
    get_payment_method_patterns,
    get_purchase_gate_candidates,
    get_recurring_payments,
    get_spending_anomalies,
    update_purchase_gate_candidate_review,
)
from app.services.settings_service import (
    get_analytics_settings,
    resolve_spending_anomalies_settings,
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
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=1, le=100),
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringPaymentsResponse:
    return await get_recurring_payments(
        db_session,
        start_date=start_date,
        end_date=end_date,
        min_occurrences=min_occurrences,
        page=page,
        per_page=per_page,
    )


@router.get("/analytics/spending-anomalies", response_model=SpendingAnomaliesResponse)
async def get_analytics_spending_anomalies(
    end_date: date | None = Query(default=None),
    baseline_months: int | None = Query(default=None, ge=1, le=12),
    anomaly_threshold: float | None = Query(default=None, ge=0.0),
    min_delta_amount: int | None = Query(default=None, ge=0),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=1, le=100),
    db_session: AsyncSession = Depends(get_db_session),
) -> SpendingAnomaliesResponse:
    resolved_settings = await resolve_spending_anomalies_settings(
        db_session,
        baseline_months=baseline_months,
        anomaly_threshold=anomaly_threshold,
        min_delta_amount=min_delta_amount,
    )
    return await get_spending_anomalies(
        db_session,
        end_date=end_date,
        baseline_months=resolved_settings.baseline_months,
        anomaly_threshold=resolved_settings.anomaly_threshold,
        min_delta_amount=resolved_settings.min_delta_amount,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/analytics/discretionary-velocity",
    response_model=DiscretionaryVelocityResponse,
)
async def get_analytics_discretionary_velocity(
    as_of_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> DiscretionaryVelocityResponse:
    settings = await get_analytics_settings(db_session)
    return await get_discretionary_velocity(
        db_session,
        as_of_date=as_of_date,
        settings=settings.effective.discretionary_velocity,
    )


@router.get(
    "/analytics/purchase-gate-candidates",
    response_model=PurchaseGateCandidatesResponse,
)
async def get_analytics_purchase_gate_candidates(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    review_status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=1, le=100),
    db_session: AsyncSession = Depends(get_db_session),
) -> PurchaseGateCandidatesResponse:
    return await _get_purchase_review_candidates(
        db_session=db_session,
        start_date=start_date,
        end_date=end_date,
        review_status=review_status,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/analytics/spending-review-candidates",
    response_model=PurchaseGateCandidatesResponse,
)
async def get_analytics_spending_review_candidates(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    review_status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=10, ge=1, le=100),
    db_session: AsyncSession = Depends(get_db_session),
) -> PurchaseGateCandidatesResponse:
    return await _get_purchase_review_candidates(
        db_session=db_session,
        start_date=start_date,
        end_date=end_date,
        review_status=review_status,
        page=page,
        per_page=per_page,
    )


async def _get_purchase_review_candidates(
    *,
    db_session: AsyncSession,
    start_date: date | None,
    end_date: date | None,
    review_status: str | None,
    page: int,
    per_page: int,
) -> PurchaseGateCandidatesResponse:
    settings = await get_analytics_settings(db_session)
    return await get_purchase_gate_candidates(
        db_session,
        start_date=start_date,
        end_date=end_date,
        settings=settings.effective.purchase_gate,
        review_status=review_status,
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
