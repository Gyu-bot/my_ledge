import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionApi } from '../api/transactions'
import type {
  TransactionListParams,
  TransactionUpdateRequest,
  TransactionBulkUpdateRequest,
  TransactionBulkMutationRequest,
  LoanAccountMetadataUpdateRequest,
  LoanTransactionLinkBulkRequest,
  LoanTransactionMappingParams,
  CategoryBreakdownParams,
  SubcategoryBreakdownParams,
  MerchantTreemapNode,
  AutoClassificationSettingsPatchRequest,
  CategoryClassificationRuleRequest,
  MerchantAliasRuleRequest,
  LoanMerchantRuleRequest,
  RecurringCategoryRuleRequest,
  RecurringDryRunApplyRequest,
} from '../types/transaction'

export const txKeys = {
  list: (params: TransactionListParams) => ['transactions', 'list', params] as const,
  filterOptions: () => ['transactions', 'filterOptions'] as const,
  loanAccounts: () => ['transactions', 'loanAccounts'] as const,
  loanTransactionMappings: (params: LoanTransactionMappingParams) =>
    ['transactions', 'loanTransactionMappings', params] as const,
  autoClassificationSettings: () => ['transactions', 'autoClassificationSettings'] as const,
  categoryClassificationRules: () => ['transactions', 'categoryClassificationRules'] as const,
  merchantAliasRules: () => ['transactions', 'merchantAliasRules'] as const,
  loanMerchantRules: () => ['transactions', 'loanMerchantRules'] as const,
  recurringCategoryRules: () => ['transactions', 'recurringCategoryRules'] as const,
  recurringCategoryRulesDryRun: () => ['transactions', 'recurringCategoryRulesDryRun'] as const,
  categoryTimeline: (params: { start_month?: string; end_month?: string }) => ['transactions', 'categoryTimeline', params] as const,
  categoryBreakdown: (params: CategoryBreakdownParams) => ['transactions', 'categoryBreakdown', params] as const,
  subcategoryBreakdown: (params: SubcategoryBreakdownParams | null) => ['transactions', 'subcategoryBreakdown', params] as const,
  dailySpend: (params: { month?: string; include_income?: boolean }) => ['transactions', 'dailySpend', params] as const,
  merchantTreemap: (params: { start_month?: string; end_month?: string; include_income?: boolean } | null) =>
    ['transactions', 'merchantTreemap', params] as const,
}

export function useTransactionList(params: TransactionListParams = {}) {
  return useQuery({
    queryKey: txKeys.list(params),
    queryFn: () => transactionApi.list(params),
  })
}

export function useTransactionFilterOptions() {
  return useQuery({
    queryKey: txKeys.filterOptions(),
    queryFn: transactionApi.filterOptions,
    staleTime: Infinity,
  })
}

export function useLoanAccounts() {
  return useQuery({
    queryKey: txKeys.loanAccounts(),
    queryFn: transactionApi.loanAccounts,
  })
}

export function useLoanTransactionMappings(params: LoanTransactionMappingParams = {}) {
  return useQuery({
    queryKey: txKeys.loanTransactionMappings(params),
    queryFn: () => transactionApi.loanTransactionMappings(params),
  })
}

export function useAutoClassificationSettings() {
  return useQuery({
    queryKey: txKeys.autoClassificationSettings(),
    queryFn: transactionApi.autoClassificationSettings,
  })
}

export function useCategoryClassificationRules() {
  return useQuery({
    queryKey: txKeys.categoryClassificationRules(),
    queryFn: transactionApi.categoryClassificationRules,
  })
}

export function useLoanMerchantRules() {
  return useQuery({
    queryKey: txKeys.loanMerchantRules(),
    queryFn: transactionApi.loanMerchantRules,
  })
}

export function useMerchantAliasRules() {
  return useQuery({
    queryKey: txKeys.merchantAliasRules(),
    queryFn: transactionApi.merchantAliasRules,
  })
}

export function useRecurringCategoryRules() {
  return useQuery({
    queryKey: txKeys.recurringCategoryRules(),
    queryFn: transactionApi.recurringCategoryRules,
  })
}

export function useRecurringCategoryRulesDryRun() {
  return useQuery({
    queryKey: txKeys.recurringCategoryRulesDryRun(),
    queryFn: transactionApi.recurringCategoryRulesDryRun,
  })
}

