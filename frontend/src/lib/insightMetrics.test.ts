import { describe, expect, it } from 'vitest';
import { formatSavingsRateValue } from './insightMetrics';

describe('formatSavingsRateValue', () => {
  it('formats ordinary savings rates as percentages', () => {
    expect(
      formatSavingsRateValue({
        income: 3200000,
        net_cashflow: 2398000,
        savings_rate: 74.9,
      }),
    ).toBe('74.9%');
  });

  it('keeps moderate negative rates visible', () => {
    expect(
      formatSavingsRateValue({
        income: 3200000,
        net_cashflow: -800000,
        savings_rate: -25,
      }),
    ).toBe('-25.0%');
  });

  it('collapses extreme deficit ratios into a compact status label', () => {
    expect(
      formatSavingsRateValue({
        income: 50,
        net_cashflow: -4341824,
        savings_rate: -86836.5,
      }),
    ).toBe('적자 구간');
  });
});
