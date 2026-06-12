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

export interface CategoryMoMItem {
  period: string
  previous_period: string
  category: string
  current_amount: number
  previous_amount: number
  delta_amount: number
  delta_pct: number | null
}

export interface CategoryMoMResponse {
  items: CategoryMoMItem[]
}

export interface CategoryMoMQuery {
  months?: number
  start_month?: string
  end_month?: string
  base_month?: string
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
  recurring_payment_kind: 'installment' | 'monthly_recurring' | 'not_recurring' | null
  installment_count: number
  monthly_recurring_count: number
  not_recurring_count: number
  unclassified_count: number
  transaction_ids: number[]
}

export interface RecurringPaymentsResponse {
  total: number
  page: number
  per_page: number
  items: RecurringPaymentItem[]
  assumptions: string
}

export interface SpendingAnomalyItem {
  period: string
  category: string
  amount: number
  baseline_avg: number
  delta_pct: number | null
  delta_pct_raw?: number | null
  delta_pct_display?: number | null
  delta_display_capped?: boolean
  baseline_quality?: string
  anomaly_mode?: string
  anomaly_score: number
  reason: string
}

export interface SpendingAnomaliesResponse {
  total: number
  page: number
  per_page: number
  items: SpendingAnomalyItem[]
  comparison_mode: 'closed' | 'partial'
  reference_date: string
  is_partial_period: boolean
  assumptions: string
}

export interface IncomeStabilityQuery {
  end_date?: string
}

export interface SpendingAnomaliesQuery {
  page?: number
  per_page?: number
  end_date?: string
}

export type AnalyticsRiskLevel = 'low' | 'watch' | 'warning' | 'high' | 'critical'

export interface DiscretionaryVelocityResponse {
  period: string
  as_of_date: string
  month_progress_ratio: number
  discretionary_spend: number
  baseline_spend_at_same_progress: number
  velocity_ratio: number | null
  risk_level: AnalyticsRiskLevel
  review_priority?: number | null
  confidence: number
  reasons: string[]
  assumptions: string[]
  unclassified_spend: number
  classification_coverage_ratio: number
  income_basis?: 'observed' | 'estimated' | string | null
}

export interface DiscretionaryVelocityQuery {
  as_of_date?: string
}

export type PurchaseGateCandidateType =
  | 'large_oneoff'
  | 'new_merchant'
  | 'merchant_spike'
  | 'discretionary_spike'

export type PurchaseGateCandidateStatus =
  | 'pending'
  | 'reviewed'
  | 'ignored'
  | 'snoozed'
  | 'dismissed'

export interface PurchaseGateCandidateItem {
  candidate_type: PurchaseGateCandidateType
  candidate_types: string[]
  transaction_id: number
  candidate_key: string
  date: string
  merchant: string
  amount: number
  category: string
  signals: Record<string, number | string | boolean>
  risk_level: AnalyticsRiskLevel
  review_priority: string
  confidence: string
  suggested_review_window: string
  review_status: PurchaseGateCandidateStatus
  review_memo?: string | null
  reviewed_at?: string | null
  cooldown_until?: string | null
  review_timing?: 'post_transaction'
  candidate_purpose?: 'future_friction_rule_candidate'
  future_friction_suggestion?: {
    condition?: Record<string, unknown>
    action?: string
  } | null
  reasons: string[]
  assumptions: string[]
}

export interface PurchaseGateCandidatesResponse {
  total: number
  page: number
  per_page: number
  items: PurchaseGateCandidateItem[]
  assumptions: string[]
}

export interface PurchaseGateCandidatesQuery {
  status?: PurchaseGateCandidateStatus
  limit?: number
}

export interface PurchaseGateReviewPatchRequest {
  review_status: PurchaseGateCandidateStatus
  memo?: string | null
  cooldown_days?: number | null
}
