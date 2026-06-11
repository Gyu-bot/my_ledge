from collections.abc import Mapping
import json
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.schemas.settings import (
    AssetLiabilityHealthSavedSettings,
    AssetLiabilityHealthSettings,
    BulkOperationsSavedSettings,
    BulkOperationsSettings,
    DiscretionaryVelocitySavedSettings,
    DiscretionaryVelocitySettings,
    FinancialTargetsSavedSettings,
    FinancialTargetsSettings,
    AnalyticsSavedSettingsSection,
    AnalyticsSettingsResponse,
    AnalyticsSettingsSection,
    PurchaseGateSavedSettings,
    PurchaseGateSettings,
    RecurringDryRunSavedSettings,
    RecurringDryRunSettings,
    SpendingAnomaliesSavedSettings,
    SpendingAnomaliesSettings,
)

SPENDING_ANOMALIES_SCOPE = "analytics.spending_anomalies"
DISCRETIONARY_VELOCITY_SCOPE = "analytics.discretionary_velocity"
PURCHASE_GATE_SCOPE = "analytics.purchase_gate"
RECURRING_DRY_RUN_SCOPE = "analytics.recurring_dry_run"
ASSET_LIABILITY_HEALTH_SCOPE = "analytics.asset_liability_health"
BULK_OPERATIONS_SCOPE = "analytics.bulk_operations"
FINANCIAL_TARGETS_SCOPE = "analytics.financial_targets"

DEFAULT_SPENDING_ANOMALIES_SETTINGS = SpendingAnomaliesSettings(
    min_delta_amount=100_000,
    anomaly_threshold=0.5,
    baseline_months=3,
)
DEFAULT_DISCRETIONARY_VELOCITY_SETTINGS = DiscretionaryVelocitySettings(
    baseline_months=6,
    outlier_policy="median_30pct_exclusion",
    warning_velocity_ratio=1.2,
    high_velocity_ratio=1.5,
    minimum_classification_coverage=0.7,
    baseline_mode="prorated_closed_month_baseline",
    excluded_category_names=[],
    excluded_merchants=[],
)
DEFAULT_PURCHASE_GATE_SETTINGS = PurchaseGateSettings(
    large_purchase_threshold=100_000,
    min_candidate_amount=100_000,
    new_merchant_lookback_months=6,
    merchant_spike_ratio=2.0,
    discretionary_spike_ratio=1.5,
    review_cooldown_days=14,
    candidate_risk_threshold="warning",
    enabled_candidate_types=[
        "large_oneoff",
        "new_merchant",
        "merchant_spike",
        "discretionary_spike",
    ],
    excluded_category_names=[],
    excluded_merchants=[],
)
DEFAULT_RECURRING_DRY_RUN_SETTINGS = RecurringDryRunSettings(
    min_occurrences=2,
    min_distinct_months=2,
    min_distinct_days=2,
    max_amount_cv=0.5,
    monthly_interval_days_min=25,
    monthly_interval_days_max=35,
    weekly_interval_days_min=6,
    weekly_interval_days_max=8,
    minimum_confidence=0.5,
    default_apply_scope="all_matching",
    upload_auto_apply=False,
)
DEFAULT_ASSET_LIABILITY_HEALTH_SETTINGS = AssetLiabilityHealthSettings(
    emergency_fund_included_tiers=["immediate"],
    show_near_liquid_as_secondary=True,
    monthly_payment_estimate_lookback_months=6,
    monthly_payment_min_observations=2,
    debt_payment_confidence_requires_user_confirmation=True,
)
DEFAULT_BULK_OPERATIONS_SETTINGS = BulkOperationsSettings(
    require_preview=True,
    require_confirmation=True,
    show_undo_after_delete=True,
    max_bulk_rows_without_extra_confirmation=100,
)
DEFAULT_FINANCIAL_TARGETS_SETTINGS = FinancialTargetsSettings(
    emergency_fund_target_months=3,
    savings_rate_target=None,
    debt_strategy_preference=None,
)

