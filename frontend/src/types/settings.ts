export type DebtStrategyPreference = 'avalanche' | 'snowball'
export type PurchaseGateCandidateType =
  | 'large_oneoff'
  | 'new_merchant'
  | 'merchant_spike'
  | 'discretionary_spike'

export interface SpendingAnomaliesSettings {
  min_delta_amount: number
  anomaly_threshold: number
  baseline_months: number
}

export interface DiscretionaryVelocitySettings {
  baseline_months: number
  outlier_policy: string
  warning_velocity_ratio: number
  high_velocity_ratio: number
  minimum_classification_coverage: number
  baseline_mode: string
  excluded_category_names: string[]
  excluded_merchants: string[]
}

export interface PurchaseGateSettings {
  large_purchase_threshold: number
  min_candidate_amount: number
  new_merchant_lookback_months: number
  merchant_spike_ratio: number
  discretionary_spike_ratio: number
  review_cooldown_days: number
  candidate_risk_threshold: string
  enabled_candidate_types: PurchaseGateCandidateType[]
  excluded_category_names: string[]
  excluded_merchants: string[]
}

export interface RecurringDryRunSettings {
  min_occurrences: number
  min_distinct_months: number
  min_distinct_days: number
  max_amount_cv: number
  monthly_interval_days_min: number
  monthly_interval_days_max: number
  weekly_interval_days_min: number
  weekly_interval_days_max: number
  minimum_confidence: number
  default_apply_scope: string
  upload_auto_apply: boolean
}

export interface AssetLiabilityHealthSettings {
  emergency_fund_included_tiers: string[]
  show_near_liquid_as_secondary: boolean
  monthly_payment_estimate_lookback_months: number
  monthly_payment_min_observations: number
  debt_payment_confidence_requires_user_confirmation: boolean
}

export interface BulkOperationsSettings {
  require_preview: boolean
  require_confirmation: boolean
  show_undo_after_delete: boolean
  max_bulk_rows_without_extra_confirmation: number
}

type Saved<T> = {
  [K in keyof T]: T[K] | null
}

export interface FinancialTargetsSettings {
  emergency_fund_target_months: number
  savings_rate_target: number | null
  debt_strategy_preference: DebtStrategyPreference | null
}

export interface FinancialTargetsSettingsPatch {
  emergency_fund_target_months?: number | null
  savings_rate_target?: number | null
  debt_strategy_preference?: DebtStrategyPreference | null
}

export interface AnalyticsSettingsSection {
  spending_anomalies: SpendingAnomaliesSettings
  discretionary_velocity: DiscretionaryVelocitySettings
  purchase_gate: PurchaseGateSettings
  recurring_dry_run: RecurringDryRunSettings
  asset_liability_health: AssetLiabilityHealthSettings
  bulk_operations: BulkOperationsSettings
  financial_targets: FinancialTargetsSettings
}

export interface AnalyticsSavedSettingsSection {
  spending_anomalies: Saved<SpendingAnomaliesSettings>
  discretionary_velocity: Saved<DiscretionaryVelocitySettings>
  purchase_gate: Saved<PurchaseGateSettings>
  recurring_dry_run: Saved<RecurringDryRunSettings>
  asset_liability_health: Saved<AssetLiabilityHealthSettings>
  bulk_operations: Saved<BulkOperationsSettings>
  financial_targets: Saved<FinancialTargetsSettings>
}

export interface AnalyticsSettingsResponse {
  defaults: AnalyticsSettingsSection
  saved: AnalyticsSavedSettingsSection
  effective: AnalyticsSettingsSection
}

export interface AnalyticsSettingsPatchRequest {
  financial_targets?: FinancialTargetsSettingsPatch
  spending_anomalies?: Partial<Saved<SpendingAnomaliesSettings>>
  discretionary_velocity?: Partial<Saved<DiscretionaryVelocitySettings>>
  purchase_gate?: Partial<Saved<PurchaseGateSettings>>
  recurring_dry_run?: Partial<Saved<RecurringDryRunSettings>>
  asset_liability_health?: Partial<Saved<AssetLiabilityHealthSettings>>
  bulk_operations?: Partial<Saved<BulkOperationsSettings>>
}
