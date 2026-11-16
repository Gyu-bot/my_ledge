// T061 재무상태 응답 — backend/app/schemas/net_worth.py
// 화면은 이 값을 그대로 보인다. 보류된(null) 값을 화면에서 다시 계산하지 않는다.

import type { MetricContract } from './metrics'

export type ReconciliationStatus =
  | 'complete'
  | 'incomplete_classification'
  | 'transactions_not_covered'
  | 'snapshot_dates_mismatched'
  | 'no_snapshot_pair'

export type KindPairStatus = 'observed' | 'absent' | 'mismatched'

export interface ReconciliationInterval {
  start_snapshot_date: string
  end_snapshot_date: string
  /** 시작 스냅샷 다음 날 */
  transaction_start_date: string
  /** 끝 스냅샷일 (포함) */
  transaction_end_date: string
  boundary_rule: string
}

export interface NetWorthPoint {
  snapshot_date: string
  asset_total: number
  liability_total: number
  net_worth: number
  negative_asset_excluded_total: number
}

export interface SnapshotKindPair {
  kind: 'loans' | 'investments'
  pair_status: KindPairStatus
  start_as_of: string | null
  end_as_of: string | null
  start_value: number | null
  end_value: number | null
  change: number | null
  missing_value_row_count: number
  value_basis: string
}

export interface OtherKindAsOf {
  insurance_start_as_of: string | null
  insurance_end_as_of: string | null
  profile_start_as_of: string | null
  profile_end_as_of: string | null
}

export interface TransactionCoverage {
  covered: boolean
  first_transaction_date: string | null
  transaction_as_of: string | null
  periods_without_data: string[]
  non_krw_transaction_count: number
  rule: string
}

export interface TransferBreakdown {
  transfer_net: number
  investment_net: number
  savings_net: number
  investment_savings_net: number
  internal_move_net: number
  undecided_net: number
  activity_total: number
  undecided_activity_total: number
  undecided_share: number | null
  netting_rule: string
}

export interface ReconciliationFlow {
  income_total: number
  total_outflow: number
  committed_loan_total: number
  residual: number
  adjustability_undecided_total: number
  transaction_count: number
}

export interface ReconciliationItems {
  net_worth_change: number
  residual: number | null
  loan_balance_decrease: number | null
  investment_valuation_change: number | null
  unexplained_difference: number | null
  investment_value_change: number | null
  investment_net_transfer_in: number
}

export interface NetWorthReconciliationResponse {
  status: ReconciliationStatus
  status_reasons: string[]
  identity: string
  interval: ReconciliationInterval | null
  net_worth_start: NetWorthPoint | null
  net_worth_end: NetWorthPoint | null
  kinds: SnapshotKindPair[]
  other_kinds: OtherKindAsOf | null
  transactions: TransactionCoverage | null
  flow: ReconciliationFlow | null
  transfers: TransferBreakdown | null
  items: ReconciliationItems | null
  contract: MetricContract
}

export interface SnapshotIntervalItem {
  start_snapshot_date: string
  end_snapshot_date: string
  status: ReconciliationStatus
  net_worth_change: number
  unexplained_difference: number | null
  transfer_undecided_share: number | null
}

export interface SnapshotDatesByKind {
  assets: string[]
  loans: string[]
  investments: string[]
  insurance: string[]
  profile: string[]
}

export interface SnapshotIntervalsResponse {
  snapshot_dates: SnapshotDatesByKind
  /** 이어지는 자산 스냅샷 쌍, 최근 것 먼저 */
  intervals: SnapshotIntervalItem[]
  interval_rule: string
}

export type EmergencyFundStatus = 'complete' | 'incomplete_classification' | 'no_baseline' | 'no_asset_snapshot'

export interface EmergencyFundBaseline {
  method: 'median_of_recent_closed_months'
  months_requested: number
  periods: string[]
  month_count: number
  status: 'full' | 'fewer_than_requested' | 'none'
  limited_by: 'data_start' | 'baseline_start_date' | null
  baseline_start_date: string | null
  skipped_periods: string[]
  last_closed_period: string | null
}

export interface EmergencyFundResponse {
  status: EmergencyFundStatus
  status_reasons: string[]
  formula: string
  asset_snapshot_date: string | null
  cash_like_total: number | null
  cash_like_name_rule_total: number | null
  cash_like_basis: string
  monthly_protected_outflow: number | null
  monthly_adjustability_undecided_outflow: number | null
  adjustability_undecided_share: number | null
  emergency_fund_months: number | null
  baseline: EmergencyFundBaseline
  legacy_surface: string
  contract: MetricContract
}
