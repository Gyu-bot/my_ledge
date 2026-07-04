import type { AnalyticsSettingsResponse, AnalyticsSettingsSection } from '../../types/settings'

export const defaultAnalyticsSettings = {
  spending_anomalies: { min_delta_amount: 100000, anomaly_threshold: 0.5, baseline_months: 3 },
  discretionary_velocity: {
    baseline_months: 6,
    outlier_policy: 'median_30pct_exclusion',
    warning_velocity_ratio: 1.2,
    high_velocity_ratio: 1.5,
    minimum_classification_coverage: 0.7,
    baseline_mode: 'prorated_closed_month_baseline',
    excluded_category_names: [],
    excluded_merchants: [],
  },
  purchase_gate: {
    large_purchase_threshold: 100000,
    min_candidate_amount: 100000,
    new_merchant_lookback_months: 6,
    merchant_spike_ratio: 2,
    discretionary_spike_ratio: 1.5,
    review_cooldown_days: 14,
    candidate_risk_threshold: 'warning',
    enabled_candidate_types: ['large_oneoff', 'new_merchant', 'merchant_spike', 'discretionary_spike'],
    excluded_category_names: [],
    excluded_merchants: [],
  },
  recurring_dry_run: {
    min_occurrences: 2,
    min_distinct_months: 2,
    min_distinct_days: 2,
    max_amount_cv: 0.5,
    monthly_interval_days_min: 25,
    monthly_interval_days_max: 35,
    weekly_interval_days_min: 6,
    weekly_interval_days_max: 8,
    minimum_confidence: 0.5,
    default_apply_scope: 'all_matching',
    upload_auto_apply: false,
  },
  asset_liability_health: {
    emergency_fund_included_tiers: ['immediate'],
    show_near_liquid_as_secondary: true,
    monthly_payment_estimate_lookback_months: 6,
    monthly_payment_min_observations: 2,
    debt_payment_confidence_requires_user_confirmation: true,
  },
  bulk_operations: {
    require_preview: true,
    require_confirmation: true,
    show_undo_after_delete: true,
    max_bulk_rows_without_extra_confirmation: 100,
  },
  financial_targets: { emergency_fund_target_months: 3, savings_rate_target: null, debt_strategy_preference: null },
} satisfies AnalyticsSettingsSection

export const analyticsSettingsResponse = {
  defaults: defaultAnalyticsSettings,
  saved: {
    spending_anomalies: { min_delta_amount: null, anomaly_threshold: null, baseline_months: null },
    discretionary_velocity: {
      baseline_months: null,
      outlier_policy: null,
      warning_velocity_ratio: null,
      high_velocity_ratio: null,
      minimum_classification_coverage: null,
      baseline_mode: null,
      excluded_category_names: null,
      excluded_merchants: null,
    },
    purchase_gate: {
      large_purchase_threshold: null,
      min_candidate_amount: null,
      new_merchant_lookback_months: null,
      merchant_spike_ratio: null,
      discretionary_spike_ratio: null,
      review_cooldown_days: null,
      candidate_risk_threshold: null,
      enabled_candidate_types: null,
      excluded_category_names: null,
      excluded_merchants: null,
    },
    recurring_dry_run: {
      min_occurrences: null,
      min_distinct_months: null,
      min_distinct_days: null,
      max_amount_cv: null,
      monthly_interval_days_min: null,
      monthly_interval_days_max: null,
      weekly_interval_days_min: null,
      weekly_interval_days_max: null,
      minimum_confidence: null,
      default_apply_scope: null,
      upload_auto_apply: null,
    },
    asset_liability_health: {
      emergency_fund_included_tiers: null,
      show_near_liquid_as_secondary: null,
      monthly_payment_estimate_lookback_months: null,
      monthly_payment_min_observations: null,
      debt_payment_confidence_requires_user_confirmation: null,
    },
    bulk_operations: {
      require_preview: null,
      require_confirmation: null,
      show_undo_after_delete: null,
      max_bulk_rows_without_extra_confirmation: null,
    },
    financial_targets: {
      emergency_fund_target_months: 4,
      savings_rate_target: 0.5,
      debt_strategy_preference: 'avalanche',
    },
  },
  effective: {
    ...defaultAnalyticsSettings,
    financial_targets: { emergency_fund_target_months: 4, savings_rate_target: 0.5, debt_strategy_preference: 'avalanche' },
  },
} satisfies AnalyticsSettingsResponse

type RatioOverrides = {
  readonly purchase_gate: {
    readonly merchant_spike_ratio: number
    readonly discretionary_spike_ratio: number
  }
  readonly discretionary_velocity: {
    readonly warning_velocity_ratio: number
    readonly high_velocity_ratio: number
    readonly minimum_classification_coverage: number
  }
  readonly recurring_dry_run: {
    readonly max_amount_cv: number
    readonly minimum_confidence: number
  }
}

export function withEffectiveRatios(overrides: RatioOverrides): AnalyticsSettingsResponse {
  return {
    ...analyticsSettingsResponse,
    effective: {
      ...analyticsSettingsResponse.effective,
      purchase_gate: { ...analyticsSettingsResponse.effective.purchase_gate, ...overrides.purchase_gate },
      discretionary_velocity: { ...analyticsSettingsResponse.effective.discretionary_velocity, ...overrides.discretionary_velocity },
      recurring_dry_run: { ...analyticsSettingsResponse.effective.recurring_dry_run, ...overrides.recurring_dry_run },
    },
  }
}
