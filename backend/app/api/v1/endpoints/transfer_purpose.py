"""Human-set transfer purpose API (T061). Every route requires X-API-Key."""

from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.transfer_purpose import (
    ResolvedTransferPurpose,
    TransferPurposeListResponse,
    TransferPurposeRequest,
    TransferPurposeResponse,
    TransferPurposeRuleCreateRequest,
    TransferPurposeRuleListResponse,
    TransferPurposeRuleResponse,
    TransferPurposeRuleUpdateRequest,
)
from app.services import transfer_purpose_service as service

router = APIRouter(prefix="/transfer-purposes", dependencies=[Depends(require_api_key)])


@router.get("/transactions", response_model=TransferPurposeListResponse)
async def get_transfers(
    start_date: date | None = None,
    end_date: date | None = None,
    purpose: ResolvedTransferPurpose | None = None,
    limit: int = Query(default=200, ge=1, le=2000),
    db_session: AsyncSession = Depends(get_db_session),
) -> TransferPurposeListResponse:
    return await service.list_transfers(
        db_session,
        start_date=start_date,
        end_date=end_date,
        purpose=purpose,
        limit=limit,
    )


@router.get("/transactions/{transaction_id}", response_model=TransferPurposeResponse)
async def get_transfer_purpose(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransferPurposeResponse:
    return await service.explain_transfer(db_session, transaction_id)


@router.put("/transactions/{transaction_id}", response_model=TransferPurposeResponse)
async def put_transfer_purpose(
    transaction_id: int,
    payload: TransferPurposeRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransferPurposeResponse:
    return await service.set_transfer_purpose(
        db_session, transaction_id, payload.purpose
    )


@router.delete("/transactions/{transaction_id}", response_model=TransferPurposeResponse)
async def delete_transfer_purpose(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransferPurposeResponse:
    return await service.clear_transfer_purpose(db_session, transaction_id)


@router.get("/rules", response_model=TransferPurposeRuleListResponse)
async def get_rules(
    db_session: AsyncSession = Depends(get_db_session),
) -> TransferPurposeRuleListResponse:
    return await service.list_rules(db_session)


@router.post(
    "/rules",
    response_model=TransferPurposeRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_rule(
    payload: TransferPurposeRuleCreateRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransferPurposeRuleResponse:
    return await service.create_rule(db_session, payload)


@router.patch("/rules/{rule_id}", response_model=TransferPurposeRuleResponse)
async def patch_rule(
    rule_id: int,
    payload: TransferPurposeRuleUpdateRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransferPurposeRuleResponse:
    return await service.update_rule(db_session, rule_id, payload)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_rule(
    rule_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    await service.delete_rule(db_session, rule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
