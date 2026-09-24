import { useQuery } from '@tanstack/react-query'
import { canonicalViewsApi, type CanonicalDashboardParams } from '../api/canonicalViews'

export function useCanonicalViewsDashboard(params: CanonicalDashboardParams = {}) {
  const request = { months: 12, merchant_limit: 10, queue_limit: 10, ...params }
  return useQuery({
    queryKey: ['canonical-views', 'dashboard', request],
    queryFn: () => canonicalViewsApi.dashboard(request),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })
}
