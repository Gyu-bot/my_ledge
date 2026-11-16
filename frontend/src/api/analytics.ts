import { apiFetch } from '../lib/apiClient'
import { monthSpanToDateRange, recentMonthsToDateRange } from '../lib/dateRange'
import type {
  MerchantSpendQuery, MonthlyCashflowQuery,
  MonthlyCashflowResponse,
  MerchantSpendResponse, IncomeStabilityResponse, IncomeStabilityQuery,
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
