import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sourcePolicyApi } from '../api/sourcePolicy'

export const sourcePolicyKeys = {
  policy: ['assets', 'source-policy'] as const,
  selected: (asOfDate?: string) => ['assets', 'selected-investments', asOfDate ?? 'latest'] as const,
}

export function useSourcePolicy() {
  return useQuery({ queryKey: sourcePolicyKeys.policy, queryFn: sourcePolicyApi.get })
}

export function useSelectedInvestments(asOfDate?: string) {
  return useQuery({ queryKey: sourcePolicyKeys.selected(asOfDate), queryFn: () => sourcePolicyApi.selected(asOfDate) })
}

export function usePreviewSourcePolicy() {
  return useMutation({ mutationFn: sourcePolicyApi.preview })
}

export function useApplySourcePolicy() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: sourcePolicyApi.apply,
    onSuccess: (policy) => {
      client.setQueryData(sourcePolicyKeys.policy, policy)
      for (const key of ['assets', 'analytics', 'canonical-views']) {
        void client.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}
