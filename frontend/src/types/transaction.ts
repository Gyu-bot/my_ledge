import type { FlowRowKey } from './metrics'
export type SpendNecessity = 'essential' | 'discretionary'

export interface TransactionResponse {
  id: number
  date: string         // "YYYY-MM-DD"
  time: string         // "HH:MM:SS"
  type: string
  category_major: string
  category_minor: string | null
  category_major_user: string | null
  category_minor_user: string | null
  effective_category_major: string
  effective_category_minor: string | null
  description: string
  merchant: string
  amount: number
  currency: string
  payment_method: string | null
  memo: string | null
  is_deleted: boolean
  merged_into_id: number | null
  is_edited: boolean
  source: string
  created_at: string
  updated_at: string
}

export interface TransactionListResponse {
  total: number
  page: number
  per_page: number
  items: TransactionResponse[]
}

export interface TransactionFilterOptionsResponse {
  category_options: string[]
  category_minor_options: string[]
  category_minor_options_by_major: Record<string, string[]>
  payment_method_options: string[]
}

export interface TransactionListParams {
  page?: number
  per_page?: number
  type?: string
  source?: string
  category_major?: string
  payment_method?: string
  start_date?: string
  end_date?: string
  include_deleted?: boolean
  is_edited?: boolean
  search?: string
  start_month?: string
  end_month?: string
  include_income?: boolean
  /** T059 월 흐름표 줄 필터 — vw_metric_flow_lines의 값 그대로 */
  flow_row?: FlowRowKey
  payment_form?: 'committed' | 'ad_hoc' | 'not_applicable'
  adjustability?: 'protected' | 'adjustable' | 'undecided' | 'not_applicable'
}

export interface CategoryBreakdownParams {
  start_date?: string
  end_date?: string
  start_month?: string
  end_month?: string
  include_income?: boolean
  level?: 'major' | 'minor'
}

export interface SubcategoryBreakdownParams {
  start_date?: string
  end_date?: string
  start_month?: string
  end_month?: string
  include_income?: boolean
  category_major: string
}

export interface TransactionUpdateRequest {
  merchant?: string | null
  category_major_user?: string | null
  category_minor_user?: string | null
  memo?: string | null
}

export interface TransactionBulkUpdateRequest {
  ids: number[]
  merchant?: string | null
  category_major_user?: string | null
  category_minor_user?: string | null
  memo?: string | null
}

export interface TransactionBulkMutationRequest {
  ids: number[]
}

export interface TransactionBulkMutationPreview {
  count: number
  period_start: string | null
  period_end: string | null
  expense_total: number
  representative_merchants: string[]
}

export interface TransactionBulkMutationResponse {
  updated: number
  preview: TransactionBulkMutationPreview
}

export type LoanRepaymentType = 'principal' | 'interest' | 'mixed' | 'unknown'
export type LoanMerchantRuleMatchField = 'merchant' | 'description'
export type LoanKind =
  | 'unknown'
  | 'overdraft'
  | 'equal_principal_interest'
  | 'equal_principal'
  | 'bullet'
  | 'other'

export interface LoanAccountCandidate {
  loan_account_id: number | null
  lender: string
  product_name: string
  display_name_user: string | null
  display_name: string
  loan_kind: LoanKind
  loan_start_date: string | null
  loan_maturity_date: string | null
  as_of_date: string | null
  latest_snapshot_date: string | null
  is_active: boolean
  is_hidden: boolean
  is_matured: boolean
  is_stale: boolean
  lifecycle_status: string
  latest_balance: string | null
  last_observed_balance: string | null
  last_observed_principal: string | null
  last_observed_snapshot_date: string | null
  included_in_active_summary: boolean
  excluded_from_summary_reason: string | null
  stable_identity_status: string
  stable_identity_reason: string | null
  latest_interest_rate: string | null
}

export interface LoanAccountsResponse {
  items: LoanAccountCandidate[]
}

