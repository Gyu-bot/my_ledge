export interface MonthlyCashflowItemResponse {
  period: string;
  income: number;
  expense: number;
  transfer: number;
  net_cashflow: number;
  savings_rate: number | null;
}

export interface MonthlyCashflowResponse {
  items: MonthlyCashflowItemResponse[];
}

export interface CategoryMoMItemResponse {
  period: string;
  previous_period: string;
  category: string;
  current_amount: number;
  previous_amount: number;
  delta_amount: number;
  delta_pct: number | null;
}

export interface CategoryMoMResponse {
  items: CategoryMoMItemResponse[];
}

export interface FixedCostSummaryResponse {
  expense_total: number;
  fixed_total: number;
  variable_total: number;
  fixed_ratio: number | null;
  essential_fixed_total: number;
  discretionary_fixed_total: number;
  unclassified_total: number;
  unclassified_count: number;
}

export interface MerchantSpendItemResponse {
  merchant: string;
  amount: number;
  count: number;
  avg_amount: number;
  last_seen_at: string;
}

export interface MerchantSpendResponse {
  items: MerchantSpendItemResponse[];
}

export interface PaymentMethodPatternItemResponse {
  payment_method: string;
  total_amount: number;
  transaction_count: number;
  avg_amount: number;
  pct_of_total: number | null;
}

export interface PaymentMethodPatternsResponse {
  items: PaymentMethodPatternItemResponse[];
}

export interface IncomeMonthlyItemResponse {
  period: string;
  income: number;
}

export interface IncomeStabilityResponse {
  items: IncomeMonthlyItemResponse[];
  avg: number;
  stdev: number | null;
  coefficient_of_variation: number | null;
  assumptions: string;
}

export interface RecurringPaymentItemResponse {
  description: string;
  category: string;
  avg_amount: number;
  interval_type: string;
  avg_interval_days: number;
  occurrences: number;
  confidence: number;
  last_date: string;
}

export interface RecurringPaymentsResponse {
  items: RecurringPaymentItemResponse[];
  assumptions: string;
}

export interface SpendingAnomalyItemResponse {
  period: string;
  category: string;
  amount: number;
  baseline_avg: number;
  delta_pct: number | null;
  anomaly_score: number;
  reason: string;
}

export interface SpendingAnomaliesResponse {
  items: SpendingAnomalyItemResponse[];
  assumptions: string;
}
