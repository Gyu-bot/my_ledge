from collections.abc import Mapping

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.schemas.settings import (
    AnalyticsSavedSettingsSection,
    AnalyticsSettingsResponse,
    AnalyticsSettingsSection,
    SpendingAnomaliesSavedSettings,
    SpendingAnomaliesSettings,
)

SPENDING_ANOMALIES_SCOPE = "analytics.spending_anomalies"

DEFAULT_SPENDING_ANOMALIES_SETTINGS = SpendingAnomaliesSettings(
    min_delta_amount=100_000,
    anomaly_threshold=0.5,
    baseline_months=3,
)

_SETTING_KEYS = {
    "min_delta_amount": int,
    "anomaly_threshold": float,
    "baseline_months": int,
}


async def get_analytics_settings(db_session: AsyncSession) -> AnalyticsSettingsResponse:
    saved = await _load_spending_anomalies_saved_settings(db_session)
    return _build_analytics_settings_response(saved)


async def patch_analytics_settings(
    db_session: AsyncSession,
    *,
    spending_anomalies: Mapping[str, int | float | None],
) -> AnalyticsSettingsResponse:
    for key, value in spending_anomalies.items():
        if key not in _SETTING_KEYS:
            continue
        if value is None:
            await db_session.execute(
                delete(AppSetting)
                .where(AppSetting.scope == SPENDING_ANOMALIES_SCOPE)
                .where(AppSetting.key == key)
            )
            continue

        existing = await db_session.scalar(
            select(AppSetting)
            .where(AppSetting.scope == SPENDING_ANOMALIES_SCOPE)
            .where(AppSetting.key == key)
        )
        serialized_value = str(value)
        if existing is None:
            db_session.add(
                AppSetting(
                    scope=SPENDING_ANOMALIES_SCOPE,
                    key=key,
                    value=serialized_value,
                )
            )
        else:
            existing.value = serialized_value

    await db_session.commit()
    return await get_analytics_settings(db_session)


async def resolve_spending_anomalies_settings(
    db_session: AsyncSession,
    *,
    baseline_months: int | None,
    anomaly_threshold: float | None,
    min_delta_amount: int | None,
) -> SpendingAnomaliesSettings:
    settings = await get_analytics_settings(db_session)
    effective = settings.effective.spending_anomalies
    return SpendingAnomaliesSettings(
        baseline_months=baseline_months
        if baseline_months is not None
        else effective.baseline_months,
        anomaly_threshold=anomaly_threshold
        if anomaly_threshold is not None
        else effective.anomaly_threshold,
        min_delta_amount=min_delta_amount
        if min_delta_amount is not None
        else effective.min_delta_amount,
    )


async def _load_spending_anomalies_saved_settings(
    db_session: AsyncSession,
) -> SpendingAnomaliesSavedSettings:
    result = await db_session.execute(
        select(AppSetting).where(AppSetting.scope == SPENDING_ANOMALIES_SCOPE)
    )
    raw_values = {row.key: row.value for row in result.scalars().all()}
    parsed_values: dict[str, int | float | None] = {}
    for key, parser in _SETTING_KEYS.items():
        raw_value = raw_values.get(key)
        parsed_values[key] = parser(raw_value) if raw_value is not None else None
    return SpendingAnomaliesSavedSettings(**parsed_values)


def _build_analytics_settings_response(
    saved: SpendingAnomaliesSavedSettings,
) -> AnalyticsSettingsResponse:
    defaults = DEFAULT_SPENDING_ANOMALIES_SETTINGS
    effective = SpendingAnomaliesSettings(
        min_delta_amount=saved.min_delta_amount
        if saved.min_delta_amount is not None
        else defaults.min_delta_amount,
        anomaly_threshold=saved.anomaly_threshold
        if saved.anomaly_threshold is not None
        else defaults.anomaly_threshold,
        baseline_months=saved.baseline_months
        if saved.baseline_months is not None
        else defaults.baseline_months,
    )
    return AnalyticsSettingsResponse(
        defaults=AnalyticsSettingsSection(spending_anomalies=defaults),
        saved=AnalyticsSavedSettingsSection(spending_anomalies=saved),
        effective=AnalyticsSettingsSection(spending_anomalies=effective),
    )
