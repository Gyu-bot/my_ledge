export type DebtStrategyPreference = 'avalanche' | 'snowball'

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

/**
 * settings/analytics 섹션 구조.
 * Phase 2는 financial_targets만 소비한다 — 나머지 섹션의 정밀 타입은
 * 설정 화면(Phase 3, /data/settings) 구현 시 확장한다.
 */
export interface AnalyticsSettingsSection {
  financial_targets: FinancialTargetsSettings
  spending_anomalies: Record<string, unknown>
  discretionary_velocity: Record<string, unknown>
  purchase_gate: Record<string, unknown>
  recurring_dry_run: Record<string, unknown>
  asset_liability_health: Record<string, unknown>
  bulk_operations: Record<string, unknown>
}

export interface AnalyticsSettingsResponse {
  defaults: AnalyticsSettingsSection
  saved: Record<string, unknown>
  effective: AnalyticsSettingsSection
}

export interface AnalyticsSettingsPatchRequest {
  financial_targets?: FinancialTargetsSettingsPatch
  spending_anomalies?: Record<string, unknown>
  discretionary_velocity?: Record<string, unknown>
  purchase_gate?: Record<string, unknown>
  recurring_dry_run?: Record<string, unknown>
  asset_liability_health?: Record<string, unknown>
  bulk_operations?: Record<string, unknown>
}
