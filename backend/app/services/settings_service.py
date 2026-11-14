from collections.abc import Mapping
from datetime import date
import json
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.auto_classification import AutoClassificationSettings
from app.services.recurring_configuration_lock import lock_recurring_configuration
from app.schemas.settings import (
    AssetLiabilityHealthSavedSettings,
    AssetLiabilityHealthSettings,
    BulkOperationsSavedSettings,
    BulkOperationsSettings,
    ComparisonSavedSettings,
    ComparisonSettings,
    ComparisonSettingsGuide,
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
    SettingOptionDescription,
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
COMPARISON_SCOPE = "analytics.comparison"

# Comparison contract default (Implentation-plan.md 2.4): median of the most
# recent 6 closed months. Shared by every comparison surface.
DEFAULT_COMPARISON_BASELINE_MONTHS = 6

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
DEFAULT_COMPARISON_SETTINGS = ComparisonSettings(baseline_start_date=None)

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
    "comparison": (
        COMPARISON_SCOPE,
        DEFAULT_COMPARISON_SETTINGS,
        ComparisonSavedSettings,
    ),
}


async def get_analytics_settings(db_session: AsyncSession) -> AnalyticsSettingsResponse:
    saved_sections = {
        section_name: await _load_saved_settings(db_session, section_name)
        for section_name in _SECTION_CONFIGS
    }
    response = _build_full_analytics_settings_response(saved_sections)
    response.comparison_guide = build_comparison_settings_guide(
        response.effective.comparison
    )
    # Retain legacy installations until a canonical upload preference is saved.
    if response.saved.recurring_dry_run.upload_auto_apply is None:
        legacy = await db_session.get(
            AutoClassificationSettings, 1, populate_existing=True
        )
        if legacy is not None:
            response.effective.recurring_dry_run.upload_auto_apply = (
                legacy.apply_recurring_rules_on_upload
            )
    return response


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
    comparison: Mapping[str, Any] | None = None,
) -> AnalyticsSettingsResponse:
    if recurring_dry_run:
        await lock_recurring_configuration(db_session)
        current = (await get_analytics_settings(db_session)).effective.recurring_dry_run
        values = current.model_dump()
        defaults = DEFAULT_RECURRING_DRY_RUN_SETTINGS.model_dump()
        values.update(
            {
                key: defaults[key] if value is None else value
                for key, value in recurring_dry_run.items()
                if key in defaults
            }
        )
        for cadence in ("monthly", "weekly"):
            if (
                values[f"{cadence}_interval_days_min"]
                > values[f"{cadence}_interval_days_max"]
            ):
                raise HTTPException(
                    status_code=422,
                    detail="반복 결제 간격의 최솟값은 최댓값 이하여야 합니다.",
                )
        if values["default_apply_scope"] not in {"all_matching", "reviewed_only"}:
            raise HTTPException(
                status_code=422, detail="지원하지 않는 반복 승인 범위입니다."
            )
        if "upload_auto_apply" in recurring_dry_run:
            legacy = await db_session.get(
                AutoClassificationSettings, 1, populate_existing=True
            )
            if legacy is not None:
                legacy.apply_recurring_rules_on_upload = values["upload_auto_apply"]
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
    await _patch_settings_section(db_session, "comparison", comparison or {})

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


async def get_comparison_settings(db_session: AsyncSession) -> ComparisonSettings:
    """Effective comparison setting; the one value every comparison reads."""
    saved = await _load_saved_settings(db_session, "comparison")
    return _effective_settings(DEFAULT_COMPARISON_SETTINGS, saved)


def baseline_start_period(baseline_start_date: date | None) -> str | None:
    """First month that counts as baseline: only months on/after the date.

    A month that starts before the date would mix days from before the change,
    so a date that is not the 1st starts the baseline from the next month.
    """
    if baseline_start_date is None:
        return None
    if baseline_start_date.day == 1:
        return baseline_start_date.strftime("%Y-%m")
    year = baseline_start_date.year + baseline_start_date.month // 12
    month = baseline_start_date.month % 12 + 1
    return f"{year:04d}-{month:02d}"


