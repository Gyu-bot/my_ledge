from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.data_management import DataResetRequest, DataResetResponse
from app.services.data_reset_service import reset_data

router = APIRouter()


@router.post(
    "/data/reset",
    response_model=DataResetResponse,
    dependencies=[Depends(require_api_key)],
)
async def reset_data_endpoint(
    payload: DataResetRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> DataResetResponse:
    return await reset_data(db_session, scope=payload.scope)
