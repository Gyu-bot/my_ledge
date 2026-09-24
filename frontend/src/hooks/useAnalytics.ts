import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics'
import type {
  AnalyticsDateRange, MerchantSpendQuery, MonthlyCashflowQuery, RecurringPaymentsQuery,
  CategoryMoMQuery, SpendingAnomaliesQuery, IncomeStabilityQuery,
  DiscretionaryVelocityQuery, PurchaseGateCandidatesQuery,
  PurchaseGateReviewPatchRequest,
} from '../types/analytics'

export function useMonthlyCashflow(monthsOrParams: number | MonthlyCashflowQuery = 6) {
  const params = typeof monthsOrParams === 'number' ? { months: monthsOrParams } : monthsOrParams
  return useQuery({
    queryKey: ['analytics', 'cashflow', params],
    queryFn: () => analyticsApi.monthlyCashflow(params),
  })
}

export function useCategoryMoM(params: CategoryMoMQuery = { months: 2 }) {
  return useQuery({
    queryKey: ['analytics', 'categoryMoM', params],
    queryFn: () => analyticsApi.categoryMoM(params),
  })
}

export function useFixedCostSummary(params: AnalyticsDateRange = {}) {
  return useQuery({
    queryKey: ['analytics', 'fixedCost', params],
    queryFn: () => analyticsApi.fixedCostSummary(params),
  })
}

export function useFixedCostTrend(params: AnalyticsDateRange = {}) {
  return useQuery({
    queryKey: ['analytics', 'fixedCostTrend', params],
    queryFn: () => analyticsApi.fixedCostTrend(params),
  })
}

export function useMerchantSpend(
  params: MerchantSpendQuery = {},
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

export function useRecurringPayments(page = 1, perPage = 10, params: Omit<RecurringPaymentsQuery, 'page' | 'per_page'> = {}) {
  return useQuery({
    queryKey: ['analytics', 'recurringPayments', page, perPage, params],
    queryFn: () => analyticsApi.recurringPayments({ ...params, page, per_page: perPage }),
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