def build_comparison_settings_guide(
    effective: ComparisonSettings,
) -> ComparisonSettingsGuide:
    start = effective.baseline_start_date
    start_period = baseline_start_period(start)
    start_label = (
        "제한 없음 — 자료가 있는 마감월을 모두 기준 후보로 씁니다."
        if start is None
        else f"{start.isoformat()} 이후의 달만 씁니다 ({start_period}부터)."
    )
    return ComparisonSettingsGuide(
        summary=(
            "모든 비교 화면과 응답은 같은 기준을 씁니다. 기준 구간 시작일을 바꾸면 "
            "모든 비교가 함께 바뀝니다."
        ),
        options=[
            SettingOptionDescription(
                key="baseline_start_date",
                label="기준 구간 시작일",
                description=(
                    "생활 구조가 바뀐 뒤(이사, 이직, 가족 변화 등)에는 그 이후의 달만 "
                    "비교 기준으로 삼을 수 있습니다. 1일을 고르면 그 달부터, 다른 날을 "
                    "고르면 다음 달부터 기준에 들어갑니다. 비우면 제한이 없습니다."
                ),
                editable=True,
                value_label=start_label,
            ),
            SettingOptionDescription(
                key="baseline_method",
                label="기준 기간",
                description=(
                    "대상 달 직전의 마감월 최대 "
                    f"{DEFAULT_COMPARISON_BASELINE_MONTHS}개에서 월별 금액의 중앙값을 "
                    "기준으로 씁니다. 한두 달의 큰 지출이 기준을 끌어올리지 않습니다. "
                    "마감월이 모자라면 있는 만큼만 쓰고 몇 달을 썼는지 함께 보여 줍니다."
                ),
                editable=False,
                value_label=(
                    f"최근 {DEFAULT_COMPARISON_BASELINE_MONTHS}개 마감월의 중앙값"
                ),
            ),
            SettingOptionDescription(
                key="partial_month_handling",
                label="진행 중인 달",
                description=(
                    "자료가 말일까지 오지 않은 달은 기준 달들도 같은 날짜까지의 누적만 "
                    "비교합니다. 이 달에는 현금 잔여율 같은 비율과 전월 전체 대비 증감을 "
                    "내지 않습니다."
                ),
                editable=False,
                value_label="같은 경과일까지의 누적끼리 비교",
            ),
            SettingOptionDescription(
                key="no_data_months",
                label="자료 없는 달",
                description=(
                    "거래 자료가 한 건도 없는 달은 0원으로 세지 않고 기준에서 뺍니다. "
                    "자료는 있지만 그 항목 지출이 없는 달은 0원으로 셉니다."
                ),
                editable=False,
                value_label="자료 없음과 0원을 구분",
            ),
            SettingOptionDescription(
                key="annual_window",
                label="해마다 한두 번 나가는 지출",
                description=(
                    "최근 12개월 중 한두 달에만 나간 지출은 월별 비교 대신 12개월 합계를 "
                    "그 직전 12개월과 비교합니다."
                ),
                editable=False,
                value_label="12개월 창으로 비교",
            ),
            SettingOptionDescription(
                key="ordering",
                label="변화 정렬",
                description=(
                    "변화 목록은 증감률이 아니라 금액(원) 기여가 큰 순서로 보여 줍니다. "
                    "전체, 보호, 조정 가능 지출을 따로 볼 수 있습니다."
                ),
                editable=False,
                value_label="금액 기여 순",
            ),
        ],
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
        select(AppSetting)
        .where(AppSetting.scope == scope)
        .execution_options(populate_existing=True)
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
            comparison=DEFAULT_COMPARISON_SETTINGS,
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
            comparison=ComparisonSavedSettings(baseline_start_date=None),
        ),
        effective=AnalyticsSettingsSection(
            spending_anomalies=effective,
            discretionary_velocity=DEFAULT_DISCRETIONARY_VELOCITY_SETTINGS,
            purchase_gate=DEFAULT_PURCHASE_GATE_SETTINGS,
            recurring_dry_run=DEFAULT_RECURRING_DRY_RUN_SETTINGS,
            asset_liability_health=DEFAULT_ASSET_LIABILITY_HEALTH_SETTINGS,
            bulk_operations=DEFAULT_BULK_OPERATIONS_SETTINGS,
            financial_targets=DEFAULT_FINANCIAL_TARGETS_SETTINGS,
            comparison=DEFAULT_COMPARISON_SETTINGS,
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
    if isinstance(defaults, RecurringDryRunSettings) and values[
        "default_apply_scope"
    ] not in {"all_matching", "reviewed_only"}:
        # Preserve the unsupported stored value for inspection and correction,
        # but never turn an old future-only preference into a bulk approval.
        values["default_apply_scope"] = "reviewed_only"
    return defaults.__class__(**values)


def _serialize_setting_value(value: Any) -> str:
    if isinstance(value, date):
        return value.isoformat()
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
