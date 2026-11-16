import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics'
import type {
  MerchantSpendQuery, MonthlyCashflowQuery, IncomeStabilityQuery,
  PurchaseGateReviewPatchRequest,
} from '../types/analytics'

export function useMonthlyCashflow(monthsOrParams: number | MonthlyCashflowQuery = 6) {
  const params = typeof monthsOrParams === 'number' ? { months: monthsOrParams } : monthsOrParams
  return useQuery({
    queryKey: ['analytics', 'cashflow', params],
    queryFn: () => analyticsApi.monthlyCashflow(params),
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
