from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.schemas.profile import ProfileResponse
from app.services.profile_service import get_profile

router = APIRouter()


@router.get("/profile", response_model=ProfileResponse)
async def get_profile_endpoint(
    db_session: AsyncSession = Depends(get_db_session),
) -> ProfileResponse:
    return await get_profile(db_session)
