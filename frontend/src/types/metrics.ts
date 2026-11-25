// T054/T057/T060/T061/T064 지표 계약 응답 — backend/app/schemas/{metrics,comparison,read_surface,income_projection,transfer_purpose}.py

export type MonthStatus = 'closed' | 'in_progress'

export interface SnapshotAsOf {
  assets: string | null
  loans: string | null
  investments: string | null
  insurance: string | null
  profile: string | null
}

export interface MetricAsOf {
  transaction_as_of: string | null
  transaction_as_of_basis: string
  first_transaction_date: string | null
  last_closed_period: string | null
  in_progress_period: string | null
  snapshot_as_of: SnapshotAsOf
}

export interface MetricInclusion {
  basis_view: string
  currency: string
  excluded: string[]
  sign_convention: string
  refunds: string
  transfers: string
  loans: string
  period_attribution: string
}

export interface MetricContract {
  definition: string
  scope: string
  inclusion: MetricInclusion
  as_of: MetricAsOf
  adjustability_undecided_total: number | null
  adjustability_undecided_share: number | null
  non_krw_transaction_count: number
  field_scopes: Record<string, string>
}

export type FlowRowKey =
  | 'income_undetermined'
  | 'committed_loan'
  | 'committed_installment'
  | 'committed_recurring'
  | 'ad_hoc_protected'
  | 'ad_hoc_adjustable'
  | 'undecided'
  | 'transfer_undetermined'
  | 'other_type'

export interface MonthlyFlowRow {
  section: 'income' | 'committed' | 'ad_hoc' | 'undecided' | 'transfer' | 'other'
  row: FlowRowKey
  amount: number
  signed_amount: number
  transaction_count: number
}

export type TransferFlowRowKey = 'transfer_investment_savings' | 'transfer_internal_move' | 'transfer_undecided'

export interface TransferFlowRow {
  row: TransferFlowRowKey
  label: string
  signed_amount: number
}

export interface MonthlyFlowMonth {
  period: string
  month_status: MonthStatus
  income_total: number
  committed_loan_total: number
  committed_installment_total: number
  committed_recurring_total: number
  committed_total: number
  ad_hoc_protected_total: number
  ad_hoc_adjustable_total: number
  undecided_total: number
  total_outflow: number
  living_spend: number
  adjustable_spend: number
  protected_spend: number
  adjustability_undecided_total: number
  adjustability_undecided_share: number | null
  residual: number
  residual_rate: number | null
  transfer_net: number
  transfer_activity_total: number
  other_type_total: number
  refund_total: number
  signed_total: number
  transaction_count: number
  rows: MonthlyFlowRow[]
  transfer_investment_net: number
  transfer_savings_net: number
  transfer_investment_savings_net: number
  transfer_internal_move_net: number
  transfer_undecided_net: number
  transfer_undecided_activity_total: number
  transfer_undecided_share: number | null
  transfer_rows: TransferFlowRow[]
  one_off_total: number
  ongoing_outflow: number
  ongoing_living_spend: number
}

export interface MonthlyFlowResponse {
  contract: MetricContract
  items: MonthlyFlowMonth[]
}

export type SpendCubeDimension =
  | 'period'
  | 'effective_category_major'
  | 'effective_category_minor'
  | 'merchant'
  | 'payment_form'
  | 'commitment_kind'
  | 'adjustability'
  | 'flow_row'

export interface SpendCubeFilters {
  effective_category_major?: string
  effective_category_minor?: string
  merchant?: string
  payment_form?: 'committed' | 'ad_hoc'
  commitment_kind?: 'loan' | 'installment' | 'recurring'
  adjustability?: 'protected' | 'adjustable' | 'undecided'
  flow_row?: FlowRowKey
}

export interface SpendCubeQuery extends SpendCubeFilters {
  start_period?: string
  end_period?: string
  group_by: SpendCubeDimension[]
  limit?: number
}

export interface SpendCubeRow {
  period: string | null
  effective_category_major: string | null
  effective_category_minor: string | null
  merchant: string | null
  payment_form: string | null
  commitment_kind: string | null
  adjustability: string | null
  flow_row: string | null
  amount: number
  charge_total: number
  refund_total: number
  transaction_count: number
}

export interface SpendCubeResponse {
  contract: MetricContract
  group_by: SpendCubeDimension[]
  total_amount: number
  rows: SpendCubeRow[]
}

export interface ExcludedCurrencyItem {
  period: string
  currency: string
  type: string
  signed_amount: number
  transaction_count: number
}

export interface MetricDataStatusResponse {
  as_of: MetricAsOf
  closed_periods: string[]
  in_progress_period: string | null
  adjustability_undecided_total: number
  adjustability_undecided_share: number | null
  total_outflow: number
  excluded_currency: ExcludedCurrencyItem[]
  non_krw_transaction_count: number
}

export type BaselineMethod = 'median_of_recent_closed_months' | 'previous_month'

export interface ComparisonBasis {
  definition: string
  target_period: string | null
  target_month_status: MonthStatus | null
  target_coverage: 'observed' | 'no_data' | null
  target_start_date: string | null
  target_end_date: string | null
  baseline_method: BaselineMethod
  baseline_unavailable_reason: 'baseline_start_date' | 'data_start' | 'no_data' | null
  baseline_method_label: string
  baseline_months_requested: number
  baseline_periods: string[]
  baseline_month_count: number
  baseline_status: 'full' | 'fewer_than_requested' | 'none'
  baseline_limited_by: 'baseline_start_date' | 'data_start' | null
  baseline_start_date: string | null
  baseline_start_period: string | null
  first_data_period: string | null
  first_data_period_starts_mid_month: boolean
  skipped_periods: Array<{ period: string; reason: 'no_data' }>
  partial_month_handling: 'closed_month_full' | 'same_elapsed_days'
  elapsed_day: number | null
  partial_month_note: string
  ratio_metrics_available: boolean
  previous_full_month_delta_available: boolean
  zero_vs_no_data_rule: string
  median_rule: string
}

