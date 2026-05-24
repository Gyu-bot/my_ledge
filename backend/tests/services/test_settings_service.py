from sqlalchemy.ext.asyncio import AsyncSession

from app.services.settings_service import (
    get_analytics_settings,
    patch_analytics_settings,
    resolve_spending_anomalies_settings,
)


async def test_analytics_settings_defaults_when_no_saved_values(
    db_session: AsyncSession,
) -> None:
    settings = await get_analytics_settings(db_session)

    assert settings.defaults.spending_anomalies.min_delta_amount == 100_000
    assert settings.defaults.spending_anomalies.anomaly_threshold == 0.5
    assert settings.defaults.spending_anomalies.baseline_months == 3
    assert settings.saved.spending_anomalies.min_delta_amount is None
    assert settings.effective.spending_anomalies.min_delta_amount == 100_000


async def test_patch_analytics_settings_persists_and_resets_individual_values(
    db_session: AsyncSession,
) -> None:
    saved = await patch_analytics_settings(
        db_session,
        spending_anomalies={
            "min_delta_amount": 30_000,
            "anomaly_threshold": 1.25,
        },
    )

    assert saved.saved.spending_anomalies.min_delta_amount == 30_000
    assert saved.saved.spending_anomalies.anomaly_threshold == 1.25
    assert saved.saved.spending_anomalies.baseline_months is None
    assert saved.effective.spending_anomalies.min_delta_amount == 30_000
    assert saved.effective.spending_anomalies.baseline_months == 3

    reset = await patch_analytics_settings(
        db_session,
        spending_anomalies={"min_delta_amount": None},
    )

    assert reset.saved.spending_anomalies.min_delta_amount is None
    assert reset.saved.spending_anomalies.anomaly_threshold == 1.25
    assert reset.effective.spending_anomalies.min_delta_amount == 100_000
    assert reset.effective.spending_anomalies.anomaly_threshold == 1.25


async def test_resolve_spending_anomalies_settings_prefers_overrides_then_saved(
    db_session: AsyncSession,
) -> None:
    await patch_analytics_settings(
        db_session,
        spending_anomalies={
            "min_delta_amount": 30_000,
            "anomaly_threshold": 1.25,
            "baseline_months": 6,
        },
    )

    resolved = await resolve_spending_anomalies_settings(
        db_session,
        baseline_months=2,
        anomaly_threshold=None,
        min_delta_amount=None,
    )

    assert resolved.baseline_months == 2
    assert resolved.anomaly_threshold == 1.25
    assert resolved.min_delta_amount == 30_000
