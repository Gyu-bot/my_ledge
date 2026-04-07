import { apiFetch } from '../lib/apiClient'
import type {
  TransactionListResponse,
  TransactionListParams,
  TransactionFilterOptionsResponse,
  TransactionUpdateRequest,
  TransactionBulkUpdateRequest,
  CategoryTimelineItem,
  CategoryBreakdownItem,
} from '../types/transaction'

function buildQuery(params: object): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const transactionApi = {
  list: (params: TransactionListParams = {}) =>
    apiFetch<TransactionListResponse>(`/transactions${buildQuery(params)}`),

  filterOptions: () =>
    apiFetch<TransactionFilterOptionsResponse>('/transactions/filter-options'),

  update: (id: number, data: TransactionUpdateRequest) =>
    apiFetch<void>(`/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    apiFetch<void>(`/transactions/${id}`, { method: 'DELETE' }),

  restore: (id: number) =>
    apiFetch<void>(`/transactions/${id}/restore`, { method: 'POST' }),

  bulkUpdate: (data: TransactionBulkUpdateRequest) =>
    apiFetch<{ updated: number }>('/transactions/bulk-update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  categoryTimeline: (params: { start_month?: string; end_month?: string } = {}) =>
    apiFetch<{ items: CategoryTimelineItem[] }>(`/transactions/category-timeline${buildQuery(params)}`),

  categoryBreakdown: (params: { start_month?: string; end_month?: string; include_income?: boolean } = {}) =>
    apiFetch<{ items: CategoryBreakdownItem[] }>(`/transactions/by-category${buildQuery(params)}`),

  dailySpend: (params: { month: string; include_income?: boolean }) =>
    apiFetch<{ items: Array<{ date: string; amount: number }> }>(`/transactions/daily-spend${buildQuery(params)}`),
}
