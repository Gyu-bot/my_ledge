import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionApi } from '../api/transactions'
import type { TransactionListParams, TransactionUpdateRequest, TransactionBulkUpdateRequest } from '../types/transaction'

export const txKeys = {
  list: (params: TransactionListParams) => ['transactions', 'list', params] as const,
  filterOptions: () => ['transactions', 'filterOptions'] as const,
  categoryTimeline: (params: object) => ['transactions', 'categoryTimeline', params] as const,
  categoryBreakdown: (params: object) => ['transactions', 'categoryBreakdown', params] as const,
  dailySpend: (params: object) => ['transactions', 'dailySpend', params] as const,
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

export function useCategoryTimeline(params: { start_month?: string; end_month?: string } = {}) {
  return useQuery({
    queryKey: txKeys.categoryTimeline(params),
    queryFn: () => transactionApi.categoryTimeline(params),
  })
}

export function useCategoryBreakdown(params: { start_month?: string; end_month?: string; include_income?: boolean } = {}) {
  return useQuery({
    queryKey: txKeys.categoryBreakdown(params),
    queryFn: () => transactionApi.categoryBreakdown(params),
  })
}

export function useDailySpend(params: { month: string; include_income?: boolean } | null) {
  return useQuery({
    queryKey: txKeys.dailySpend(params ?? {}),
    queryFn: () => transactionApi.dailySpend(params!),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}