export interface LoanTransactionLinkBulkRequest {
  transaction_ids: number[]
  loan_account_id?: number | null
  lender?: string | null
  product_name?: string | null
  repayment_type: LoanRepaymentType
  memo?: string | null
}

export interface LoanAccountMetadataUpdateRequest {
  loan_account_id?: number | null
  lender?: string | null
  product_name?: string | null
  display_name_user?: string | null
  loan_kind?: LoanKind
  is_hidden?: boolean | null
}

export interface LoanAccountsParams {
  include_hidden?: boolean
}

export interface LoanTransactionLinkBulkResponse {
  updated: number
}

export type LoanLinkStateFilter = 'all' | 'linked' | 'unlinked'
export type LoanCandidateReviewStatus = 'pending' | 'not_candidate'
export type LoanCandidateReviewFilter = 'all' | 'pending' | 'not_candidate'

export interface LoanCandidateReviewPatchRequest {
  review_status: LoanCandidateReviewStatus
  memo?: string | null
}

export interface LoanCandidateReviewResponse {
  candidate_key: string
  candidate_type: 'loan_transaction'
  transaction_id: number
  review_status: LoanCandidateReviewStatus
  memo: string | null
  reviewed_at: string | null
}

export interface LoanTransactionLinkItem {
  transaction_id: number
  loan_account_id: number
  lender: string
  product_name: string
  display_name_user: string | null
  display_name: string
  loan_kind: LoanKind
  repayment_type: LoanRepaymentType
  source: 'manual' | 'auto'
  memo: string | null
  created_at: string
  updated_at: string
}

export interface LoanTransactionMappingItem {
  transaction_id: number
  date: string
  time: string
  type: string
  effective_category_major: string
  effective_category_minor: string | null
  description: string
  merchant: string
  amount: number
  currency: string
  payment_method: string | null
  memo: string | null
  link: LoanTransactionLinkItem | null
}

export interface LoanTransactionMappingListResponse {
  total: number
  page: number
  per_page: number
  items: LoanTransactionMappingItem[]
}

export interface LoanTransactionMappingParams {
  page?: number
  per_page?: number
  start_date?: string
  end_date?: string
  search?: string
  linked?: LoanLinkStateFilter
  loan_account_id?: number
  repayment_type?: LoanRepaymentType
  review_status?: LoanCandidateReviewFilter
}

export type InstallmentPlanStatus = 'active' | 'completed' | 'cancelled'
export type InstallmentLinkStateFilter = 'all' | 'linked' | 'unlinked'
export type InstallmentSuggestionConfidence = 'high' | 'medium' | 'low'
export type InstallmentSuggestionConflictReason = 'installment_number_already_linked' | 'ambiguous_plan_match' | 'competing_transactions' | 'inactive_installment_link'

export interface InstallmentPlanResponse {
  id: number
  display_name: string
  merchant: string
  payment_method: string | null
  total_installments: number
  monthly_amount: number
  first_payment_date: string
  memo: string | null
  status: InstallmentPlanStatus
  linked_installment_count: number
  created_at: string
  updated_at: string
}

export interface InstallmentPlansResponse {
  items: InstallmentPlanResponse[]
}

export interface InstallmentPlanCreateRequest {
  display_name: string
  merchant: string
  payment_method?: string | null
  total_installments: number
  monthly_amount: number
  first_payment_date: string
  memo?: string | null
}

export interface InstallmentPlanPatchRequest {
  display_name?: string
  merchant?: string
  payment_method?: string | null
  total_installments?: number
  monthly_amount?: number
  first_payment_date?: string
  memo?: string | null
  status?: InstallmentPlanStatus
}

export interface InstallmentTransactionLinkItem {
  transaction_id: number
  installment_plan_id: number
  installment_plan_display_name: string
  total_installments: number
  installment_number: number
  monthly_amount: number
  due_date: string
  source: 'manual' | 'auto'
  memo: string | null
  created_at: string
  updated_at: string
}

