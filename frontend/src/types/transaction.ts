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
  fixed_cost_necessity: 'essential' | 'discretionary' | null
  cost_classification_source: 'manual' | 'auto' | null
  recurring_payment_kind: 'installment' | 'monthly_recurring' | null
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
  fixed_cost_necessity?: 'essential' | 'discretionary'
  recurring_payment_kind?: 'installment' | 'monthly_recurring'
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
  fixed_cost_necessity?: 'essential' | 'discretionary' | null
  recurring_payment_kind?: 'installment' | 'monthly_recurring' | null
  memo?: string | null
}

export interface TransactionBulkUpdateRequest {
  ids: number[]
  merchant?: string | null
  category_major_user?: string | null
  category_minor_user?: string | null
  cost_kind?: 'fixed' | 'variable' | null
  fixed_cost_necessity?: 'essential' | 'discretionary' | null
  recurring_payment_kind?: 'installment' | 'monthly_recurring' | null
  memo?: string | null
}

export type LoanRepaymentType = 'principal' | 'interest' | 'mixed' | 'unknown'

export interface LoanAccountCandidate {
  loan_account_id: number | null
  lender: string
  product_name: string
  display_name: string
  latest_snapshot_date: string | null
  latest_balance: string | null
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

export interface LoanTransactionLinkBulkResponse {
  updated: number
}

export type LoanLinkStateFilter = 'all' | 'linked' | 'unlinked'

export interface LoanTransactionLinkItem {
  transaction_id: number
  loan_account_id: number
  lender: string
  product_name: string
  display_name: string
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
}

export interface AutoClassificationSettingsPatchRequest {
  apply_cost_rules_on_upload?: boolean
  apply_loan_rules_on_upload?: boolean
}

export interface CategoryClassificationRuleRequest {
  category_major: string
  category_minor?: string | null
  cost_kind: 'fixed' | 'variable'
  fixed_cost_necessity?: 'essential' | 'discretionary' | null
}

export interface CategoryClassificationRuleResponse extends CategoryClassificationRuleRequest {
  id: number
  category_major: string
  category_minor: string | null
  cost_kind: 'fixed' | 'variable'
  fixed_cost_necessity: 'essential' | 'discretionary' | null
  created_at: string
  updated_at: string
}

export interface CategoryClassificationRuleListResponse {
  items: CategoryClassificationRuleResponse[]
}

export interface LoanMerchantRuleRequest {
  merchant: string
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
