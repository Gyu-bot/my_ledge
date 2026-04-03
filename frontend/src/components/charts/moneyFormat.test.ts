import { describe, expect, it } from 'vitest';
import { formatAxisMoneyInThousands } from './moneyFormat';

describe('formatAxisMoneyInThousands', () => {
  it('formats axis values in units of 1,000 KRW without the long currency suffix', () => {
    expect(formatAxisMoneyInThousands(0)).toBe('0');
    expect(formatAxisMoneyInThousands(1450)).toBe('1');
    expect(formatAxisMoneyInThousands(-4210654)).toBe('-4,211');
    expect(formatAxisMoneyInThousands(13500000)).toBe('13,500');
  });
});
