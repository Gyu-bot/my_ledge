import { apiFetch } from '../lib/apiClient'
import type {
  ComparisonMonthlyFlowResponse,
  BaselineMethod,
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
import type { ReadCommitmentsResponse, ReadDataStatusResponse, ReadMonthProjectionResponse } from '../types/readSurface'

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

  comparisonMonthlyFlow: (period?: string, baseline?: BaselineMethod) =>
    apiFetch<ComparisonMonthlyFlowResponse>(`/metrics/comparison/monthly-flow${buildQuery({ period, baseline })}`),

  contributions: (params: ContributionQuery) =>
    apiFetch<ContributionResponse>(`/metrics/comparison/contributions${buildQuery(params)}`),

  reviewItems: (params: { period?: string; limit?: number } = {}) =>
    apiFetch<ReadReviewItemsResponse>(`/read/review-items${buildQuery(params)}`),

  monthProjection: (params: { reference_date?: string } = {}) =>
    apiFetch<ReadMonthProjectionResponse>(`/read/month-projection${buildQuery(params)}`),

  projectionAccuracy: () =>
    apiFetch<ProjectionAccuracy>('/canonical-views/month-projection/accuracy'),

  transferTransactions: (params: { start_date?: string; end_date?: string; purpose?: TransferPurpose; limit?: number }) =>
    apiFetch<TransferPurposeListResponse>(`/transfer-purposes/transactions${buildQuery(params)}`),

  /** 약정 목록 (T060 read surface, Q4) — 기록된 속성과 한 달의 관측 여부. 전망이 아니다. */
  commitments: (period?: string) =>
    apiFetch<ReadCommitmentsResponse>(`/read/commitments${buildQuery({ period })}`),

  /** 자료 현황 (T060 read surface, Q6) — 가져온 범위, 기준일, 공백, 분류 상태. */
  readDataStatus: () => apiFetch<ReadDataStatusResponse>('/read/data-status'),
}
