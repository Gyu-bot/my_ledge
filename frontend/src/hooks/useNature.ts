import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { natureApi } from '../api/nature'
import type {
  AdjustabilityValue,
  CategoryAdjustabilityDefaultRequest,
  RecurringCommitmentCreateRequest,
  RecurringCommitmentMergeRequest,
  RecurringCommitmentUpdateRequest,
  TransferPurposeRuleCreateRequest,
  TransferPurposeRuleUpdateRequest,
  TransferPurposeValue,
} from '../types/nature'

/** 분류가 바뀌면 흐름표·큐브·약정·자료 현황·거래 목록이 모두 다시 읽어야 한다. */
export function invalidateClassificationDependents(queryClient: QueryClient) {
  return Promise.all(
    ['nature', 'metrics', 'read', 'transactions', 'canonical-views', 'analytics', 'transfer-purposes'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  )
}

export function useCategoryDefaults() {
  return useQuery({ queryKey: ['nature', 'category-defaults'], queryFn: () => natureApi.categoryDefaults() })
}

export function useSetCategoryDefault() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CategoryAdjustabilityDefaultRequest) => natureApi.setCategoryDefault(data),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useDeleteCategoryDefault() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => natureApi.deleteCategoryDefault(id),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useRecurringCommitments() {
  return useQuery({ queryKey: ['nature', 'recurring-commitments'], queryFn: () => natureApi.commitments() })
}

export function useCreateRecurringCommitment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: RecurringCommitmentCreateRequest) => natureApi.createCommitment(data),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useUpdateRecurringCommitment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RecurringCommitmentUpdateRequest }) => natureApi.updateCommitment(id, data),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useEndRecurringCommitment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, endDate }: { id: number; endDate: string }) => natureApi.endCommitment(id, endDate),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useDeleteRecurringCommitment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => natureApi.deleteCommitment(id),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useTransactionNature(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['nature', 'transaction', id],
    queryFn: () => natureApi.transaction(id as number),
    enabled: id !== null && enabled,
  })
}

export function useTransferPurposeDetail(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['transfer-purposes', 'detail', id],
    queryFn: () => natureApi.transferPurpose(id as number),
    enabled: id !== null && enabled,
  })
}

export function useSetTransactionAdjustability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: AdjustabilityValue | null }) =>
      value === null ? natureApi.clearTransactionAdjustability(id) : natureApi.setTransactionAdjustability(id, value),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useSetTransferPurpose() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: TransferPurposeValue | null }) =>
      value === null ? natureApi.clearTransferPurpose(id) : natureApi.setTransferPurpose(id, value),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useTransferPurposeRules() {
  return useQuery({ queryKey: ['transfer-purposes', 'rules'], queryFn: () => natureApi.transferRules() })
}

export function useCreateTransferPurposeRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TransferPurposeRuleCreateRequest) => natureApi.createTransferRule(data),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useUpdateTransferPurposeRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TransferPurposeRuleUpdateRequest }) => natureApi.updateTransferRule(id, data),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export function useDeleteTransferPurposeRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => natureApi.deleteTransferRule(id),
    onSuccess: () => invalidateClassificationDependents(qc),
  })
}

export interface BulkProgress {
  done: number
  total: number
}

export interface BulkResult {
  applied: number[]
  failed: number[]
}

/**
 * 고른 거래들에 거래 단위 조정 가능성을 하나씩 쓴다 (한꺼번에 쓰는 API가 없다).
 * value=null이면 거래 단위 값을 지워 약정·카테고리 기본값이 다시 적용되게 한다.
 * 실패한 거래는 따로 돌려주고, 이미 쓴 거래는 되돌리지 않는다.
 */
export function useBulkTransactionAdjustability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      ids,
      value,
      onProgress,
      concurrency = 6,
    }: {
      ids: number[]
      value: AdjustabilityValue | null
      onProgress?: (progress: BulkProgress) => void
      concurrency?: number
    }): Promise<BulkResult> => {
      const applied: number[] = []
      const failed: number[] = []
      let cursor = 0
      let done = 0
      async function worker() {
        while (cursor < ids.length) {
          const id = ids[cursor]
          cursor += 1
          try {
            if (value === null) await natureApi.clearTransactionAdjustability(id)
            else await natureApi.setTransactionAdjustability(id, value)
            applied.push(id)
          } catch {
            failed.push(id)
          }
          done += 1
          onProgress?.({ done, total: ids.length })
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()))
      return { applied, failed }
    },
    onSettled: () => invalidateClassificationDependents(qc),
  })
}

export function useMergeRecurringCommitments() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (data: RecurringCommitmentMergeRequest) => natureApi.mergeCommitments(data), onSuccess: () => invalidateClassificationDependents(qc) })
}

export function useBulkDeleteRecurringCommitments() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (ids: number[]) => natureApi.bulkDeleteCommitments(ids), onSuccess: () => invalidateClassificationDependents(qc) })
}
