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
  unclassified_total: number
  unclassified_count: number
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
