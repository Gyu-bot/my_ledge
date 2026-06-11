import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics'
import type {
  CategoryMoMQuery, SpendingAnomaliesQuery, IncomeStabilityQuery,
  DiscretionaryVelocityQuery, PurchaseGateCandidatesQuery,
  PurchaseGateReviewPatchRequest,
} from '../types/analytics'

export function useMonthlyCashflow(months = 6) {
  return useQuery({
    queryKey: ['analytics', 'cashflow', months],
    queryFn: () => analyticsApi.monthlyCashflow({ months }),
  })
}

export function useCategoryMoM(params: CategoryMoMQuery = { months: 2 }) {
  return useQuery({
    queryKey: ['analytics', 'categoryMoM', params],
    queryFn: () => analyticsApi.categoryMoM(params),
  })
}

export function useFixedCostSummary(params: { start_month?: string; end_month?: string } = {}) {
  return useQuery({
    queryKey: ['analytics', 'fixedCost', params],
    queryFn: () => analyticsApi.fixedCostSummary(params),
  })
}

export function useFixedCostTrend(params: { start_month?: string; end_month?: string } = {}) {
  return useQuery({
    queryKey: ['analytics', 'fixedCostTrend', params],
    queryFn: () => analyticsApi.fixedCostTrend(params),
  })
}

export function useMerchantSpend(
  params: { start_month?: string; end_month?: string; months?: number; limit?: number } = {},
) {
  return useQuery({
    queryKey: ['analytics', 'merchantSpend', params],
    queryFn: () => analyticsApi.merchantSpend(params),
  })
}

export function useIncomeStability(params: IncomeStabilityQuery = {}) {
  return useQuery({
    queryKey: ['analytics', 'incomeStability', params],
    queryFn: () => analyticsApi.incomeStability(params),
  })
}

export function useRecurringPayments(page = 1, perPage = 10) {
  return useQuery({
    queryKey: ['analytics', 'recurringPayments', page, perPage],
    queryFn: () => analyticsApi.recurringPayments({ page, per_page: perPage }),
  })
}

export function useSpendingAnomalies(params: SpendingAnomaliesQuery = {}) {
  return useQuery({
    queryKey: ['analytics', 'spendingAnomalies', params],
    queryFn: () => analyticsApi.spendingAnomalies(params),
  })
}

export function useDiscretionaryVelocity(params: DiscretionaryVelocityQuery = {}) {
  return useQuery({
    queryKey: ['analytics', 'discretionaryVelocity', params],
    queryFn: () => analyticsApi.discretionaryVelocity(params),
  })
}

export function usePurchaseGateCandidates(params: PurchaseGateCandidatesQuery = { status: 'pending', limit: 5 }) {
  return useQuery({
    queryKey: ['analytics', 'purchaseGateCandidates', params],
    queryFn: () => analyticsApi.purchaseGateCandidates(params),
  })
}

export function useReviewPurchaseGateCandidate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ candidateKey, data }: { candidateKey: string; data: PurchaseGateReviewPatchRequest }) =>
      analyticsApi.reviewPurchaseGateCandidate(candidateKey, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['analytics', 'purchaseGateCandidates'] })
    },
  })
}