export function useCategoryTimeline(params: { start_month?: string; end_month?: string } = {}) {
  return useQuery({
    queryKey: txKeys.categoryTimeline(params),
    queryFn: () => transactionApi.categoryTimeline(params),
  })
}

export function useCategoryBreakdown(params: CategoryBreakdownParams = {}) {
  return useQuery({
    queryKey: txKeys.categoryBreakdown(params),
    queryFn: () => transactionApi.categoryBreakdown(params),
  })
}

export function useSubcategoryBreakdown(params: SubcategoryBreakdownParams | null) {
  return useQuery({
    queryKey: txKeys.subcategoryBreakdown(params),
    queryFn: () => transactionApi.subcategoryBreakdown(params!),
    enabled: !!params,
  })
}

export function useDailySpend(params: { month: string; include_income?: boolean } | null) {
  return useQuery({
    queryKey: txKeys.dailySpend(params ?? {}),
    queryFn: () => transactionApi.dailySpend(params!),
    enabled: !!params,
    retry: false,
  })
}

export function useMerchantTreemap(
  params: { start_month?: string; end_month?: string; include_income?: boolean } | null,
) {
  return useQuery<{ items: MerchantTreemapNode[] }>({
    queryKey: txKeys.merchantTreemap(params),
    queryFn: () => transactionApi.merchantTreemap(params!),
    enabled: !!params,
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TransactionUpdateRequest }) =>
      transactionApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => transactionApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useRestoreTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => transactionApi.restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useBulkUpdateTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TransactionBulkUpdateRequest) => transactionApi.bulkUpdate(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}

export function useBulkDeletePreview() {
  return useMutation({
    mutationFn: (data: TransactionBulkMutationRequest) =>
      transactionApi.bulkDeletePreview(data),
  })
}

export function useBulkDeleteTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TransactionBulkMutationRequest) => transactionApi.bulkDelete(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}

export function useBulkRestorePreview() {
  return useMutation({
    mutationFn: (data: TransactionBulkMutationRequest) =>
      transactionApi.bulkRestorePreview(data),
  })
}

export function useBulkRestoreTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TransactionBulkMutationRequest) => transactionApi.bulkRestore(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}

export function useBulkLinkTransactionsToLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LoanTransactionLinkBulkRequest) => transactionApi.bulkLoanLink(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useUpdateLoanAccountMetadata() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LoanAccountMetadataUpdateRequest) =>
      transactionApi.updateLoanAccountMetadata(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: txKeys.loanAccounts() })
      void qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function usePatchAutoClassificationSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AutoClassificationSettingsPatchRequest) =>
      transactionApi.patchAutoClassificationSettings(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: txKeys.autoClassificationSettings() }),
  })
}

export function useUpsertCategoryClassificationRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CategoryClassificationRuleRequest) =>
      transactionApi.upsertCategoryClassificationRule(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: txKeys.categoryClassificationRules() }),
  })
}

export function useApplyCategoryClassificationRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => transactionApi.applyCategoryClassificationRules(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}

export function useUpsertMerchantAliasRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MerchantAliasRuleRequest) =>
      transactionApi.upsertMerchantAliasRule(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: txKeys.merchantAliasRules() }),
  })
}

export function useApplyMerchantAliasRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => transactionApi.applyMerchantAliasRules(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['canonicalViews'] })
    },
  })
}

export function useUpsertLoanMerchantRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LoanMerchantRuleRequest) =>
      transactionApi.upsertLoanMerchantRule(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: txKeys.loanMerchantRules() }),
  })
}

export function useApplyLoanMerchantRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => transactionApi.applyLoanMerchantRules(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useUpsertRecurringCategoryRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: RecurringCategoryRuleRequest) =>
      transactionApi.upsertRecurringCategoryRule(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: txKeys.recurringCategoryRules() }),
  })
}

export function useApplyRecurringCategoryRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => transactionApi.applyRecurringCategoryRules(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}

export function useApplyRecurringDryRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: RecurringDryRunApplyRequest) => transactionApi.applyRecurringDryRun(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: ['analytics'] })
      void qc.invalidateQueries({ queryKey: txKeys.recurringCategoryRulesDryRun() })
    },
  })
}
