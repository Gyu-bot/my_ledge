export interface AssetSnapshotTotals {
  snapshot_date: string
  asset_total: string    // Decimal as string
  liability_total: string
  net_worth: string
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
