import { apiFetch } from '../lib/apiClient'
import type { SpendingLimitHistory, SpendingLimitInput, SpendingLimitRevision, SpendingReference } from '../types/spendingLimits'

export const spendingLimitsApi = {
  reference: (period: string) => apiFetch<SpendingReference>(`/read/spending-reference?${new URLSearchParams({ period })}`),
  history: () => apiFetch<SpendingLimitHistory>('/spending-limits'),
  create: (payload: SpendingLimitInput) => apiFetch<SpendingLimitRevision>('/spending-limits', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }),
}
