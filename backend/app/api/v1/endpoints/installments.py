from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.installment import (
    InstallmentForecastResponse,
    InstallmentLinkStateFilter,
    InstallmentPlanCreateRequest,
    InstallmentPlanListResponse,
    InstallmentPlanPatchRequest,
    InstallmentPlanResponse,
    InstallmentTransactionLinkBulkUpsertRequest,
    InstallmentTransactionLinkBulkUpsertResponse,
    InstallmentTransactionLinkItem,
    InstallmentTransactionLinkUpsertRequest,
    InstallmentTransactionMappingListResponse,
    TransactionInstallmentLinkResponse,
)
from app.services.installment_service import (
    bulk_upsert_transaction_installment_links,
    create_installment_plan,
    delete_transaction_installment_link,
    get_installment_forecast,
    get_transaction_installment_link,
    list_installment_plans,
    list_installment_transaction_mappings,
    update_installment_plan,
    upsert_transaction_installment_link,
)

router = APIRouter()


@router.get("/installment-plans", response_model=InstallmentPlanListResponse)
async def get_installment_plans(
    db_session: AsyncSession = Depends(get_db_session),
) -> InstallmentPlanListResponse:
    return await list_installment_plans(db_session)


@router.post(
    "/installment-plans",
    response_model=InstallmentPlanResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
async def post_installment_plan(
    payload: InstallmentPlanCreateRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> InstallmentPlanResponse:
    return await create_installment_plan(db_session, payload)


@router.patch(
    "/installment-plans/{plan_id}",
    response_model=InstallmentPlanResponse,
    dependencies=[Depends(require_api_key)],
)
async def patch_installment_plan(
    plan_id: int,
    payload: InstallmentPlanPatchRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> InstallmentPlanResponse:
    return await update_installment_plan(db_session, plan_id, payload)


@router.get(
    "/installment-transaction-links",
    response_model=InstallmentTransactionMappingListResponse,
)
async def get_installment_transaction_links(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    search: str | None = Query(default=None),
    linked: InstallmentLinkStateFilter = Query(default="all"),
    installment_plan_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=40, ge=1, le=200),
    db_session: AsyncSession = Depends(get_db_session),
) -> InstallmentTransactionMappingListResponse:
    return await list_installment_transaction_mappings(
        db_session,
        start_date=start_date,
        end_date=end_date,
        search=search,
        linked=linked,
        installment_plan_id=installment_plan_id,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/transactions/{transaction_id}/installment-link",
    response_model=TransactionInstallmentLinkResponse,
)
async def get_installment_link_for_transaction(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionInstallmentLinkResponse:
    return await get_transaction_installment_link(db_session, transaction_id)


@router.put(
    "/transactions/installment-links/bulk",
    response_model=InstallmentTransactionLinkBulkUpsertResponse,
    dependencies=[Depends(require_api_key)],
)
async def put_installment_links_for_transactions(
    payload: InstallmentTransactionLinkBulkUpsertRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> InstallmentTransactionLinkBulkUpsertResponse:
    return await bulk_upsert_transaction_installment_links(db_session, payload)


@router.put(
    "/transactions/{transaction_id}/installment-link",
    response_model=InstallmentTransactionLinkItem,
    dependencies=[Depends(require_api_key)],
)
async def put_installment_link_for_transaction(
    transaction_id: int,
    payload: InstallmentTransactionLinkUpsertRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> InstallmentTransactionLinkItem:
    return await upsert_transaction_installment_link(db_session, transaction_id, payload)


@router.delete(
    "/transactions/{transaction_id}/installment-link",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key)],
)
async def delete_installment_link_for_transaction(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    await delete_transaction_installment_link(db_session, transaction_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/installments/forecast", response_model=InstallmentForecastResponse)
async def get_installments_forecast(
    as_of_date: date | None = Query(default=None),
    months: int = Query(default=12, ge=1, le=120),
    db_session: AsyncSession = Depends(get_db_session),
) -> InstallmentForecastResponse:
    return await get_installment_forecast(
        db_session,
        as_of_date=as_of_date or date.today(),
        months=months,
    )
