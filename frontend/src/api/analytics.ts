import { apiFetch } from '../lib/apiClient'
import { monthSpanToDateRange, recentMonthsToDateRange } from '../lib/dateRange'
import type {
  AnalyticsDateRange, MerchantSpendQuery, MonthlyCashflowQuery, RecurringPaymentsQuery,
  MonthlyCashflowResponse, CategoryMoMResponse, FixedCostSummaryResponse, FixedCostTrendResponse,
  MerchantSpendResponse, IncomeStabilityResponse, RecurringPaymentsResponse,
  SpendingAnomaliesResponse, CategoryMoMQuery, SpendingAnomaliesQuery, IncomeStabilityQuery,
  DiscretionaryVelocityResponse, DiscretionaryVelocityQuery,
  PurchaseGateCandidatesResponse, PurchaseGateCandidatesQuery,
  PurchaseGateReviewPatchRequest, PurchaseGateReviewResponse,
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
  monthlyCashflow: (params: MonthlyCashflowQuery = {}) =>
    apiFetch<MonthlyCashflowResponse>(`/analytics/monthly-cashflow${buildQuery(
      {
        ...(params.months ? recentMonthsToDateRange(params.months) : monthSpanToDateRange(params.start_month, params.end_month)),
        ...(params.start_date ? { start_date: params.start_date } : {}),
        ...(params.end_date ? { end_date: params.end_date } : {}),
      },
    )}`),

  categoryMoM: (params: CategoryMoMQuery = {}) =>
    apiFetch<CategoryMoMResponse>(`/analytics/category-mom${buildQuery({
      ...(
        params.base_month
          ? (() => {
              const [year, month] = params.base_month!.split('-').map(Number)
              const previous = new Date(year, month - 2, 1)
              const startMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
              const range = monthSpanToDateRange(startMonth, params.base_month)
              const now = new Date()
              const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
              if (range.end_date && range.end_date > today) range.end_date = today
              return range
            })()
          : params.start_month || params.end_month
          ? monthSpanToDateRange(params.start_month, params.end_month)
          : params.months
            ? recentMonthsToDateRange(params.months)
            : {}
      ),
      ...(params.start_date ? { start_date: params.start_date } : {}),
      ...(params.end_date ? { end_date: params.end_date } : {}),
      type: params.include_income ? 'income_expense' : '지출',
    })}`),

  fixedCostSummary: (params: AnalyticsDateRange = {}) =>
    apiFetch<FixedCostSummaryResponse>(`/analytics/fixed-cost-summary${buildQuery(
      { ...monthSpanToDateRange(params.start_month, params.end_month),
        ...(params.start_date ? { start_date: params.start_date } : {}),
        ...(params.end_date ? { end_date: params.end_date } : {}),
      },
    )}`),

  fixedCostTrend: (params: AnalyticsDateRange = {}) =>
    apiFetch<FixedCostTrendResponse>(`/analytics/fixed-cost-trend${buildQuery(
      { ...monthSpanToDateRange(params.start_month, params.end_month),
        ...(params.start_date ? { start_date: params.start_date } : {}),
        ...(params.end_date ? { end_date: params.end_date } : {}),
      },
    )}`),

  merchantSpend: (
    params: MerchantSpendQuery = {},
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
      ...(params.start_date ? { start_date: params.start_date } : {}),
      ...(params.end_date ? { end_date: params.end_date } : {}),
      type: params.include_income ? 'income_expense' : '지출',
    })}`),

  incomeStability: (params: IncomeStabilityQuery = {}) =>
    apiFetch<IncomeStabilityResponse>(`/analytics/income-stability${buildQuery(params)}`),

  recurringPayments: (params: RecurringPaymentsQuery = {}) =>
    apiFetch<RecurringPaymentsResponse>(`/analytics/recurring-payments${buildQuery(params)}`),

  spendingAnomalies: (params: SpendingAnomaliesQuery = {}) =>
    apiFetch<SpendingAnomaliesResponse>(`/analytics/spending-anomalies${buildQuery(params)}`),

  discretionaryVelocity: (params: DiscretionaryVelocityQuery = {}) =>
    apiFetch<DiscretionaryVelocityResponse>(`/analytics/discretionary-velocity${buildQuery(params)}`),

  purchaseGateCandidates: (params: PurchaseGateCandidatesQuery = {}) => {
    const { status, limit, ...rest } = params
    return apiFetch<PurchaseGateCandidatesResponse>(`/analytics/spending-review-candidates${buildQuery({
      ...rest,
      review_status: status,
      per_page: limit,
    })}`)
  },

  reviewPurchaseGateCandidate: (candidateKey: string, data: PurchaseGateReviewPatchRequest) =>
    apiFetch<PurchaseGateReviewResponse>(
      `/analytics/purchase-gate-candidates/${encodeURIComponent(candidateKey)}/review`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    ),
}
