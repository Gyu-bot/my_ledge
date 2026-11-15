"""Two-axis nature API (T056). Every route requires X-API-Key."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.nature_axes import (
    CategoryAdjustabilityDefaultListResponse,
    CategoryAdjustabilityDefaultRequest,
    CategoryAdjustabilityDefaultResponse,
    RecurringCommitmentCreateRequest,
    RecurringCommitmentEndRequest,
    RecurringCommitmentListResponse,
    RecurringCommitmentResponse,
    RecurringCommitmentUpdateRequest,
    TransactionAdjustabilityRequest,
    TransactionNatureResponse,
)
from app.services import nature_axes_service as service

router = APIRouter(prefix="/nature", dependencies=[Depends(require_api_key)])


@router.get(
    "/category-defaults", response_model=CategoryAdjustabilityDefaultListResponse
)
async def get_category_defaults(
    db_session: AsyncSession = Depends(get_db_session),
) -> CategoryAdjustabilityDefaultListResponse:
    return await service.list_category_defaults(db_session)


@router.put("/category-defaults", response_model=CategoryAdjustabilityDefaultResponse)
async def put_category_default(
    payload: CategoryAdjustabilityDefaultRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> CategoryAdjustabilityDefaultResponse:
    return await service.set_category_default(db_session, payload)


@router.delete(
    "/category-defaults/{default_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_category_default(
    default_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    await service.delete_category_default(db_session, default_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/recurring-commitments", response_model=RecurringCommitmentListResponse)
async def get_recurring_commitments(
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringCommitmentListResponse:
    return await service.list_commitments(db_session)


@router.post(
    "/recurring-commitments",
    response_model=RecurringCommitmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_recurring_commitment(
    payload: RecurringCommitmentCreateRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringCommitmentResponse:
    return await service.create_commitment(db_session, payload)


@router.patch(
    "/recurring-commitments/{commitment_id}",
    response_model=RecurringCommitmentResponse,
)
async def patch_recurring_commitment(
    commitment_id: int,
    payload: RecurringCommitmentUpdateRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringCommitmentResponse:
    return await service.update_commitment(db_session, commitment_id, payload)


@router.post(
    "/recurring-commitments/{commitment_id}/end",
    response_model=RecurringCommitmentResponse,
)
async def post_end_recurring_commitment(
    commitment_id: int,
    payload: RecurringCommitmentEndRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringCommitmentResponse:
    return await service.end_commitment(db_session, commitment_id, payload.end_date)


@router.delete(
    "/recurring-commitments/{commitment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_recurring_commitment(
    commitment_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    await service.delete_commitment(db_session, commitment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/transactions/{transaction_id}", response_model=TransactionNatureResponse)
async def get_transaction_nature(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionNatureResponse:
    return await service.explain_transaction(db_session, transaction_id)


@router.put(
    "/transactions/{transaction_id}/adjustability",
    response_model=TransactionNatureResponse,
)
async def put_transaction_adjustability(
    transaction_id: int,
    payload: TransactionAdjustabilityRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionNatureResponse:
    return await service.set_transaction_adjustability(
        db_session, transaction_id, payload.adjustability
    )


@router.delete(
    "/transactions/{transaction_id}/adjustability",
    response_model=TransactionNatureResponse,
)
async def delete_transaction_adjustability(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionNatureResponse:
    return await service.clear_transaction_adjustability(db_session, transaction_id)
