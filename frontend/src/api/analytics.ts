import { apiFetch } from '../lib/apiClient'
import type {
  MonthlyCashflowResponse, CategoryMoMResponse, FixedCostSummaryResponse,
  MerchantSpendResponse, IncomeStabilityResponse, RecurringPaymentsResponse,
  SpendingAnomaliesResponse,
} from '../types/analytics'

function buildQuery(params: object): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const analyticsApi = {
  monthlyCashflow: (params: { months?: number } = {}) =>
    apiFetch<MonthlyCashflowResponse>(`/analytics/monthly-cashflow${buildQuery(params)}`),

  categoryMoM: (params: { months?: number } = {}) =>
    apiFetch<CategoryMoMResponse>(`/analytics/category-mom${buildQuery(params)}`),

  fixedCostSummary: (params: { start_month?: string; end_month?: string } = {}) =>
    apiFetch<FixedCostSummaryResponse>(`/analytics/fixed-cost-summary${buildQuery(params)}`),

  merchantSpend: (params: { months?: number; limit?: number } = {}) =>
    apiFetch<MerchantSpendResponse>(`/analytics/merchant-spend${buildQuery(params)}`),

  incomeStability: () =>
    apiFetch<IncomeStabilityResponse>('/analytics/income-stability'),

  recurringPayments: (params: { page?: number; per_page?: number } = {}) =>
    apiFetch<RecurringPaymentsResponse>(`/analytics/recurring-payments${buildQuery(params)}`),

  spendingAnomalies: (params: { page?: number; per_page?: number } = {}) =>
    apiFetch<SpendingAnomaliesResponse>(`/analytics/spending-anomalies${buildQuery(params)}`),
}
