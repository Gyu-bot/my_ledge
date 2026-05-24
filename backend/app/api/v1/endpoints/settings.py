from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.settings import (
    AnalyticsSettingsPatchRequest,
    AnalyticsSettingsResponse,
)
from app.services.settings_service import (
    get_analytics_settings,
    patch_analytics_settings,
)

router = APIRouter(
    dependencies=[Depends(require_api_key)],
)


@router.get("/settings/analytics", response_model=AnalyticsSettingsResponse)
async def get_analytics_settings_endpoint(
    db_session: AsyncSession = Depends(get_db_session),
) -> AnalyticsSettingsResponse:
    return await get_analytics_settings(db_session)


@router.patch("/settings/analytics", response_model=AnalyticsSettingsResponse)
async def patch_analytics_settings_endpoint(
    payload: AnalyticsSettingsPatchRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> AnalyticsSettingsResponse:
    return await patch_analytics_settings(
        db_session,
        spending_anomalies=payload.spending_anomalies.model_dump(exclude_unset=True),
    )