export interface InstallmentTransactionMappingItem {
  transaction_id: number
  date: string
  time: string
  type: string
  effective_category_major: string
  effective_category_minor: string | null
  description: string
  merchant: string
  amount: number
  currency: string
  payment_method: string | null
  memo: string | null
  link: InstallmentTransactionLinkItem | null
}

export interface InstallmentTransactionMappingListResponse {
  total: number
  page: number
  per_page: number
  items: InstallmentTransactionMappingItem[]
}

export interface InstallmentTransactionMappingParams {
  page?: number
  per_page?: number
  start_date?: string
  end_date?: string
  search?: string
  linked?: InstallmentLinkStateFilter
  installment_plan_id?: number
}

export interface InstallmentSuggestionTransactionItem {
  transaction_id: number
  date: string
  time: string
  type: string
  effective_category_major: string
  effective_category_minor: string | null
  description: string
  merchant: string
  amount: number
  currency: string
  payment_method: string | null
  memo: string | null
}

export interface InstallmentTransactionSuggestionItem {
  transaction: InstallmentSuggestionTransactionItem
  installment_plan_id: number
  installment_plan_display_name: string
  installment_plan_merchant: string
  total_installments: number
  monthly_amount: number
  first_payment_date: string
  suggested_installment_number: number
  expected_billing_date: string
  amount_delta: number
  billing_day_delta: number
  score: number
  confidence: InstallmentSuggestionConfidence
  reason_labels: string[]
  conflict_reason: InstallmentSuggestionConflictReason | null
  conflicting_transaction_id?: number | null
  conflicting_transaction_state?: 'deleted' | 'merged' | null
  is_usable: boolean
}

export interface InstallmentTransactionSuggestionListResponse {
  total: number
  page: number
  per_page: number
  items: InstallmentTransactionSuggestionItem[]
}

export interface InstallmentTransactionSuggestionParams {
  installment_plan_id?: number
  page?: number
  per_page?: number
}

export interface InstallmentTransactionLinkRequest {
  installment_plan_id: number
  installment_number: number
  memo?: string | null
}

export interface InstallmentTransactionLinkBulkRequest {
  transaction_ids: number[]
  installment_plan_id: number
  start_installment_number: number
  memo?: string | null
}

export interface InstallmentTransactionLinkBulkResponse {
  updated: number
}

export interface CategoryTimelineItem {
  period: string
  category: string
  amount: number
}

export interface CategoryBreakdownItem {
  category: string
  amount: number
}

export interface MerchantTreemapNode {
  name: string
  value: number
  children?: MerchantTreemapNode[]
}

export interface MonthlySummaryItem {
  period: string
  amount: number
}

export interface AutoClassificationSettings {
  apply_loan_rules_on_upload: boolean
}

export interface AutoClassificationSettingsPatchRequest {
  apply_loan_rules_on_upload?: boolean
}

export interface MerchantAliasRuleRequest {
  alias_pattern: string
  normalized_merchant: string
}

export interface MerchantAliasRuleResponse {
  id: number
  alias_pattern: string
  normalized_merchant: string
  created_at: string
  updated_at: string
}

export interface MerchantAliasRuleListResponse {
  items: MerchantAliasRuleResponse[]
}

export interface LoanMerchantRuleRequest {
  merchant: string
  match_field: LoanMerchantRuleMatchField
  loan_account_id: number
  repayment_type: LoanRepaymentType
  memo?: string | null
}

export interface LoanMerchantRuleResponse extends LoanMerchantRuleRequest {
  id: number
  lender: string
  product_name: string
  display_name: string
  memo: string | null
  created_at: string
  updated_at: string
}

export interface LoanMerchantRuleListResponse {
  items: LoanMerchantRuleResponse[]
}

export interface AutoClassificationApplyResponse {
  updated: number
}
