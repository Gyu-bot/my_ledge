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

export interface CanonicalDashboardParams {
  months?: number
  merchant_limit?: number
  queue_limit?: number
  queue_page?: number
  issue_types?: string
  period_from?: string
  period_to?: string
  current_only?: boolean
  reference_date?: string
  search?: string
}

export const canonicalViewsApi = {
  dashboard: (params: CanonicalDashboardParams = {}) =>
    apiFetch<CanonicalViewsDashboardResponse>(`/canonical-views/dashboard${buildQuery(params)}`),
}
