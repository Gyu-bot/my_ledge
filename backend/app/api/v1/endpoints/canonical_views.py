from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.canonical_views import CanonicalViewsDashboardResponse
from app.services.canonical_views_dashboard_service import (
    get_canonical_views_dashboard,
)

router = APIRouter()


@router.get(
    "/canonical-views/dashboard",
    response_model=CanonicalViewsDashboardResponse,
    dependencies=[Depends(require_api_key)],
)
async def get_canonical_dashboard(
    months: int = Query(default=12, ge=1, le=36),
    merchant_limit: int = Query(default=10, ge=1, le=50),
    queue_limit: int = Query(default=10, ge=1, le=50),
    reference_date: date | None = Query(default=None),
    db_session: AsyncSession = Depends(get_db_session),
) -> CanonicalViewsDashboardResponse:
    return await get_canonical_views_dashboard(
        db_session,
        months=months,
        merchant_limit=merchant_limit,
        queue_limit=queue_limit,
        reference_date=reference_date,
    )
