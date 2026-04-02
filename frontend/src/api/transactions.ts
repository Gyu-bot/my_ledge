import { apiRequest, getApiKeyHeaders, type QueryParams } from './client';
import type {
  CategorySummaryResponse,
  CategoryTimelineResponse,
  TransactionBulkUpdateRequest,
  TransactionBulkUpdateResponse,
  PaymentMethodSummaryResponse,
  TransactionCreateRequest,
  TransactionFilterOptionsResponse,
  TransactionListResponse,
  TransactionResponse,
  TransactionSummaryResponse,
  TransactionUpdateRequest,
} from '../types/transactions';

export function getTransactions(query?: QueryParams) {
  return apiRequest<TransactionListResponse>('/transactions', { query });
}

export function getTransactionFilterOptions(query?: QueryParams) {
  return apiRequest<TransactionFilterOptionsResponse>('/transactions/filter-options', { query });
}

export function getTransactionSummary(query?: QueryParams) {
  return apiRequest<TransactionSummaryResponse>('/transactions/summary', { query });
}

export function getTransactionsByCategory(query?: QueryParams) {
  return apiRequest<CategorySummaryResponse>('/transactions/by-category', { query });
}

export function getTransactionsByCategoryTimeline(query?: QueryParams) {
  return apiRequest<CategoryTimelineResponse>('/transactions/by-category/timeline', { query });
}

export function getTransactionPaymentMethods(query?: QueryParams) {
  return apiRequest<PaymentMethodSummaryResponse>('/transactions/payment-methods', { query });
}

export function createTransaction(body: TransactionCreateRequest) {
  return apiRequest<TransactionResponse>('/transactions', {
    method: 'POST',
    body,
    headers: getApiKeyHeaders(),
  });
}

export function updateTransaction(transactionId: number, body: TransactionUpdateRequest) {
  return apiRequest<TransactionResponse>(`/transactions/${transactionId}`, {
    method: 'PATCH',
    body,
    headers: getApiKeyHeaders(),
  });
}

export function bulkUpdateTransactions(body: TransactionBulkUpdateRequest) {
  return apiRequest<TransactionBulkUpdateResponse>('/transactions/bulk-update', {
    method: 'PATCH',
    body,
    headers: getApiKeyHeaders(),
  });
}

export function deleteTransaction(transactionId: number) {
  return apiRequest<void>(`/transactions/${transactionId}`, {
    method: 'DELETE',
    headers: getApiKeyHeaders(),
  });
}

export function restoreTransaction(transactionId: number) {
  return apiRequest<TransactionResponse>(`/transactions/${transactionId}/restore`, {
    method: 'POST',
    headers: getApiKeyHeaders(),
  });
}
