import { useQuery } from '@tanstack/react-query'
import { canonicalViewsApi } from '../api/canonicalViews'

export function useCanonicalViewsDashboard() {
  return useQuery({
    queryKey: ['canonical-views', 'dashboard'],
    queryFn: () => canonicalViewsApi.dashboard({ months: 12, merchant_limit: 10, queue_limit: 10 }),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })
}
