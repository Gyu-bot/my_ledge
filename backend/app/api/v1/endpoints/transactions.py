from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.transaction import (
    CategorySummaryResponse,
    CategoryTimelineResponse,
    PaymentMethodSummaryResponse,
    TransactionBulkUpdateRequest,
    TransactionBulkUpdateResponse,
    TransactionCategoryLevel,
    TransactionCreateRequest,
    TransactionEditedFilter,
    TransactionFilterOptionsResponse,
    TransactionGroupBy,
    TransactionListResponse,
    TransactionMergeRequest,
    TransactionResponse,
    TransactionSourceFilter,
    TransactionSummaryResponse,
    TransactionTypeFilter,
    TransactionUpdateRequest,
)
from app.services.transactions_service import (
    bulk_update_transactions,
    create_transaction,
    list_transaction_filter_options,
    list_transactions,
    restore_transaction,
    soft_delete_transaction,
    summarize_by_category,
    summarize_category_timeline,
    summarize_by_payment_method,
    summarize_transactions,
    update_transaction,
)

router = APIRouter()


@router.get("/transactions", response_model=TransactionListResponse)
async def get_transactions(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    type: TransactionTypeFilter = Query(default="all"),
    source: TransactionSourceFilter = Query(default="all"),
    category_major: str | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    is_edited: TransactionEditedFilter = Query(default="all"),
    include_deleted: bool = Query(default=False),
    include_merged: bool = Query(default=False),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionListResponse:
    return await list_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        tx_type=type,
        source=source,
        category_major=category_major,
        payment_method=payment_method,
        is_edited=is_edited,
        include_deleted=include_deleted,
        include_merged=include_merged,
        search=search,
        page=page,
        per_page=per_page,
    )


@router.get("/transactions/filter-options", response_model=TransactionFilterOptionsResponse)
async def get_transaction_filter_options(
    include_deleted: bool = Query(default=False),
    include_merged: bool = Query(default=False),
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionFilterOptionsResponse:
    return await list_transaction_filter_options(
        db_session,
        include_deleted=include_deleted,
        include_merged=include_merged,
    )


@router.get("/transactions/summary", response_model=TransactionSummaryResponse)
async def get_transaction_summary(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    group_by: TransactionGroupBy = Query(default="month"),
    type: TransactionTypeFilter = Query(default="all"),
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionSummaryResponse:
    return await summarize_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        group_by=group_by,
        tx_type=type,
    )


@router.get("/transactions/by-category", response_model=CategorySummaryResponse)
async def get_transactions_by_category(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    level: TransactionCategoryLevel = Query(default="major"),
    type: TransactionTypeFilter = Query(default="all"),
    db_session: AsyncSession = Depends(get_db_session),
) -> CategorySummaryResponse:
    return await summarize_by_category(
        db_session,
        start_date=start_date,
        end_date=end_date,
        level=level,
        tx_type=type,
    )


@router.get("/transactions/by-category/timeline", response_model=CategoryTimelineResponse)
async def get_transactions_by_category_timeline(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    level: TransactionCategoryLevel = Query(default="major"),
    type: TransactionTypeFilter = Query(default="지출"),
    db_session: AsyncSession = Depends(get_db_session),
) -> CategoryTimelineResponse:
    return await summarize_category_timeline(
        db_session,
        start_date=start_date,
        end_date=end_date,
        level=level,
        tx_type=type,
    )


@router.get("/transactions/payment-methods", response_model=PaymentMethodSummaryResponse)
async def get_transaction_payment_methods(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> PaymentMethodSummaryResponse:
    return await summarize_by_payment_method(
        db_session,
        start_date=start_date,
        end_date=end_date,
    )


@router.post(
    "/transactions",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
async def create_manual_transaction(
    payload: TransactionCreateRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionResponse:
    return await create_transaction(db_session, payload)


@router.patch(
    "/transactions/bulk-update",
    response_model=TransactionBulkUpdateResponse,
    dependencies=[Depends(require_api_key)],
)
async def bulk_update_transaction_categories(
    payload: TransactionBulkUpdateRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionBulkUpdateResponse:
    return await bulk_update_transactions(db_session, payload)


@router.patch(
    "/transactions/{transaction_id}",
    response_model=TransactionResponse,
    dependencies=[Depends(require_api_key)],
)
async def patch_transaction(
    transaction_id: int,
    payload: TransactionUpdateRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionResponse:
    return await update_transaction(db_session, transaction_id, payload)


@router.delete(
    "/transactions/{transaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key)],
)
async def delete_transaction(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    await soft_delete_transaction(db_session, transaction_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/transactions/{transaction_id}/restore",
    response_model=TransactionResponse,
    dependencies=[Depends(require_api_key)],
)
async def restore_deleted_transaction(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionResponse:
    return await restore_transaction(db_session, transaction_id)


@router.post(
    "/transactions/merge",
    dependencies=[Depends(require_api_key)],
)
async def merge_transactions(_: TransactionMergeRequest) -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Merge is out of MVP scope.",
    )
