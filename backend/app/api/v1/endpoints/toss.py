from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.toss import TossStatus, TossSyncRequest, TossSyncResponse
from app.services import toss_service

router = APIRouter(prefix="/integrations/toss", tags=["toss"])


@router.get("/status", response_model=TossStatus)
async def status(db: AsyncSession = Depends(get_db_session)):
    return await toss_service.get_status(db)


@router.post(
    "/sync", response_model=TossSyncResponse, dependencies=[Depends(require_api_key)]
)
async def sync(payload: TossSyncRequest, db: AsyncSession = Depends(get_db_session)):
    return await toss_service.sync(db, payload)
