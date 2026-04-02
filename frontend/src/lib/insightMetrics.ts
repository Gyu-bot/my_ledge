interface SavingsRateInput {
  income: number;
  net_cashflow: number;
  savings_rate: number | null;
}

const EXTREME_SAVINGS_RATE_THRESHOLD = 1000;

export function formatSavingsRateValue(metric: SavingsRateInput | null | undefined) {
  if (!metric || metric.savings_rate === null || metric.savings_rate === undefined) {
    return '데이터 없음';
  }

  if (
    metric.income <= 0 ||
    Math.abs(metric.savings_rate) >= EXTREME_SAVINGS_RATE_THRESHOLD
  ) {
    return metric.net_cashflow < 0 ? '적자 구간' : '산정 보류';
  }

  return `${metric.savings_rate.toFixed(1)}%`;
}