_SECTION_CONFIGS = {
    "spending_anomalies": (
        SPENDING_ANOMALIES_SCOPE,
        DEFAULT_SPENDING_ANOMALIES_SETTINGS,
        SpendingAnomaliesSavedSettings,
    ),
    "discretionary_velocity": (
        DISCRETIONARY_VELOCITY_SCOPE,
        DEFAULT_DISCRETIONARY_VELOCITY_SETTINGS,
        DiscretionaryVelocitySavedSettings,
    ),
    "purchase_gate": (
        PURCHASE_GATE_SCOPE,
        DEFAULT_PURCHASE_GATE_SETTINGS,
        PurchaseGateSavedSettings,
    ),
    "recurring_dry_run": (
        RECURRING_DRY_RUN_SCOPE,
        DEFAULT_RECURRING_DRY_RUN_SETTINGS,
        RecurringDryRunSavedSettings,
    ),
    "asset_liability_health": (
        ASSET_LIABILITY_HEALTH_SCOPE,
        DEFAULT_ASSET_LIABILITY_HEALTH_SETTINGS,
        AssetLiabilityHealthSavedSettings,
    ),
    "bulk_operations": (
        BULK_OPERATIONS_SCOPE,
        DEFAULT_BULK_OPERATIONS_SETTINGS,
        BulkOperationsSavedSettings,
    ),
    "financial_targets": (
        FINANCIAL_TARGETS_SCOPE,
        DEFAULT_FINANCIAL_TARGETS_SETTINGS,
        FinancialTargetsSavedSettings,
    ),
}


async def get_analytics_settings(db_session: AsyncSession) -> AnalyticsSettingsResponse:
    saved_sections = {
        section_name: await _load_saved_settings(db_session, section_name)
        for section_name in _SECTION_CONFIGS
    }
    return _build_full_analytics_settings_response(saved_sections)


async def patch_analytics_settings(
    db_session: AsyncSession,
    *,
    spending_anomalies: Mapping[str, int | float | None],
    discretionary_velocity: Mapping[str, Any] | None = None,
    purchase_gate: Mapping[str, Any] | None = None,
    recurring_dry_run: Mapping[str, Any] | None = None,
    asset_liability_health: Mapping[str, Any] | None = None,
    bulk_operations: Mapping[str, Any] | None = None,
    financial_targets: Mapping[str, Any] | None = None,
) -> AnalyticsSettingsResponse:
    await _patch_settings_section(db_session, "spending_anomalies", spending_anomalies)
    await _patch_settings_section(
        db_session,
        "discretionary_velocity",
        discretionary_velocity or {},
    )
    await _patch_settings_section(db_session, "purchase_gate", purchase_gate or {})
    await _patch_settings_section(
        db_session, "recurring_dry_run", recurring_dry_run or {}
    )
    await _patch_settings_section(
        db_session,
        "asset_liability_health",
        asset_liability_health or {},
    )
    await _patch_settings_section(db_session, "bulk_operations", bulk_operations or {})
    await _patch_settings_section(
        db_session, "financial_targets", financial_targets or {}
    )

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
    return await _load_saved_settings(db_session, "spending_anomalies")


async def _patch_settings_section(
    db_session: AsyncSession,
    section_name: str,
    values: Mapping[str, Any],
) -> None:
    scope, defaults, _saved_model = _SECTION_CONFIGS[section_name]
    allowed_keys = set(defaults.__class__.model_fields)
    for key, value in values.items():
        if key not in allowed_keys:
            continue
        if value is None:
            await db_session.execute(
                delete(AppSetting)
                .where(AppSetting.scope == scope)
                .where(AppSetting.key == key)
            )
            continue

        existing = await db_session.scalar(
            select(AppSetting)
            .where(AppSetting.scope == scope)
            .where(AppSetting.key == key)
        )
        serialized_value = _serialize_setting_value(value)
        if existing is None:
            db_session.add(AppSetting(scope=scope, key=key, value=serialized_value))
        else:
            existing.value = serialized_value


async def _load_saved_settings(db_session: AsyncSession, section_name: str):
    scope, defaults, saved_model = _SECTION_CONFIGS[section_name]
    result = await db_session.execute(
        select(AppSetting).where(AppSetting.scope == scope)
    )
    raw_values = {row.key: row.value for row in result.scalars().all()}
    parsed_values: dict[str, Any] = {}
    for key, default_value in defaults.model_dump().items():
        raw_value = raw_values.get(key)
        parsed_values[key] = (
            _parse_setting_value(raw_value, default_value)
            if raw_value is not None
            else None
        )
    return saved_model(**parsed_values)


