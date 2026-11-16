import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { spendingLimitsApi } from '../api/spendingLimits'

export function useSpendingReference(period: string) {
  return useQuery({ queryKey: ['spending-reference', period], queryFn: () => spendingLimitsApi.reference(period) })
}
export function useSpendingLimitHistory() {
  return useQuery({ queryKey: ['spending-limits'], queryFn: () => spendingLimitsApi.history() })
}
export function useCreateSpendingLimit() {
  const client = useQueryClient()
  return useMutation({ mutationFn: spendingLimitsApi.create, onSuccess: async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['spending-limits'] }),
      client.invalidateQueries({ queryKey: ['spending-reference'] }),
    ])
  } })
}
