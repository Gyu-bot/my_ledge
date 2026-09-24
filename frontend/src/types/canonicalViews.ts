export interface CanonicalMonthlyCashflowItem {
  period: string
  income_total: number
  expense_total: number
  non_loan_expense_total: number
  transfer_activity_total: number
  loan_repayment_total: number
  fixed_total: number
  variable_total: number
  essential_fixed_total: number
  discretionary_fixed_total: number
  essential_variable_total: number
  discretionary_variable_total: number
  required_spend_total: number
  discretionary_spend_total: number
  unclassified_expense_total: number
  net_cashflow: number
  savings_rate: number | null
  savings_rate_basis:
    | 'observed_closed_month'
    | 'observed_partial_month'
    | 'insufficient_partial_month_income'
    | 'no_income'
  is_complete_month: boolean
}

export interface CanonicalTrueSpendableMonthlyItem {
  period: string
  income_total: number
  observed_income_total: number | null
  loan_repayment_total: number
  fixed_commitment_total: number
  variable_total: number
  required_variable_total: number
  discretionary_variable_total: number
  spendable_before_variable_spend: number
  remaining_after_variable_spend: number
  income_basis: 'observed' | 'estimated'
  is_income_estimated: boolean
  estimated_income_total: number | null
  income_estimate_month_count: number
  income_estimate_source: string | null
  excluded_income_periods: string[]
  estimated_spendable_before_variable_spend: number | null
  estimated_remaining_after_variable_spend: number | null
  is_complete_month: boolean
}

export interface CanonicalLoanRepaymentMonthlyItem {
  period: string
  loan_account_id: number
  loan_display_name: string | null
  loan_lender: string | null
  loan_product_name: string | null
  loan_kind: string | null
  loan_maturity_date: string | null
  loan_repayment_type: string | null
  repayment_total: number
  transaction_count: number
}

export interface CanonicalMerchantMonthlyBaselineItem {
  period: string
  merchant: string
  effective_category_major: string
  effective_category_minor: string | null
  monthly_spend: number
  transaction_count: number
  baseline_month_count: number
  trailing_3_month_avg: number | null
  baseline_delta: number | null
  baseline_delta_pct: number | null
}

export interface CanonicalRecurringMerchantMonthlyItem {
  period: string
  merchant: string
  recurring_payment_kind: string
  monthly_spend: number
  transaction_count: number
  first_date: string
  last_date: string
}

export interface CanonicalUnclassifiedWorkQueueItem {
  transaction_id: number
  date: string
  type: string
  merchant: string
  effective_category_major: string
  effective_category_minor: string | null
  amount: number
  amount_abs: number
  cost_kind: 'fixed' | 'variable' | null
  fixed_cost_necessity: 'essential' | 'discretionary' | null
  spend_necessity: 'essential' | 'discretionary' | null
  recurring_payment_kind: 'installment' | 'monthly_recurring' | 'not_recurring' | null
  needs_cost_kind: boolean
  needs_fixed_cost_necessity: boolean
  needs_spend_necessity: boolean
  needs_recurring_payment_kind: boolean
  needs_loan_link_review: boolean
  merchant_expense_count: number
  priority_score: number
  priority_reason: string
  issue_types: string[]
  primary_issue_type: string | null
  recurrence_signal: Record<string, boolean | number>
}

export interface CanonicalDataCoverage {
  first_transaction_date: string | null
  last_transaction_date: string | null
}

export interface CanonicalViewsDashboardResponse {
  data_coverage: CanonicalDataCoverage
  month_projection: MonthlyProjection | null
  merchant_monthly_baseline_total: number
  recurring_merchant_monthly_total: number
  unclassified_work_queue_total: number
  unclassified_work_queue_page: number
  unclassified_work_queue_per_page: number
  unclassified_work_queue_total_pages: number
  monthly_cashflow: CanonicalMonthlyCashflowItem[]
  true_spendable_monthly: CanonicalTrueSpendableMonthlyItem[]
  loan_repayment_monthly: CanonicalLoanRepaymentMonthlyItem[]
  merchant_monthly_baseline: CanonicalMerchantMonthlyBaselineItem[]
  recurring_merchant_monthly: CanonicalRecurringMerchantMonthlyItem[]
  unclassified_work_queue: CanonicalUnclassifiedWorkQueueItem[]
}


export type ProjectionConfidence = 'high' | 'medium' | 'low' | 'unavailable'
export interface ProjectionCoverage {
  basis: string
  latest_upload_date: string | null
  first_observed_date: string | null
  last_observed_date: string | null
  adequately_covered_periods: string[]
  excluded_periods: string[]
  missing_periods: string[]
}
export interface IncomeProjectionSource {
  source_key: string
  merchant: string
  expected_amount: number
  observed_amount: number
  remaining_amount: number
  expected_date: string | null
  expected_day: number | null
  expected_date_from: string | null
  expected_date_to: string | null
  status: 'expected' | 'received' | 'partial' | 'late' | 'stopped' | 'uncertain'
  confidence: ProjectionConfidence
  history_periods: string[]
  excluded_periods: string[]
  matched_transaction_ids: number[]
  reason: string
}
export interface ExpenseProjectionComponent {
  kind: 'loan' | 'installment' | 'recurring' | 'variable'
  expected_remaining: number | null
  known_expected_remaining: number
  basis: string
  missing_reasons: string[]
}
export interface MonthlyProjection {
  period: string
  as_of_date: string
  observed_through: string | null
  observed_income: number
  expected_remaining_income: number
  projected_month_income: number
  observed_net_expense: number
  expected_remaining_expense: number | null
  known_expected_remaining_expense: number
  net_after_known_remaining_expense: number
  projected_month_expense: number | null
  observed_net_cashflow: number
  projected_month_end_net: number | null
  confidence: ProjectionConfidence
  included_periods: string[]
  excluded_periods: string[]
  missing_reasons: string[]
  limitations: string[]
  income_sources: IncomeProjectionSource[]
  expense_components: ExpenseProjectionComponent[]
  coverage: ProjectionCoverage
}