def _build_analytics_settings_response(
    saved: SpendingAnomaliesSavedSettings,
) -> AnalyticsSettingsResponse:
    # Kept for older direct service tests; the public response is assembled
    # from all sections in get_analytics_settings().
    defaults = DEFAULT_SPENDING_ANOMALIES_SETTINGS
    effective = _effective_settings(defaults, saved)
    return AnalyticsSettingsResponse(
        defaults=AnalyticsSettingsSection(
            spending_anomalies=defaults,
            discretionary_velocity=DEFAULT_DISCRETIONARY_VELOCITY_SETTINGS,
            purchase_gate=DEFAULT_PURCHASE_GATE_SETTINGS,
            recurring_dry_run=DEFAULT_RECURRING_DRY_RUN_SETTINGS,
            asset_liability_health=DEFAULT_ASSET_LIABILITY_HEALTH_SETTINGS,
            bulk_operations=DEFAULT_BULK_OPERATIONS_SETTINGS,
            financial_targets=DEFAULT_FINANCIAL_TARGETS_SETTINGS,
        ),
        saved=AnalyticsSavedSettingsSection(
            spending_anomalies=saved,
            discretionary_velocity=DiscretionaryVelocitySavedSettings(
                **{
                    key: None
                    for key in DEFAULT_DISCRETIONARY_VELOCITY_SETTINGS.model_fields
                }
            ),
            purchase_gate=PurchaseGateSavedSettings(
                **{key: None for key in DEFAULT_PURCHASE_GATE_SETTINGS.model_fields}
            ),
            recurring_dry_run=RecurringDryRunSavedSettings(
                **{key: None for key in DEFAULT_RECURRING_DRY_RUN_SETTINGS.model_fields}
            ),
            asset_liability_health=AssetLiabilityHealthSavedSettings(
                **{
                    key: None
                    for key in DEFAULT_ASSET_LIABILITY_HEALTH_SETTINGS.model_fields
                }
            ),
            bulk_operations=BulkOperationsSavedSettings(
                **{key: None for key in DEFAULT_BULK_OPERATIONS_SETTINGS.model_fields}
            ),
            financial_targets=FinancialTargetsSavedSettings(
                **{key: None for key in DEFAULT_FINANCIAL_TARGETS_SETTINGS.model_fields}
            ),
        ),
        effective=AnalyticsSettingsSection(
            spending_anomalies=effective,
            discretionary_velocity=DEFAULT_DISCRETIONARY_VELOCITY_SETTINGS,
            purchase_gate=DEFAULT_PURCHASE_GATE_SETTINGS,
            recurring_dry_run=DEFAULT_RECURRING_DRY_RUN_SETTINGS,
            asset_liability_health=DEFAULT_ASSET_LIABILITY_HEALTH_SETTINGS,
            bulk_operations=DEFAULT_BULK_OPERATIONS_SETTINGS,
            financial_targets=DEFAULT_FINANCIAL_TARGETS_SETTINGS,
        ),
    )


def _build_full_analytics_settings_response(
    saved_sections: dict[str, Any],
) -> AnalyticsSettingsResponse:
    defaults = {section: config[1] for section, config in _SECTION_CONFIGS.items()}
    effective = {
        section: _effective_settings(defaults[section], saved_sections[section])
        for section in _SECTION_CONFIGS
    }
    return AnalyticsSettingsResponse(
        defaults=AnalyticsSettingsSection(**defaults),
        saved=AnalyticsSavedSettingsSection(**saved_sections),
        effective=AnalyticsSettingsSection(**effective),
    )


def _effective_settings(defaults, saved):
    values = defaults.model_dump()
    for key, value in saved.model_dump().items():
        if value is not None:
            values[key] = value
    return defaults.__class__(**values)


def _serialize_setting_value(value: Any) -> str:
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _parse_setting_value(raw_value: str, default_value: Any) -> Any:
    if isinstance(default_value, bool):
        return raw_value.lower() == "true"
    if isinstance(default_value, int) and not isinstance(default_value, bool):
        return int(raw_value)
    if isinstance(default_value, float):
        return float(raw_value)
    if isinstance(default_value, list):
        parsed = json.loads(raw_value)
        return parsed if isinstance(parsed, list) else []
    return raw_value
