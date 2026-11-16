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
export interface RecurringExpenseProjectionSource {
  source_key: string
  merchant: string
  expected_monthly_amount: number | null
  observed_payment_amount: number
  observed_refund_amount: number
  observed_net_expense: number
  expected_remaining: number | null
  additional_observed_amount: number
  confidence: ProjectionConfidence
  status: 'expected' | 'observed' | 'review'
  basis: string
  history_periods: string[]
  excluded_periods: string[]
  warnings: string[]
}
export interface ExpenseProjectionComponent {
  kind: 'loan' | 'installment' | 'recurring' | 'variable'
  expected_remaining: number | null
  known_expected_remaining: number
  basis: string
  confidence: ProjectionConfidence
  missing_reasons: string[]
  warnings: string[]
  sources: RecurringExpenseProjectionSource[]
  /** T064 R1/R2: 사람이 등록한 규칙에 맞지만 연결이 확인되지 않은 이번 달 결제 */
  link_unconfirmed_count?: number
  link_unconfirmed_amount?: number
  /** T064 R1: 장부에 지출 줄이 없어 가정에 더하지 않은 대출 */
  not_in_expense_commitments?: ProjectionCommitmentNotInExpense[]
  /** T064 R4 (변동 지출만) */
  twelve_month_window?: ProjectionTwelveMonthWindow | null
  annual_items?: AnnualExpenseAssumption[]
}
export interface ProjectionCommitmentNotInExpense {
  kind: 'loan'
  name: string
  loan_account_id: number | null
  monthly_amount: number | null
  checked_periods: string[]
  reason_code: 'no_expense_line_in_recent_month' | 'no_loan_account'
  reason: string
}
export interface ProjectionTwelveMonthWindow {
  rule: string
  start_period: string
  end_period: string
  available: boolean
  unavailable_reason: 'no_data' | 'data_start' | 'baseline_start_date' | null
}
export interface AnnualExpenseAssumption {
  category: string
  active_months_in_window: number
  last_year_period: string
  last_year_same_month_amount: number
  observed_this_month: number
  expected_remaining: number
  basis: string
}
/** T064 R12: 남은 지출 가정의 조정 가능성 나눔 */
export interface ProjectionAdjustabilityShare {
  basis: string
  protected_amount: number
  adjustable_amount: number
  undecided_amount: number
  total_amount: number
  undecided_share_pct: number | null
}
export interface ProjectionCompleteness {
  status: 'all_known_components' | 'known_components_only' | 'not_projected'
  status_label: string
  full_projection_available: boolean
  amount_scope: 'all_known_components' | 'known_components' | 'none'
  left_out: Array<{
    component: 'income_source' | 'loan' | 'installment' | 'recurring' | 'variable'
    key: string | null
    name: string | null
    reason_code: string
    reason: string
  }>
  basis: string
}

export interface MonthlyProjection {
  completeness: ProjectionCompleteness | null
  period: string
  as_of_date: string
  observed_through: string | null
  /** T064 R10: 남은 기간 가정이 시작하는 날. 월 전체가 관측됐으면 null */
  remaining_period_start?: string | null
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
  warnings: string[]
  limitations: string[]
  income_sources: IncomeProjectionSource[]
  expense_components: ExpenseProjectionComponent[]
  coverage: ProjectionCoverage
  /** T064 R11: 기준일을 정한 방법 */
  as_of_basis?: 'requested_date' | 'transaction_as_of' | 'today_no_data'
  remaining_expense_adjustability?: ProjectionAdjustabilityShare | null
}
