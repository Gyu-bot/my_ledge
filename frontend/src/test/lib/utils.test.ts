import { describe, it, expect } from 'vitest'
import { formatKRW, formatKRWCompact, formatPct, monthRange } from '../../lib/utils'

describe('formatKRW', () => {
  it('formats positive numbers with comma', () => {
    expect(formatKRW(1234567)).toBe('1,234,567')
  })
  it('formats negative numbers without sign', () => {
    expect(formatKRW(-6500)).toBe('6,500')
  })
})

describe('formatKRWCompact', () => {
  it('formats numbers >= 10000 as 만', () => {
    expect(formatKRWCompact(42500000)).toBe('4250만')
  })
  it('formats numbers >= 100M as 억', () => {
    expect(formatKRWCompact(150000000)).toBe('1.5억')
  })
})

describe('formatPct', () => {
  it('formats number as percentage', () => {
    expect(formatPct(61.6)).toBe('61.6%')
  })
  it('returns dash for null', () => {
    expect(formatPct(null)).toBe('—')
  })
})

describe('monthRange', () => {
  it('returns months between start and end inclusive', () => {
    expect(monthRange('2026-01', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03'])
  })
  it('returns single month when start equals end', () => {
    expect(monthRange('2026-03', '2026-03')).toEqual(['2026-03'])
  })
})
