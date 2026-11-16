"""Human-entered, append-only monthly spending limits (T062)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.core.validation import UniformValidationRoute, reject_unknown_query_params
from app.schemas.spending_limits import (
    SpendingLimitCreate,
    SpendingLimitHistoryResponse,
    SpendingLimitRevisionResponse,
)
from app.services.spending_limits_service import create_limit, list_limits

router = APIRouter(
    prefix="/spending-limits",
    dependencies=[Depends(require_api_key), Depends(reject_unknown_query_params)],
    route_class=UniformValidationRoute,
)


@router.get("", response_model=SpendingLimitHistoryResponse)
async def get_limits(
    db: AsyncSession = Depends(get_db_session),
) -> SpendingLimitHistoryResponse:
    return await list_limits(db)


@router.post(
    "",
    response_model=SpendingLimitRevisionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_limit(
    payload: SpendingLimitCreate, db: AsyncSession = Depends(get_db_session)
) -> SpendingLimitRevisionResponse:
    return await create_limit(db, payload)
