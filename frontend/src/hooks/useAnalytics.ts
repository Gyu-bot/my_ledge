import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics'
import type { CategoryMoMQuery, SpendingAnomaliesQuery } from '../types/analytics'

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

export function useMerchantSpend(
  params: { start_month?: string; end_month?: string; months?: number; limit?: number } = {},
) {
  return useQuery({
    queryKey: ['analytics', 'merchantSpend', params],
    queryFn: () => analyticsApi.merchantSpend(params),
  })
}

export function useIncomeStability() {
  return useQuery({
    queryKey: ['analytics', 'incomeStability'],
    queryFn: analyticsApi.incomeStability,
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
