export type DebtStrategyPreference = 'avalanche' | 'snowball'
export type PurchaseGateCandidateType =
  | 'large_oneoff'
  | 'new_merchant'
  | 'merchant_spike'
  | 'discretionary_spike'

export type SpendingAnomaliesSettings = {
  readonly min_delta_amount: number
  readonly anomaly_threshold: number
  readonly baseline_months: number
}

export type DiscretionaryVelocitySettings = {
  readonly baseline_months: number
  readonly outlier_policy: string
  readonly warning_velocity_ratio: number
  readonly high_velocity_ratio: number
  readonly minimum_classification_coverage: number
  readonly baseline_mode: string
  readonly excluded_category_names: readonly string[]
  readonly excluded_merchants: readonly string[]
}

export type PurchaseGateSettings = {
  readonly large_purchase_threshold: number
  readonly min_candidate_amount: number
  readonly new_merchant_lookback_months: number
  readonly merchant_spike_ratio: number
  readonly discretionary_spike_ratio: number
  readonly review_cooldown_days: number
  readonly candidate_risk_threshold: string
  readonly enabled_candidate_types: readonly PurchaseGateCandidateType[]
  readonly excluded_category_names: readonly string[]
  readonly excluded_merchants: readonly string[]
}

export type RecurringDryRunSettings = {
  readonly min_occurrences: number
  readonly min_distinct_months: number
  readonly min_distinct_days: number
  readonly max_amount_cv: number
  readonly monthly_interval_days_min: number
  readonly monthly_interval_days_max: number
  readonly weekly_interval_days_min: number
  readonly weekly_interval_days_max: number
  readonly minimum_confidence: number
  readonly default_apply_scope: string
  readonly upload_auto_apply: boolean
}

export type AssetLiabilityHealthSettings = {
  readonly emergency_fund_included_tiers: readonly string[]
  readonly show_near_liquid_as_secondary: boolean
  readonly monthly_payment_estimate_lookback_months: number
  readonly monthly_payment_min_observations: number
  readonly debt_payment_confidence_requires_user_confirmation: boolean
}

export type BulkOperationsSettings = {
  readonly require_preview: boolean
  readonly require_confirmation: boolean
  readonly show_undo_after_delete: boolean
  readonly max_bulk_rows_without_extra_confirmation: number
}

export type FinancialTargetsSettings = {
  readonly emergency_fund_target_months: number
  readonly savings_rate_target: number | null
  readonly debt_strategy_preference: DebtStrategyPreference | null
}

export type SavedResponseSettings<T> = {
  readonly [K in keyof T]: T[K] | null
}

export type SavedSettingsPatch<T> = {
  readonly [K in keyof T]?: T[K] | null
}

export type SpendingAnomaliesSavedSettings = SavedResponseSettings<SpendingAnomaliesSettings>
export type DiscretionaryVelocitySavedSettings = SavedResponseSettings<DiscretionaryVelocitySettings>
export type PurchaseGateSavedSettings = SavedResponseSettings<PurchaseGateSettings>
export type RecurringDryRunSavedSettings = SavedResponseSettings<RecurringDryRunSettings>
export type AssetLiabilityHealthSavedSettings = SavedResponseSettings<AssetLiabilityHealthSettings>
export type BulkOperationsSavedSettings = SavedResponseSettings<BulkOperationsSettings>
export type FinancialTargetsSavedSettings = SavedResponseSettings<FinancialTargetsSettings>

export type SpendingAnomaliesSettingsPatch = SavedSettingsPatch<SpendingAnomaliesSettings>
export type DiscretionaryVelocitySettingsPatch = SavedSettingsPatch<DiscretionaryVelocitySettings>
export type PurchaseGateSettingsPatch = SavedSettingsPatch<PurchaseGateSettings>
export type RecurringDryRunSettingsPatch = SavedSettingsPatch<RecurringDryRunSettings>
export type AssetLiabilityHealthSettingsPatch = SavedSettingsPatch<AssetLiabilityHealthSettings>
export type BulkOperationsSettingsPatch = SavedSettingsPatch<BulkOperationsSettings>
export type FinancialTargetsSettingsPatch = SavedSettingsPatch<FinancialTargetsSettings>

export type AnalyticsSettingsSection = {
  readonly spending_anomalies: SpendingAnomaliesSettings
  readonly discretionary_velocity: DiscretionaryVelocitySettings
  readonly purchase_gate: PurchaseGateSettings
  readonly recurring_dry_run: RecurringDryRunSettings
  readonly asset_liability_health: AssetLiabilityHealthSettings
  readonly bulk_operations: BulkOperationsSettings
  readonly financial_targets: FinancialTargetsSettings
}

export type AnalyticsSavedSettingsSection = {
  readonly spending_anomalies: SpendingAnomaliesSavedSettings
  readonly discretionary_velocity: DiscretionaryVelocitySavedSettings
  readonly purchase_gate: PurchaseGateSavedSettings
  readonly recurring_dry_run: RecurringDryRunSavedSettings
  readonly asset_liability_health: AssetLiabilityHealthSavedSettings
  readonly bulk_operations: BulkOperationsSavedSettings
  readonly financial_targets: FinancialTargetsSavedSettings
}

export type AnalyticsSettingsResponse = {
  readonly defaults: AnalyticsSettingsSection
  readonly saved: AnalyticsSavedSettingsSection
  readonly effective: AnalyticsSettingsSection
}

export type AnalyticsSettingsPatchRequest = {
  readonly spending_anomalies?: SpendingAnomaliesSettingsPatch
  readonly discretionary_velocity?: DiscretionaryVelocitySettingsPatch
  readonly purchase_gate?: PurchaseGateSettingsPatch
  readonly recurring_dry_run?: RecurringDryRunSettingsPatch
  readonly asset_liability_health?: AssetLiabilityHealthSettingsPatch
  readonly bulk_operations?: BulkOperationsSettingsPatch
  readonly financial_targets?: FinancialTargetsSettingsPatch
}
