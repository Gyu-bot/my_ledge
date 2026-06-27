from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.settlement import SettlementMatchResponse, SettlementMatchUpsertRequest
from app.services.settlement_match_service import (
    delete_manual_settlement_match,
    upsert_manual_settlement_match,
)

router = APIRouter()


@router.put(
    "/transactions/{transaction_id}/settlement-match",
    response_model=SettlementMatchResponse,
    dependencies=[Depends(require_api_key)],
)
async def put_transaction_settlement_match(
    transaction_id: int,
    payload: SettlementMatchUpsertRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> SettlementMatchResponse:
    return await upsert_manual_settlement_match(
        db_session,
        settlement_transaction_id=transaction_id,
        payload=payload,
    )


@router.delete(
    "/transactions/{transaction_id}/settlement-match",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key)],
)
async def delete_transaction_settlement_match(
    transaction_id: int,
    original_transaction_id: int = Query(ge=1),
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    await delete_manual_settlement_match(
        db_session,
        settlement_transaction_id=transaction_id,
        original_transaction_id=original_transaction_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
