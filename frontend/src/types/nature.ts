// T056 두 축(지급 형태 · 조정 가능성) API — backend/app/schemas/nature_axes.py

export type AdjustabilityValue = 'protected' | 'adjustable'
export type ResolvedAdjustability = AdjustabilityValue | 'undecided' | 'not_applicable'
export type AdjustabilitySource =
  | 'fixed_loan'
  | 'fixed_installment'
  | 'transaction'
  | 'commitment'
  | 'category_default'
  | 'none'
  | 'not_applicable'
export type PaymentForm = 'committed' | 'ad_hoc' | 'not_applicable'
export type CommitmentKind = 'loan' | 'installment' | 'recurring'
export type CommitmentScope = 'merchant' | 'category'
export type CommitmentCycle = 'monthly' | 'yearly' | 'n_times'
export type CommitmentAmountKind = 'fixed' | 'variable'
export type NatureOrigin = 'migration' | 'user' | 'legacy_edit'

export interface CategoryAdjustabilityDefault {
  id: number
  category_major: string
  category_minor: string | null
  adjustability: AdjustabilityValue
  created_at: string
  updated_at: string
}

export interface CategoryAdjustabilityDefaultRequest {
  category_major: string
  category_minor: string | null
  adjustability: AdjustabilityValue
}

export interface RecurringCommitment {
  id: number
  label: string | null
  match_scope: CommitmentScope
  merchant: string | null
  category_major: string
  category_minor: string | null
  cycle: CommitmentCycle | null
  total_count: number | null
  amount_kind: CommitmentAmountKind | null
  adjustability: AdjustabilityValue | null
  start_date: string | null
  end_date: string | null
  origin: NatureOrigin
  memo: string | null
  attributes_confirmed_at: string | null
  needs_attribute_confirmation: boolean
  member_transaction_count: number
  first_member_date: string | null
  last_member_date: string | null
  created_at: string
  updated_at: string
}

export interface RecurringCommitmentAttributes {
  label: string | null
  cycle: CommitmentCycle | null
  total_count: number | null
  amount_kind: CommitmentAmountKind | null
  adjustability: AdjustabilityValue | null
  start_date: string | null
  end_date: string | null
  memo: string | null
}

export interface RecurringCommitmentCreateRequest extends RecurringCommitmentAttributes {
  match_scope: CommitmentScope
  merchant: string | null
  category_major: string
  category_minor: string | null
}

export type RecurringCommitmentUpdateRequest = Partial<RecurringCommitmentCreateRequest> & { confirm_attributes?: boolean }

export interface NatureLevels {
  fixed: AdjustabilityValue | null
  transaction: AdjustabilityValue | null
  commitment: AdjustabilityValue | null
  category_default: AdjustabilityValue | null
}

export interface NatureCommitmentRef {
  id: number
  match: 'rule' | 'explicit'
  label: string | null
  match_scope: CommitmentScope
  merchant: string | null
  category_major: string
  category_minor: string | null
  cycle: CommitmentCycle | null
  amount_kind: CommitmentAmountKind | null
  start_date: string | null
  end_date: string | null
}

export interface TransactionNature {
  transaction_id: number
  effective: boolean
  type: string
  date: string
  merchant: string
  effective_category_major: string
  effective_category_minor: string | null
  payment_form: PaymentForm | null
  commitment_kind: CommitmentKind | null
  loan_account_id: number | null
  installment_plan_id: number | null
  commitment: NatureCommitmentRef | null
  adjustability: ResolvedAdjustability | null
  adjustability_source: AdjustabilitySource | null
  levels: NatureLevels
  excluded_from_commitments: boolean
  installment_link_unconfirmed: boolean
  necessity_conflict: boolean
}

// T061 이체 목적 (거래 한 건)
export type TransferPurposeValue = 'investment' | 'savings' | 'internal_move'

export type TransferPurposeSource = 'transaction' | 'rule_merchant' | 'rule_category' | 'none'

export interface TransferPurposeDetail {
  transaction_id: number
  effective: boolean
  purpose: TransferPurposeValue | 'undecided' | null
  purpose_source: TransferPurposeSource | null
}

// T061 이체 목적 규칙 — 사람이 거래처나 카테고리 단위로 정한다 (backend/app/schemas/transfer_purpose.py)
export type TransferRuleScope = 'merchant' | 'category'

export interface TransferPurposeRule {
  id: number
  match_scope: TransferRuleScope
  merchant: string | null
  category_major: string | null
  category_minor: string | null
  purpose: TransferPurposeValue
  label: string | null
  memo: string | null
  /** 지금 이 규칙으로 목적이 정해진 유효 이체 건수 */
  matched_transfer_count: number
  created_at: string
  updated_at: string
}

export interface TransferPurposeRuleCreateRequest {
  match_scope: TransferRuleScope
  merchant?: string | null
  category_major?: string | null
  category_minor?: string | null
  purpose: TransferPurposeValue
  label?: string | null
  memo?: string | null
}

export type TransferPurposeRuleUpdateRequest = Partial<TransferPurposeRuleCreateRequest>
