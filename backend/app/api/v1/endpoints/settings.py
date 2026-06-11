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
        discretionary_velocity=payload.discretionary_velocity.model_dump(
            exclude_unset=True,
        ),
        purchase_gate=payload.purchase_gate.model_dump(exclude_unset=True),
        recurring_dry_run=payload.recurring_dry_run.model_dump(exclude_unset=True),
        asset_liability_health=payload.asset_liability_health.model_dump(
            exclude_unset=True,
        ),
        bulk_operations=payload.bulk_operations.model_dump(exclude_unset=True),
        financial_targets=payload.financial_targets.model_dump(exclude_unset=True),
    )
