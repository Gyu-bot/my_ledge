import { apiRequest, type QueryParams } from './client';
import type {
  CategoryMoMResponse,
  FixedCostSummaryResponse,
  IncomeStabilityResponse,
  MerchantSpendResponse,
  MonthlyCashflowResponse,
  PaymentMethodPatternsResponse,
  RecurringPaymentsResponse,
  SpendingAnomaliesResponse,
} from '../types/analytics';

export function getMonthlyCashflow(query?: QueryParams) {
  return apiRequest<MonthlyCashflowResponse>('/analytics/monthly-cashflow', { query });
}

export function getCategoryMoM(query?: QueryParams) {
  return apiRequest<CategoryMoMResponse>('/analytics/category-mom', { query });
}

export function getFixedCostSummary(query?: QueryParams) {
  return apiRequest<FixedCostSummaryResponse>('/analytics/fixed-cost-summary', { query });
}

export function getMerchantSpend(query?: QueryParams) {
  return apiRequest<MerchantSpendResponse>('/analytics/merchant-spend', { query });
}

export function getPaymentMethodPatterns(query?: QueryParams) {
  return apiRequest<PaymentMethodPatternsResponse>('/analytics/payment-method-patterns', { query });
}

export function getIncomeStability(query?: QueryParams) {
  return apiRequest<IncomeStabilityResponse>('/analytics/income-stability', { query });
}

export function getRecurringPayments(query?: QueryParams) {
  return apiRequest<RecurringPaymentsResponse>('/analytics/recurring-payments', { query });
}

export function getSpendingAnomalies(query?: QueryParams) {
  return apiRequest<SpendingAnomaliesResponse>('/analytics/spending-anomalies', { query });
}
