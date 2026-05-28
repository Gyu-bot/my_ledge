import { apiFetch } from '../lib/apiClient'
import type { CanonicalViewsDashboardResponse } from '../types/canonicalViews'

function buildQuery(params: object): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') q.set(key, String(value))
  }
  const query = q.toString()
  return query ? `?${query}` : ''
}

export const canonicalViewsApi = {
  dashboard: (params: { months?: number; merchant_limit?: number; queue_limit?: number } = {}) =>
    apiFetch<CanonicalViewsDashboardResponse>(`/canonical-views/dashboard${buildQuery(params)}`),
}
