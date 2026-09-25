import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tossIntegrationApi } from '../api/tossIntegration'

export const tossIntegrationKey = ['integrations', 'toss', 'status'] as const

export function useTossIntegrationStatus() {
  return useQuery({
    queryKey: tossIntegrationKey,
    queryFn: tossIntegrationApi.status,
    refetchInterval: (query) => (query.state.data?.cooldown_seconds ?? 0) > 0 ? 1000 : false,
  })
}

export function useSyncTossIntegration() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: tossIntegrationApi.sync,
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: tossIntegrationKey }),
        client.invalidateQueries({ queryKey: ['assets'] }),
      ])
    },
  })
}
