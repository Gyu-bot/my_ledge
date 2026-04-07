export interface AssetSnapshotTotals {
  snapshot_date: string
  asset_total: string    // Decimal as string
  liability_total: string
  net_worth: string
}

export type SnapshotComparisonMode =
  | 'latest_available_vs_previous_available'
  | 'last_closed_month_vs_previous_closed_month'
  | 'selected_snapshot_vs_baseline_snapshot'

export interface AssetSnapshotComparisonDelta {
  asset_total: string
  liability_total: string
  net_worth: string
  asset_total_pct: number | null
  liability_total_pct: number | null
  net_worth_pct: number | null
}

export interface AssetSnapshotComparisonResponse {
  comparison_mode: SnapshotComparisonMode
  current: AssetSnapshotTotals | null
  baseline: AssetSnapshotTotals | null
  delta: AssetSnapshotComparisonDelta | null
  comparison_days: number | null
  is_partial: boolean
  is_stale: boolean
  can_compare: boolean
  comparison_label: string
}

export interface NetWorthPoint {
  snapshot_date: string
  net_worth: string
}

export interface NetWorthHistoryResponse {
  items: NetWorthPoint[]
}

export interface InvestmentItem {
  product_type: string | null
  broker: string
  product_name: string
  cost_basis: string | null
  market_value: string | null
  return_rate: string | null
}

export interface InvestmentSummaryResponse {
  snapshot_date: string | null
  items: InvestmentItem[]
  totals: { cost_basis: string; market_value: string }
}

export interface LoanItem {
  loan_type: string | null
  lender: string
  product_name: string
  principal: string | null
  balance: string | null
  interest_rate: string | null
  start_date: string | null
  maturity_date: string | null
}

export interface LoanSummaryResponse {
  snapshot_date: string | null
  items: LoanItem[]
  totals: { principal: string; balance: string }
}
