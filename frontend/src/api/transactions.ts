import { apiFetch } from '../lib/apiClient'
import { monthSpanToDateRange, monthToDateRange } from '../lib/dateRange'
import type {
  TransactionListResponse,
  TransactionListParams,
  TransactionFilterOptionsResponse,
  TransactionUpdateRequest,
  TransactionBulkUpdateRequest,
  TransactionBulkMutationRequest,
  TransactionBulkMutationPreview,
  TransactionBulkMutationResponse,
  LoanAccountCandidate,
  LoanAccountMetadataUpdateRequest,
  LoanAccountsParams,
  LoanAccountsResponse,
  LoanCandidateReviewPatchRequest,
  LoanCandidateReviewResponse,
  LoanTransactionLinkBulkRequest,
  LoanTransactionLinkBulkResponse,
  LoanTransactionMappingListResponse,
  LoanTransactionMappingParams,
  InstallmentPlansResponse,
  InstallmentPlanCreateRequest,
  InstallmentPlanPatchRequest,
  InstallmentTransactionLinkItem,
  InstallmentTransactionLinkRequest,
  InstallmentTransactionLinkBulkRequest,
  InstallmentTransactionLinkBulkResponse,
  InstallmentTransactionMappingListResponse,
  InstallmentTransactionMappingParams,
  InstallmentTransactionSuggestionListResponse,
  InstallmentTransactionSuggestionParams,
  InstallmentForecastResponse,
  InstallmentForecastParams,
  InstallmentPlanResponse,
  CategoryTimelineItem,
  CategoryBreakdownItem,
  CategoryBreakdownParams,
  SubcategoryBreakdownParams,
  MerchantTreemapNode,
  AutoClassificationSettings,
  AutoClassificationSettingsPatchRequest,
  CategoryClassificationRuleRequest,
  CategoryClassificationRuleListResponse,
  CategoryClassificationRuleResponse,
  MerchantAliasRuleRequest,
  MerchantAliasRuleListResponse,
  MerchantAliasRuleResponse,
  LoanMerchantRuleRequest,
  LoanMerchantRuleListResponse,
  LoanMerchantRuleResponse,
  RecurringCategoryRuleRequest,
  RecurringCategoryRuleListResponse,
  RecurringCategoryRuleResponse,
  RecurringDryRunApplyRequest,
  RecurringDryRunResponse,
  AutoClassificationApplyResponse,
} from '../types/transaction'

function buildQuery(params: object): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function loadTransactionsForDateRange(params: {
  start_date?: string
  end_date?: string
  include_income?: boolean
}) {
  const type = params.include_income ? 'all' : '지출'
  const perPage = 200
  const firstPage = await apiFetch<TransactionListResponse>(`/transactions${buildQuery({
    start_date: params.start_date,
    end_date: params.end_date,
    type,
    page: 1,
    per_page: perPage,
  })}`)

  const items = [...firstPage.items]
  const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.per_page))

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await apiFetch<TransactionListResponse>(`/transactions${buildQuery({
      start_date: params.start_date,
      end_date: params.end_date,
      type,
      page,
      per_page: perPage,
    })}`)
    items.push(...nextPage.items)
  }

  return items
}

