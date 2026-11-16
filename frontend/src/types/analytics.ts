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

export interface FixedCostSummaryResponse {
  expense_total: number
  fixed_total: number
  variable_total: number
  fixed_ratio: number | null
  essential_fixed_total: number
  discretionary_fixed_total: number
  essential_variable_total: number
  discretionary_variable_total: number
  required_spend_total: number
  discretionary_spend_total: number
  unclassified_total: number
  unclassified_count: number
  necessity_unclassified_total?: number
  necessity_unclassified_count?: number
}

export interface FixedCostTrendItem {
  period: string
  expense_total: number
  fixed_total: number
  variable_total: number
  essential_fixed_total: number
  discretionary_fixed_total: number
  essential_variable_total: number
  discretionary_variable_total: number
  required_spend_total: number
  discretionary_spend_total: number
  unclassified_total: number
  unclassified_count: number
  necessity_unclassified_total?: number
  necessity_unclassified_count?: number
  fixed_ratio: number | null
}

export interface FixedCostTrendResponse {
  items: FixedCostTrendItem[]
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
  reference_date: string
  is_partial_period: boolean
  assumptions: string
}

export interface RecurringPaymentItem {
  merchant: string
  category: string
  avg_amount: number
  interval_type: string
  avg_interval_days: number
  occurrences: number
  confidence: number
  last_date: string
  last_charge_date?: string | null
  net_amount?: number
  activity_status?: 'active_candidate' | 'historical' | 'irregular' | 'non_positive' | 'not_recurring'
  recurring_payment_kind: 'installment' | 'monthly_recurring' | 'not_recurring' | null
  installment_count: number
  monthly_recurring_count: number
  not_recurring_count: number
  unclassified_count: number
  transaction_ids: number[]
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

export interface RecurringPaymentsQuery {
  page?: number
  per_page?: number
  end_date?: string
  activity?: 'all' | 'active' | 'history'
  recent_days?: number
}

export interface MonthlyCashflowQuery extends AnalyticsDateRange {
  months?: number
}

export interface RecurringPaymentsResponse {
  reference_date?: string
  activity?: 'all' | 'active' | 'history'
  recent_days?: number
  total: number
  page: number
  per_page: number
  items: RecurringPaymentItem[]
  assumptions: string
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
