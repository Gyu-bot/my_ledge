export interface AssetSnapshotTotals {
  id?: number
  snapshot_date: string
  side?: 'asset' | 'liability' | string
  category?: string | null
  product_name?: string | null
  amount?: string | null
  asset_total: string    // Decimal as string
  liability_total: string
  net_worth: string
  liquidity_tier?: LiquidityTier | null
  is_cash_equivalent?: boolean | null
}

export interface AssetSnapshotsResponse {
  items: AssetSnapshotTotals[]
  asset_items: AssetSnapshotItemResponse[]
}

export type LiquidityTier = 'immediate' | 'near_liquid' | 'illiquid'

export interface AssetLiquidityPatchRequest {
  liquidity_tier: LiquidityTier | null
  is_cash_equivalent: boolean | null
}

export interface AssetSnapshotItemResponse {
  id: number
  snapshot_date: string
  side: string
  category: string
  product_name: string
  amount: string
  liquidity_tier: LiquidityTier | null
  is_cash_equivalent: boolean | null
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
  id?: number | null
  loan_type: string | null
  lender: string
  product_name: string
  principal: string | null
  balance: string | null
  interest_rate: string | null
  monthly_payment?: string | null
  repayment_method?: LoanRepaymentMethod | null
  monthly_payment_source?: LoanRepaymentMetadataSource | null
  repayment_method_source?: LoanRepaymentMetadataSource | null
  start_date: string | null
  maturity_date: string | null
}

export type LoanRepaymentMetadataSource =
  | 'manual'
  | 'estimated_from_linked_transactions'

export type LoanRepaymentMethod =
  | 'principal_interest'
  | 'principal_equal'
  | 'interest_only'
  | 'unknown'

export interface LoanRepaymentMetadataPatchRequest {
  monthly_payment: string | null
  repayment_method: LoanRepaymentMethod | null
}

export interface LoanRepaymentMetadataResponse {
  id: number
  snapshot_date: string
  lender: string
  product_name: string
  monthly_payment: string | null
  repayment_method: LoanRepaymentMethod | null
  monthly_payment_source: LoanRepaymentMetadataSource | null
  repayment_method_source: LoanRepaymentMetadataSource | null
}

export interface LoanSummaryResponse {
  snapshot_date: string | null
  items: LoanItem[]
  totals: { principal: string; balance: string }
}

export interface NetWorthBreakdownItem {
  side: string
  category: string
  amount: string
  ratio: number | null
}

export interface NetWorthBreakdownResponse {
  snapshot_date: string | null
  asset_total: string
  liability_total: string
  net_worth: string
  items: NetWorthBreakdownItem[]
}

export interface AssetLiabilityHealthResponse {
  snapshot_date: string | null
  cash_equivalent_total: string
  asset_total: string
  liability_total: string
  net_worth: string
  monthly_required_spend: string
  emergency_fund_months: number | null
  monthly_debt_payment: string
  monthly_income: string
  debt_payment_ratio: number | null
  debt_to_asset_ratio: number | null
  confidence: string
  assumptions: string[]
}