export const transactionApi = {
  list: (params: TransactionListParams = {}) => {
    const { start_month, end_month, ...rest } = params
    return apiFetch<TransactionListResponse>(`/transactions${buildQuery({
      ...rest,
      ...monthSpanToDateRange(start_month, end_month),
    })}`)
  },

  filterOptions: () =>
    apiFetch<TransactionFilterOptionsResponse>('/transactions/filter-options'),

  update: (id: number, data: TransactionUpdateRequest) =>
    apiFetch<void>(`/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    apiFetch<void>(`/transactions/${id}`, { method: 'DELETE' }),

  restore: (id: number) =>
    apiFetch<void>(`/transactions/${id}/restore`, { method: 'POST' }),

  bulkUpdate: (data: TransactionBulkUpdateRequest) =>
    apiFetch<{ updated: number }>('/transactions/bulk-update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  bulkDeletePreview: (data: TransactionBulkMutationRequest) =>
    apiFetch<TransactionBulkMutationPreview>('/transactions/bulk-delete/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  bulkDelete: (data: TransactionBulkMutationRequest) =>
    apiFetch<TransactionBulkMutationResponse>('/transactions/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  bulkRestorePreview: (data: TransactionBulkMutationRequest) =>
    apiFetch<TransactionBulkMutationPreview>('/transactions/bulk-restore/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  bulkRestore: (data: TransactionBulkMutationRequest) =>
    apiFetch<TransactionBulkMutationResponse>('/transactions/bulk-restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  loanAccounts: (params: LoanAccountsParams = {}) => {
    const query = new URLSearchParams()
    if (params.include_hidden) query.set('include_hidden', 'true')
    const suffix = query.toString()
    return apiFetch<LoanAccountsResponse>(`/loan-accounts${suffix ? `?${suffix}` : ''}`)
  },

  updateLoanAccountMetadata: (data: LoanAccountMetadataUpdateRequest) =>
    apiFetch<LoanAccountCandidate>('/loan-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  bulkLoanLink: (data: LoanTransactionLinkBulkRequest) =>
    apiFetch<LoanTransactionLinkBulkResponse>('/transactions/loan-links/bulk', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  loanTransactionMappings: (params: LoanTransactionMappingParams = {}) =>
    apiFetch<LoanTransactionMappingListResponse>(`/loan-transaction-links${buildQuery(params)}`),

  reviewLoanTransactionCandidate: (transactionId: number, data: LoanCandidateReviewPatchRequest) =>
    apiFetch<LoanCandidateReviewResponse>(`/loan-transaction-links/${transactionId}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  installmentPlans: () =>
    apiFetch<InstallmentPlansResponse>('/installment-plans'),

  createInstallmentPlan: (data: InstallmentPlanCreateRequest) =>
    apiFetch<InstallmentPlanResponse>('/installment-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  patchInstallmentPlan: (id: number, data: InstallmentPlanPatchRequest) =>
    apiFetch<InstallmentPlanResponse>(`/installment-plans/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  installmentTransactionMappings: (params: InstallmentTransactionMappingParams = {}) =>
    apiFetch<InstallmentTransactionMappingListResponse>(`/installment-transaction-links${buildQuery(params)}`),

  installmentTransactionSuggestions: (params: InstallmentTransactionSuggestionParams = {}) =>
    apiFetch<InstallmentTransactionSuggestionListResponse>(`/installment-transaction-suggestions${buildQuery(params)}`),

  linkTransactionToInstallment: (id: number, data: InstallmentTransactionLinkRequest) =>
    apiFetch<InstallmentTransactionLinkItem>(`/transactions/${id}/installment-link`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  unlinkTransactionFromInstallment: (id: number) =>
    apiFetch<void>(`/transactions/${id}/installment-link`, {
      method: 'DELETE',
    }),

  bulkLinkTransactionsToInstallment: (data: InstallmentTransactionLinkBulkRequest) =>
    apiFetch<InstallmentTransactionLinkBulkResponse>('/transactions/installment-links/bulk', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  installmentForecast: (params: InstallmentForecastParams = {}) =>
    apiFetch<InstallmentForecastResponse>(`/installments/forecast${buildQuery(params)}`),

  autoClassificationSettings: () =>
    apiFetch<AutoClassificationSettings>('/auto-classification/settings'),

  patchAutoClassificationSettings: (data: AutoClassificationSettingsPatchRequest) =>
    apiFetch<AutoClassificationSettings>('/auto-classification/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  categoryClassificationRules: () =>
    apiFetch<CategoryClassificationRuleListResponse>('/auto-classification/category-rules'),

  upsertCategoryClassificationRule: (data: CategoryClassificationRuleRequest) =>
    apiFetch<CategoryClassificationRuleResponse>('/auto-classification/category-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  applyCategoryClassificationRules: () =>
    apiFetch<AutoClassificationApplyResponse>('/auto-classification/apply/category-rules', {
      method: 'POST',
    }),

  merchantAliasRules: () =>
    apiFetch<MerchantAliasRuleListResponse>('/auto-classification/merchant-alias-rules'),

  upsertMerchantAliasRule: (data: MerchantAliasRuleRequest) =>
    apiFetch<MerchantAliasRuleResponse>('/auto-classification/merchant-alias-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  applyMerchantAliasRules: () =>
    apiFetch<AutoClassificationApplyResponse>('/auto-classification/apply/merchant-alias-rules', {
      method: 'POST',
    }),

  loanMerchantRules: () =>
    apiFetch<LoanMerchantRuleListResponse>('/auto-classification/loan-merchant-rules'),

  upsertLoanMerchantRule: (data: LoanMerchantRuleRequest) =>
    apiFetch<LoanMerchantRuleResponse>('/auto-classification/loan-merchant-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  applyLoanMerchantRules: () =>
    apiFetch<AutoClassificationApplyResponse>('/auto-classification/apply/loan-merchant-rules', {
      method: 'POST',
    }),

  recurringCategoryRules: () =>
    apiFetch<RecurringCategoryRuleListResponse>('/auto-classification/recurring-category-rules'),

  upsertRecurringCategoryRule: (data: RecurringCategoryRuleRequest) =>
    apiFetch<RecurringCategoryRuleResponse>('/auto-classification/recurring-category-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  applyRecurringCategoryRules: () =>
    apiFetch<AutoClassificationApplyResponse>('/auto-classification/apply/recurring-category-rules', {
      method: 'POST',
    }),

  recurringCategoryRulesDryRun: () =>
    apiFetch<RecurringDryRunResponse>('/auto-classification/recurring-category-rules/dry-run'),

  applyRecurringDryRun: (data: RecurringDryRunApplyRequest) =>
    apiFetch<AutoClassificationApplyResponse>('/auto-classification/apply/recurring-dry-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  incomeCategoryTimeline: (params: { start_month?: string; end_month?: string } = {}) =>
    apiFetch<{ items: CategoryTimelineItem[] }>(`/transactions/by-category/timeline${buildQuery({
      ...monthSpanToDateRange(params.start_month, params.end_month),
      type: '수입',
    })}`),

  incomeCategoryBreakdown: (params: { start_month?: string; end_month?: string } = {}) =>
    apiFetch<{ items: CategoryBreakdownItem[] }>(`/transactions/by-category${buildQuery({
      ...monthSpanToDateRange(params.start_month, params.end_month),
      type: '수입',
      level: 'major',
    })}`),

  categoryTimeline: (params: { start_month?: string; end_month?: string } = {}) =>
    apiFetch<{ items: CategoryTimelineItem[] }>(`/transactions/by-category/timeline${buildQuery(
      monthSpanToDateRange(params.start_month, params.end_month),
    )}`),

  categoryBreakdown: (params: CategoryBreakdownParams = {}) =>
    apiFetch<{ items: CategoryBreakdownItem[] }>(`/transactions/by-category${buildQuery({
      ...monthSpanToDateRange(params.start_month, params.end_month),
      type: params.include_income ? 'all' : '지출',
      level: params.level,
    })}`),

  subcategoryBreakdown: async (params: SubcategoryBreakdownParams) => {
    const items = await loadTransactionsForDateRange({
      ...monthSpanToDateRange(params.start_month, params.end_month),
      include_income: params.include_income,
    })
    const grouped = new Map<string, number>()

    for (const item of items) {
      if (item.effective_category_major !== params.category_major) continue
      const category = item.effective_category_minor ?? '미분류'
      grouped.set(category, (grouped.get(category) ?? 0) + item.amount)
    }

    return {
      items: Array.from(grouped.entries())
        .sort(([leftCategory, leftAmount], [rightCategory, rightAmount]) =>
          leftAmount - rightAmount || leftCategory.localeCompare(rightCategory),
        )
        .map(([category, amount]) => ({ category, amount })),
    }
  },

  dailySpend: async (params: { month: string; include_income?: boolean }) => {
    const items = await loadTransactionsForDateRange({
      ...monthToDateRange(params.month),
      include_income: params.include_income,
    })

    const totals = new Map<string, number>()
    for (const item of items) {
      totals.set(item.date, (totals.get(item.date) ?? 0) + item.amount)
    }

    return {
      items: Array.from(totals.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, amount]) => ({ date, amount })),
    }
  },

  merchantTreemap: async (params: {
    start_month?: string
    end_month?: string
    include_income?: boolean
  }) => {
    const items = await loadTransactionsForDateRange({
      ...monthSpanToDateRange(params.start_month, params.end_month),
      include_income: params.include_income,
    })

    const grouped = new Map<string, Map<string, number>>()
    for (const item of items) {
      const category = item.effective_category_major || '기타'
      const merchant = item.merchant || item.description || '기타'
      const merchants = grouped.get(category) ?? new Map<string, number>()
      merchants.set(merchant, (merchants.get(merchant) ?? 0) + item.amount)
      grouped.set(category, merchants)
    }

    const tree: MerchantTreemapNode[] = Array.from(grouped.entries())
      .map(([category, merchants]) => {
        const children = Array.from(merchants.entries())
          .map(([merchant, amount]) => ({
            name: merchant,
            value: Math.abs(amount),
          }))
          .filter((node) => node.value > 0)
          .sort((left, right) => right.value - left.value)

        return {
          name: category,
          value: children.reduce((sum, node) => sum + node.value, 0),
          children,
        }
      })
      .filter((node) => node.value > 0)
      .sort((left, right) => right.value - left.value)

    return { items: tree }
  },
}
