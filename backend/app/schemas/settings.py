from typing import Literal

from pydantic import BaseModel, Field


class SpendingAnomaliesSettings(BaseModel):
    min_delta_amount: int
    anomaly_threshold: float
    baseline_months: int


class SpendingAnomaliesSavedSettings(BaseModel):
    min_delta_amount: int | None
    anomaly_threshold: float | None
    baseline_months: int | None


class DiscretionaryVelocitySettings(BaseModel):
    baseline_months: int
    outlier_policy: str
    warning_velocity_ratio: float
    high_velocity_ratio: float
    minimum_classification_coverage: float
    baseline_mode: str
    excluded_category_names: list[str]
    excluded_merchants: list[str]


class DiscretionaryVelocitySavedSettings(BaseModel):
    baseline_months: int | None
    outlier_policy: str | None
    warning_velocity_ratio: float | None
    high_velocity_ratio: float | None
    minimum_classification_coverage: float | None
    baseline_mode: str | None
    excluded_category_names: list[str] | None
    excluded_merchants: list[str] | None


PurchaseGateCandidateType = Literal[
    "large_oneoff",
    "new_merchant",
    "merchant_spike",
    "discretionary_spike",
]


class PurchaseGateSettings(BaseModel):
    large_purchase_threshold: int
    min_candidate_amount: int
    new_merchant_lookback_months: int
    merchant_spike_ratio: float
    discretionary_spike_ratio: float
    review_cooldown_days: int
    candidate_risk_threshold: str
    enabled_candidate_types: list[PurchaseGateCandidateType]
    excluded_category_names: list[str]
    excluded_merchants: list[str]


class PurchaseGateSavedSettings(BaseModel):
    large_purchase_threshold: int | None
    min_candidate_amount: int | None
    new_merchant_lookback_months: int | None
    merchant_spike_ratio: float | None
    discretionary_spike_ratio: float | None
    review_cooldown_days: int | None
    candidate_risk_threshold: str | None
    enabled_candidate_types: list[PurchaseGateCandidateType] | None
    excluded_category_names: list[str] | None
    excluded_merchants: list[str] | None


class RecurringDryRunSettings(BaseModel):
    min_occurrences: int
    min_distinct_months: int
    min_distinct_days: int
    max_amount_cv: float
    monthly_interval_days_min: int
    monthly_interval_days_max: int
    weekly_interval_days_min: int
    weekly_interval_days_max: int
    minimum_confidence: float
    default_apply_scope: str
    upload_auto_apply: bool


class RecurringDryRunSavedSettings(BaseModel):
    min_occurrences: int | None
    min_distinct_months: int | None
    min_distinct_days: int | None
    max_amount_cv: float | None
    monthly_interval_days_min: int | None
    monthly_interval_days_max: int | None
    weekly_interval_days_min: int | None
    weekly_interval_days_max: int | None
    minimum_confidence: float | None
    default_apply_scope: str | None
    upload_auto_apply: bool | None


class AssetLiabilityHealthSettings(BaseModel):
    emergency_fund_included_tiers: list[str]
    show_near_liquid_as_secondary: bool
    monthly_payment_estimate_lookback_months: int
    monthly_payment_min_observations: int
    debt_payment_confidence_requires_user_confirmation: bool


class AssetLiabilityHealthSavedSettings(BaseModel):
    emergency_fund_included_tiers: list[str] | None
    show_near_liquid_as_secondary: bool | None
    monthly_payment_estimate_lookback_months: int | None
    monthly_payment_min_observations: int | None
    debt_payment_confidence_requires_user_confirmation: bool | None


class BulkOperationsSettings(BaseModel):
    require_preview: bool
    require_confirmation: bool
    show_undo_after_delete: bool
    max_bulk_rows_without_extra_confirmation: int


class BulkOperationsSavedSettings(BaseModel):
    require_preview: bool | None
    require_confirmation: bool | None
    show_undo_after_delete: bool | None
    max_bulk_rows_without_extra_confirmation: int | None


class AnalyticsSettingsSection(BaseModel):
    spending_anomalies: SpendingAnomaliesSettings
    discretionary_velocity: DiscretionaryVelocitySettings
    purchase_gate: PurchaseGateSettings
    recurring_dry_run: RecurringDryRunSettings
    asset_liability_health: AssetLiabilityHealthSettings
    bulk_operations: BulkOperationsSettings