export interface ComparisonMeasure {
  key: string
  label: string
  target_amount: number | null
  baseline_amount: number | null
  change_amount: number | null
  baseline_values: Array<{ period: string; amount: number }>
}

export interface ComparisonMonthlyFlowResponse {
  contract: MetricContract
  comparison: ComparisonBasis
  measures: ComparisonMeasure[]
  residual_rate: { key: 'residual_rate'; label: string; target_rate: number | null; baseline_rate: number | null } | null
}

export type ContributionAdjustability = 'all' | 'protected' | 'adjustable'

export interface ContributionItem {
  category: string
  merchant: string | null
  cadence: 'monthly' | 'annual_like'
  window: 'monthly' | 'twelve_month'
  target_amount: number
  target_period_amount: number
  baseline_amount: number | null
  change_amount: number | null
  baseline_observed_month_count: number
  baseline_zero_month_count: number
  active_months_in_window: number
  baseline_note: string | null
}

export interface TwelveMonthWindowBasis {
  rule: string
  target_window_start_period: string | null
  target_window_end_period: string | null
  baseline_window_start_period: string | null
  baseline_window_end_period: string | null
  target_window_complete: boolean
  baseline_window_available: boolean
  baseline_window_unavailable_reason: 'no_data' | 'baseline_start_date' | 'data_start' | null
}

export interface ContributionQuery {
  baseline?: BaselineMethod
  period?: string
  adjustability?: ContributionAdjustability
  one_off?: 'exclude' | 'include'
  level?: 'category' | 'merchant'
  category?: string
  limit?: number
}

export interface OneOffContributionReference {
  mode: 'exclude' | 'include'
  target_total: number | null
  target_events: { event_id: number; name: string; amount: number }[]
  baseline_values: { period: string; amount: number }[]
}

export interface ContributionResponse {
  contract: MetricContract
  comparison: ComparisonBasis
  adjustability: ContributionAdjustability
  level: 'category' | 'merchant'
  category: string | null
  ordering: 'abs_change_amount_desc'
  target_total: number | null
  baseline_total: number | null
  change_total: number | null
  one_off: OneOffContributionReference
  items: ContributionItem[]
  twelve_month_window: TwelveMonthWindowBasis
  twelve_month_items: ContributionItem[]
}

// /api/v1/read/review-items (envelope 중 화면이 쓰는 부분만)
export interface ReadStatusReason {
  code: string
  label: string
  periods: string[]
  detail: string | null
}

export interface ReviewListedBecause {
  source: 'purchase_review_candidate' | 'spending_anomaly'
  source_label: string
  code: string
  code_label: string
  detail: string | null
  signals: Record<string, number | string | boolean>
}

export interface ReviewItem {
  subject: 'transaction' | 'category_month'
  subject_label: string
  period: string
  date: string | null
  transaction_id: number | null
  category: string
  merchant: string | null
  amount: number
  baseline_amount: number | null
  change_amount: number | null
  review_status: string | null
  listed_because: ReviewListedBecause[]
}

export interface ReadReviewItemsResponse {
  surface: string
  surface_label: string
  status: 'ok' | 'classification_incomplete' | 'no_transactions' | 'not_imported' | 'query_failed'
  status_label: string
  status_reasons: ReadStatusReason[]
  basis: { definition: string; scope: string; rules: Record<string, string>; assumptions: string[] }
  data: {
    period: string | null
    start_date: string | null
    end_date: string | null
    total: number
    truncated: boolean
    items: ReviewItem[]
    comparison: ComparisonBasis | null
  }
}

// /api/v1/canonical-views/month-projection/accuracy (T064 R12)
export type ProjectionAccuracyBandKey = 'day_01_10' | 'day_11_20' | 'day_21_31'

export interface ProjectionAccuracyBand {
  band: ProjectionAccuracyBandKey
  as_of_days: number[]
  points: number
  withheld_points: number
  evaluated_points: number
  net_median_signed_error: number | null
  net_median_absolute_error: number | null
  net_median_signed_error_pct_of_income: number | null
  expense_median_signed_error: number | null
}

export interface ProjectionAccuracy {
  definition: string
  reference_period: string
  evaluated_periods: string[]
  as_of_days: number[]
  current_band: ProjectionAccuracyBandKey | null
  bands: ProjectionAccuracyBand[]
  actuals: { period: string; variable_ongoing_actual: number }[]
  limitations: string[]
}

// /api/v1/transfer-purposes/transactions (T061)
export type TransferPurpose = 'investment' | 'savings' | 'internal_move' | 'undecided'

export interface TransferPurposeItem {
  transaction_id: number
  effective: boolean
  date: string
  amount: number
  currency: string
  merchant: string
  description: string
  effective_category_major: string
  effective_category_minor: string | null
  purpose: TransferPurpose | null
  /** 목적이 어디서 왔나: 이 거래 / 거래처 규칙 / 카테고리 규칙 / 없음 */
  purpose_source: 'transaction' | 'rule_merchant' | 'rule_category' | 'none' | null
  transaction_purpose: Exclude<TransferPurpose, 'undecided'> | null
  rule_id: number | null
  rule_purpose: Exclude<TransferPurpose, 'undecided'> | null
}

export interface TransferPurposeListResponse {
  total_count: number
  undecided_count: number
  undecided_activity_total: number
  activity_total: number
  items: TransferPurposeItem[]
}
