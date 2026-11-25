import { apiFetch } from '../lib/apiClient'
import type { OneOffEvent, OneOffEventDetail, OneOffEventInput } from '../types/oneOffEvents'

const path = '/one-off-events'

function json(method: 'POST' | 'PATCH' | 'DELETE', body: object): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export const oneOffEventsApi = {
  list: () => apiFetch<OneOffEvent[]>(path),
  detail: (eventId: number) => apiFetch<OneOffEventDetail>(`${path}/${eventId}`),
  create: (input: OneOffEventInput & { transaction_ids?: number[] }) =>
    apiFetch<OneOffEventDetail>(path, json('POST', input)),
  update: (eventId: number, input: Partial<OneOffEventInput>) =>
    apiFetch<OneOffEventDetail>(`${path}/${eventId}`, json('PATCH', input)),
  delete: (eventId: number) => apiFetch<void>(`${path}/${eventId}`, { method: 'DELETE' }),
  editMembers: (eventId: number, method: 'POST' | 'DELETE', transactionIds: number[]) =>
    apiFetch<OneOffEventDetail>(`${path}/${eventId}/members`, json(method, { transaction_ids: transactionIds })),
}
