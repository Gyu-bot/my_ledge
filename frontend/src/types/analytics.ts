export interface MonthlyCashflowItem {
  period: string
  income: number
  expense: number
  transfer: number
  net_cashflow: number
  savings_rate: number | null
}

export interface MonthlyCashflowResponse {
  items: MonthlyCashflowItem[]
}

export interface MerchantSpendItem {
  merchant: string
  amount: number
  count: number
  avg_amount: number
  last_seen_at: string
}

export interface MerchantSpendResponse {
  items: MerchantSpendItem[]
}

export interface IncomeStabilityResponse {
  items: Array<{ period: string; income: number }>
  avg: number
  stdev: number | null
  coefficient_of_variation: number | null
  comparison_mode: 'closed' | 'partial'
  reference_date: string | null
  is_partial_period: boolean
  assumptions: string
}

export interface AnalyticsDateRange {
  start_month?: string
  end_month?: string
  start_date?: string
  end_date?: string
}

export interface MerchantSpendQuery extends AnalyticsDateRange {
  months?: number
  limit?: number
  include_income?: boolean
}

export interface MonthlyCashflowQuery extends AnalyticsDateRange {
  months?: number
}

export interface IncomeStabilityQuery {
  end_date?: string
}

export type PurchaseGateCandidateStatus =
  | 'pending'
  | 'reviewed'
  | 'ignored'
  | 'snoozed'
  | 'dismissed'

export interface PurchaseGateReviewPatchRequest {
  review_status: PurchaseGateCandidateStatus
  memo?: string | null
  cooldown_days?: number | null
}

export interface PurchaseGateReviewResponse {
  candidate_key: string
  candidate_type: string
  transaction_id: number
  review_status: PurchaseGateCandidateStatus
  memo: string | null
  reviewed_at: string | null
  cooldown_until: string | null
}
