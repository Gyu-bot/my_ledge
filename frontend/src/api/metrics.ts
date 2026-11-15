import { apiFetch } from '../lib/apiClient'
import type {
  ComparisonMonthlyFlowResponse,
  ContributionQuery,
  ContributionResponse,
  MetricDataStatusResponse,
  MonthlyFlowResponse,
  ProjectionAccuracy,
  ReadReviewItemsResponse,
  SpendCubeQuery,
  SpendCubeResponse,
  TransferPurpose,
  TransferPurposeListResponse,
} from '../types/metrics'

function buildQuery(params: object): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    q.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  const query = q.toString()
  return query ? `?${query}` : ''
}

/** 지표 계약(T054–T064) 읽기 — 화면은 백엔드 값을 다시 집계하지 않는다. */
export const metricsApi = {
  dataStatus: () => apiFetch<MetricDataStatusResponse>('/metrics/data-status'),

  monthlyFlow: (params: { start_period?: string; end_period?: string } = {}) =>
    apiFetch<MonthlyFlowResponse>(`/metrics/monthly-flow${buildQuery(params)}`),

  spendCube: (params: SpendCubeQuery) =>
    apiFetch<SpendCubeResponse>(`/metrics/spend-cube${buildQuery(params)}`),

  comparisonMonthlyFlow: (period?: string) =>
    apiFetch<ComparisonMonthlyFlowResponse>(`/metrics/comparison/monthly-flow${buildQuery({ period })}`),

  contributions: (params: ContributionQuery) =>
    apiFetch<ContributionResponse>(`/metrics/comparison/contributions${buildQuery(params)}`),

  reviewItems: (params: { period?: string; limit?: number } = {}) =>
    apiFetch<ReadReviewItemsResponse>(`/read/review-items${buildQuery(params)}`),

  projectionAccuracy: () =>
    apiFetch<ProjectionAccuracy>('/canonical-views/month-projection/accuracy'),

  transferTransactions: (params: { start_date?: string; end_date?: string; purpose?: TransferPurpose; limit?: number }) =>
    apiFetch<TransferPurposeListResponse>(`/transfer-purposes/transactions${buildQuery(params)}`),
}
