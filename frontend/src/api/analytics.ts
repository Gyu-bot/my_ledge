import { apiFetch } from '../lib/apiClient'
import { monthSpanToDateRange, recentMonthsToDateRange } from '../lib/dateRange'
import type {
  MonthlyCashflowResponse, CategoryMoMResponse, FixedCostSummaryResponse,
  MerchantSpendResponse, IncomeStabilityResponse, RecurringPaymentsResponse,
  SpendingAnomaliesResponse, CategoryMoMQuery, SpendingAnomaliesQuery,
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
    apiFetch<MonthlyCashflowResponse>(`/analytics/monthly-cashflow${buildQuery(
      params.months ? recentMonthsToDateRange(params.months) : {},
    )}`),

  categoryMoM: (params: CategoryMoMQuery = {}) =>
    apiFetch<CategoryMoMResponse>(`/analytics/category-mom${buildQuery({
      ...(
        params.base_month
          ? (() => {
              const [year, month] = params.base_month!.split('-').map(Number)
              const previous = new Date(year, month - 2, 1)
              const startMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
              return monthSpanToDateRange(startMonth, params.base_month)
            })()
          : params.start_month || params.end_month
          ? monthSpanToDateRange(params.start_month, params.end_month)
          : params.months
            ? recentMonthsToDateRange(params.months)
            : {}
      ),
      type: '지출',
    })}`),

  fixedCostSummary: (params: { start_month?: string; end_month?: string } = {}) =>
    apiFetch<FixedCostSummaryResponse>(`/analytics/fixed-cost-summary${buildQuery(
      monthSpanToDateRange(params.start_month, params.end_month),
    )}`),

  merchantSpend: (
    params: { start_month?: string; end_month?: string; months?: number; limit?: number } = {},
  ) =>
    apiFetch<MerchantSpendResponse>(`/analytics/merchant-spend${buildQuery({
      ...(
        params.start_month || params.end_month
          ? monthSpanToDateRange(params.start_month, params.end_month)
          : params.months
            ? recentMonthsToDateRange(params.months)
            : {}
      ),
      limit: params.limit,
      type: '지출',
    })}`),

  incomeStability: () =>
    apiFetch<IncomeStabilityResponse>('/analytics/income-stability'),

  recurringPayments: (params: { page?: number; per_page?: number } = {}) =>
    apiFetch<RecurringPaymentsResponse>(`/analytics/recurring-payments${buildQuery(params)}`),

  spendingAnomalies: (params: SpendingAnomaliesQuery = {}) =>
    apiFetch<SpendingAnomaliesResponse>(`/analytics/spending-anomalies${buildQuery(params)}`),
}
