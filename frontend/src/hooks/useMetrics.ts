import { useQuery } from '@tanstack/react-query'
import { metricsApi } from '../api/metrics'
import type { BaselineMethod, ContributionQuery, SpendCubeQuery, TransferPurpose } from '../types/metrics'

export function useDataStatus() {
  return useQuery({
    queryKey: ['metrics', 'data-status'],
    queryFn: () => metricsApi.dataStatus(),
  })
}

/** 월 흐름표 전체 달 — 자료 없는 달은 응답에 없다(0원과 구분). */
export function useMonthlyFlow(params: { start_period?: string; end_period?: string } = {}) {
  return useQuery({
    queryKey: ['metrics', 'monthly-flow', params],
    queryFn: () => metricsApi.monthlyFlow(params),
  })
}

export function useSpendCube(params: SpendCubeQuery | null) {
  return useQuery({
    queryKey: ['metrics', 'spend-cube', params],
    queryFn: () => metricsApi.spendCube(params as SpendCubeQuery),
    enabled: params !== null,
  })
}

export function useMonthlyFlowComparison(period: string | null, baseline?: BaselineMethod) {
  return useQuery({
    queryKey: ['metrics', 'comparison', 'monthly-flow', period, baseline],
    queryFn: () => metricsApi.comparisonMonthlyFlow(period ?? undefined, baseline),
    enabled: period !== null,
  })
}

export function useContributions(params: ContributionQuery | null) {
  return useQuery({
    queryKey: ['metrics', 'comparison', 'contributions', params],
    queryFn: () => metricsApi.contributions(params as ContributionQuery),
    enabled: params !== null,
  })
}

export function useReviewItems(period: string | null) {
  return useQuery({
    queryKey: ['read', 'review-items', period],
    queryFn: () => metricsApi.reviewItems({ period: period ?? undefined, limit: 100 }),
    enabled: period !== null,
  })
}

/** 지난 마감월 되짚기 오차 — 전망을 여러 번 다시 돌리므로 느릴 수 있어 오래 캐시한다. */
export function useProjectionAccuracy(enabled = true) {
  return useQuery({
    queryKey: ['canonical-views', 'month-projection', 'accuracy'],
    queryFn: () => metricsApi.projectionAccuracy(),
    enabled,
    staleTime: 1000 * 60 * 10,
  })
}

export function useCommitments(period: string | null) {
  return useQuery({
    queryKey: ['read', 'commitments', period],
    queryFn: () => metricsApi.commitments(period ?? undefined),
  })
}

export function useReadDataStatus() {
  return useQuery({
    queryKey: ['read', 'data-status'],
    queryFn: () => metricsApi.readDataStatus(),
  })
}

export function useTransferTransactions(
  params: { start_date: string; end_date: string; purpose?: TransferPurpose } | null,
) {
  return useQuery({
    queryKey: ['transfer-purposes', 'transactions', params],
    queryFn: () => metricsApi.transferTransactions({ ...(params as { start_date: string; end_date: string }), limit: 2000 }),
    enabled: params !== null,
  })
}

/** 이체 목적 정하기 화면 — 기간은 비워 둘 수 있다. 금액(절댓값) 큰 순. */
export function useTransferPurposeList(params: { start_date?: string; end_date?: string; purpose?: TransferPurpose; limit?: number }) {
  return useQuery({
    queryKey: ['transfer-purposes', 'transactions', 'list', params],
    queryFn: () => metricsApi.transferTransactions(params),
  })
}


export function useMonthProjection(params: { reference_date?: string } = {}) {
  return useQuery({
    queryKey: ['read', 'month-projection', params],
    queryFn: () => metricsApi.monthProjection(params),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  })
}