class AnalyticsSavedSettingsSection(BaseModel):
    spending_anomalies: SpendingAnomaliesSavedSettings
    discretionary_velocity: DiscretionaryVelocitySavedSettings
    purchase_gate: PurchaseGateSavedSettings
    recurring_dry_run: RecurringDryRunSavedSettings
    asset_liability_health: AssetLiabilityHealthSavedSettings
    bulk_operations: BulkOperationsSavedSettings


class AnalyticsSettingsResponse(BaseModel):
    defaults: AnalyticsSettingsSection
    saved: AnalyticsSavedSettingsSection
    effective: AnalyticsSettingsSection


class SpendingAnomaliesSettingsPatch(BaseModel):
    min_delta_amount: int | None = Field(default=None, ge=0)
    anomaly_threshold: float | None = Field(default=None, ge=0.0)
    baseline_months: int | None = Field(default=None, ge=1, le=12)


class DiscretionaryVelocitySettingsPatch(BaseModel):
    baseline_months: int | None = Field(default=None, ge=1, le=12)
    outlier_policy: str | None = None
    warning_velocity_ratio: float | None = Field(default=None, ge=0.0)
    high_velocity_ratio: float | None = Field(default=None, ge=0.0)
    minimum_classification_coverage: float | None = Field(default=None, ge=0.0, le=1.0)
    baseline_mode: str | None = None
    excluded_category_names: list[str] | None = None
    excluded_merchants: list[str] | None = None


class PurchaseGateSettingsPatch(BaseModel):
    large_purchase_threshold: int | None = Field(default=None, ge=0)
    min_candidate_amount: int | None = Field(default=None, ge=0)
    new_merchant_lookback_months: int | None = Field(default=None, ge=1, le=24)
    merchant_spike_ratio: float | None = Field(default=None, ge=0.0)
    discretionary_spike_ratio: float | None = Field(default=None, ge=0.0)
    review_cooldown_days: int | None = Field(default=None, ge=0, le=365)
    candidate_risk_threshold: str | None = None
    enabled_candidate_types: list[PurchaseGateCandidateType] | None = None
    excluded_category_names: list[str] | None = None
    excluded_merchants: list[str] | None = None


class RecurringDryRunSettingsPatch(BaseModel):
    min_occurrences: int | None = Field(default=None, ge=2)
    min_distinct_months: int | None = Field(default=None, ge=1)
    min_distinct_days: int | None = Field(default=None, ge=1)
    max_amount_cv: float | None = Field(default=None, ge=0.0)
    monthly_interval_days_min: int | None = Field(default=None, ge=1)
    monthly_interval_days_max: int | None = Field(default=None, ge=1)
    weekly_interval_days_min: int | None = Field(default=None, ge=1)
    weekly_interval_days_max: int | None = Field(default=None, ge=1)
    minimum_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    default_apply_scope: str | None = None
    upload_auto_apply: bool | None = None


class AssetLiabilityHealthSettingsPatch(BaseModel):
    emergency_fund_included_tiers: list[str] | None = None
    show_near_liquid_as_secondary: bool | None = None
    monthly_payment_estimate_lookback_months: int | None = Field(default=None, ge=1, le=24)
    monthly_payment_min_observations: int | None = Field(default=None, ge=1)
    debt_payment_confidence_requires_user_confirmation: bool | None = None


class BulkOperationsSettingsPatch(BaseModel):
    require_preview: bool | None = None
    require_confirmation: bool | None = None
    show_undo_after_delete: bool | None = None
    max_bulk_rows_without_extra_confirmation: int | None = Field(default=None, ge=1)


class AnalyticsSettingsPatchRequest(BaseModel):
    spending_anomalies: SpendingAnomaliesSettingsPatch = Field(
        default_factory=SpendingAnomaliesSettingsPatch,
    )
    discretionary_velocity: DiscretionaryVelocitySettingsPatch = Field(
        default_factory=DiscretionaryVelocitySettingsPatch,
    )
    purchase_gate: PurchaseGateSettingsPatch = Field(
        default_factory=PurchaseGateSettingsPatch,
    )
    recurring_dry_run: RecurringDryRunSettingsPatch = Field(
        default_factory=RecurringDryRunSettingsPatch,
    )
    asset_liability_health: AssetLiabilityHealthSettingsPatch = Field(
        default_factory=AssetLiabilityHealthSettingsPatch,
    )
    bulk_operations: BulkOperationsSettingsPatch = Field(
        default_factory=BulkOperationsSettingsPatch,
    )
