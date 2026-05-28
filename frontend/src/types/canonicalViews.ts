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
  unclassified_expense_total: number
  net_cashflow: number
  savings_rate: number | null
}

export interface CanonicalTrueSpendableMonthlyItem {
  period: string
  income_total: number
  observed_income_total: number | null
  loan_repayment_total: number
  fixed_commitment_total: number
  variable_total: number
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

export interface CanonicalUnclassifiedWorkQueueItem {
  transaction_id: number
  date: string
  type: string
  merchant: string
  effective_category_major: string
  effective_category_minor: string | null
  amount: number
  amount_abs: number
  needs_cost_kind: boolean
  needs_fixed_cost_necessity: boolean
  needs_recurring_payment_kind: boolean
  needs_loan_link_review: boolean
  merchant_expense_count: number
  priority_score: number
  priority_reason: string
}

export interface CanonicalViewsDashboardResponse {
  monthly_cashflow: CanonicalMonthlyCashflowItem[]
  true_spendable_monthly: CanonicalTrueSpendableMonthlyItem[]
  loan_repayment_monthly: CanonicalLoanRepaymentMonthlyItem[]
  merchant_monthly_baseline: CanonicalMerchantMonthlyBaselineItem[]
  unclassified_work_queue: CanonicalUnclassifiedWorkQueueItem[]
}
