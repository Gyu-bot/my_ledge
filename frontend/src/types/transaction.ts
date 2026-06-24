export type RecurringPaymentKind = 'installment' | 'monthly_recurring' | 'not_recurring'
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
  cost_kind: 'fixed' | 'variable' | null
  fixed_cost_necessity: SpendNecessity | null
  spend_necessity: SpendNecessity | null
  cost_classification_source: 'manual' | 'auto' | null
  recurring_payment_kind: RecurringPaymentKind | null
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
  cost_kind?: 'fixed' | 'variable'
  fixed_cost_necessity?: SpendNecessity
  spend_necessity?: SpendNecessity
  recurring_payment_kind?: RecurringPaymentKind
  search?: string
  start_month?: string
  end_month?: string
  include_income?: boolean
}

export interface CategoryBreakdownParams {
  start_month?: string
  end_month?: string
  include_income?: boolean
  level?: 'major' | 'minor'
}

export interface SubcategoryBreakdownParams {
  start_month?: string
  end_month?: string
  include_income?: boolean
  category_major: string
}

export interface TransactionUpdateRequest {
  merchant?: string | null
  category_major_user?: string | null
  category_minor_user?: string | null
  cost_kind?: 'fixed' | 'variable' | null
  fixed_cost_necessity?: SpendNecessity | null
  spend_necessity?: SpendNecessity | null
  recurring_payment_kind?: RecurringPaymentKind | null
  memo?: string | null
}

export interface TransactionBulkUpdateRequest {
  ids: number[]
  merchant?: string | null
  category_major_user?: string | null
  category_minor_user?: string | null
  cost_kind?: 'fixed' | 'variable' | null
  fixed_cost_necessity?: SpendNecessity | null
  spend_necessity?: SpendNecessity | null
  recurring_payment_kind?: RecurringPaymentKind | null
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
  loan_kind: LoanKind
  is_hidden?: boolean | null
}

export interface LoanAccountsParams {
  include_hidden?: boolean
}

export interface LoanTransactionLinkBulkResponse {
  updated: number
}

export type LoanLinkStateFilter = 'all' | 'linked' | 'unlinked'

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
}

export type InstallmentPlanStatus = 'active' | 'completed' | 'cancelled'
export type InstallmentLinkStateFilter = 'all' | 'linked' | 'unlinked'
export type InstallmentForecastStatus = 'observed' | 'projected' | 'missed'

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
  recurring_payment_kind: RecurringPaymentKind | null
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

export interface InstallmentForecastItem {
  installment_plan_id: number
  installment_plan_display_name: string
  installment_number: number
  total_installments: number
  due_date: string
  period: string
  amount: number
  status: InstallmentForecastStatus
  transaction_id: number | null
}

export interface InstallmentForecastMonthlySummaryItem {
  period: string
  observed_total: number
  projected_total: number
  missed_total: number
}

export interface InstallmentForecastResponse {
  items: InstallmentForecastItem[]
  monthly_summary: InstallmentForecastMonthlySummaryItem[]
}

export interface InstallmentForecastParams {
  as_of_date?: string
  months?: number
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
  apply_cost_rules_on_upload: boolean
  apply_loan_rules_on_upload: boolean
  apply_recurring_rules_on_upload: boolean
}

export interface AutoClassificationSettingsPatchRequest {
  apply_cost_rules_on_upload?: boolean
  apply_loan_rules_on_upload?: boolean
  apply_recurring_rules_on_upload?: boolean
}

export interface CategoryClassificationRuleRequest {
  category_major: string
  category_minor?: string | null
  cost_kind: 'fixed' | 'variable'
  fixed_cost_necessity?: SpendNecessity | null
  spend_necessity?: SpendNecessity | null
}

export interface CategoryClassificationRuleResponse extends CategoryClassificationRuleRequest {
  id: number
  category_major: string
  category_minor: string | null
  cost_kind: 'fixed' | 'variable'
  fixed_cost_necessity: SpendNecessity | null
  spend_necessity: SpendNecessity | null
  created_at: string
  updated_at: string
}

export interface CategoryClassificationRuleListResponse {
  items: CategoryClassificationRuleResponse[]
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

export interface RecurringCategoryRuleRequest {
  category_major: string
  category_minor?: string | null
  recurring_payment_kind: RecurringPaymentKind
}

export interface RecurringCategoryRuleResponse extends RecurringCategoryRuleRequest {
  id: number
  category_major: string
  category_minor: string | null
  recurring_payment_kind: RecurringPaymentKind
  created_at: string
  updated_at: string
}

export interface RecurringCategoryRuleListResponse {
  items: RecurringCategoryRuleResponse[]
}

export type RecurringDryRunApplyScope = 'future_only' | 'all_matching'

export interface RecurringDryRunMatchedTransaction {
  id: number
  date: string
  amount: number
}

export interface RecurringDryRunItem {
  merchant: string
  proposed_kind: RecurringPaymentKind
  confidence: number
  matched_transactions: RecurringDryRunMatchedTransaction[]
  reason: string
  category_hint: string
  apply_scope_options: RecurringDryRunApplyScope[]
}

export interface RecurringDryRunResponse {
  items: RecurringDryRunItem[]
}

export interface RecurringDryRunApplyRequest {
  merchant: string
  proposed_kind: RecurringPaymentKind
  apply_scope: RecurringDryRunApplyScope
}

export interface AutoClassificationApplyResponse {
  updated: number
}
