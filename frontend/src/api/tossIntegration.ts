import { apiFetch } from '../lib/apiClient'
import type { TossIntegrationStatus, TossSyncRequest, TossSyncResult } from '../types/tossIntegration'

export const tossIntegrationApi = {
  status: () => apiFetch<TossIntegrationStatus>('/integrations/toss/status'),
  sync: (request: TossSyncRequest) => apiFetch<TossSyncResult>('/integrations/toss/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  }),
}
