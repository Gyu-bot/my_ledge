import { apiFetch } from '../lib/apiClient'
import type {
  AdjustabilityValue,
  CategoryAdjustabilityDefault,
  CategoryAdjustabilityDefaultRequest,
  RecurringCommitment,
  RecurringCommitmentCreateRequest,
  RecurringCommitmentUpdateRequest,
  TransactionNature,
  TransferPurposeDetail,
  TransferPurposeValue,
} from '../types/nature'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** 두 축(T056)과 이체 목적(T061) — 값은 사람이 고른 것만 쓴다. 모든 경로에 API 키가 필요하다. */
export const natureApi = {
  categoryDefaults: () => apiFetch<{ items: CategoryAdjustabilityDefault[] }>('/nature/category-defaults'),

  setCategoryDefault: (data: CategoryAdjustabilityDefaultRequest) =>
    apiFetch<CategoryAdjustabilityDefault>('/nature/category-defaults', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(data),
    }),

  deleteCategoryDefault: (id: number) => apiFetch<void>(`/nature/category-defaults/${id}`, { method: 'DELETE' }),

  commitments: () => apiFetch<{ items: RecurringCommitment[] }>('/nature/recurring-commitments'),

  createCommitment: (data: RecurringCommitmentCreateRequest) =>
    apiFetch<RecurringCommitment>('/nature/recurring-commitments', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(data),
    }),

  updateCommitment: (id: number, data: RecurringCommitmentUpdateRequest) =>
    apiFetch<RecurringCommitment>(`/nature/recurring-commitments/${id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(data),
    }),

  endCommitment: (id: number, endDate: string) =>
    apiFetch<RecurringCommitment>(`/nature/recurring-commitments/${id}/end`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ end_date: endDate }),
    }),

  deleteCommitment: (id: number) => apiFetch<void>(`/nature/recurring-commitments/${id}`, { method: 'DELETE' }),

  transaction: (id: number) => apiFetch<TransactionNature>(`/nature/transactions/${id}`),

  setTransactionAdjustability: (id: number, adjustability: AdjustabilityValue) =>
    apiFetch<TransactionNature>(`/nature/transactions/${id}/adjustability`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ adjustability }),
    }),

  clearTransactionAdjustability: (id: number) =>
    apiFetch<TransactionNature>(`/nature/transactions/${id}/adjustability`, { method: 'DELETE' }),

  transferPurpose: (id: number) => apiFetch<TransferPurposeDetail>(`/transfer-purposes/transactions/${id}`),

  setTransferPurpose: (id: number, purpose: TransferPurposeValue) =>
    apiFetch<TransferPurposeDetail>(`/transfer-purposes/transactions/${id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ purpose }),
    }),

  clearTransferPurpose: (id: number) =>
    apiFetch<TransferPurposeDetail>(`/transfer-purposes/transactions/${id}`, { method: 'DELETE' }),
}
