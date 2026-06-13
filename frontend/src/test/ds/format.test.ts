import { describe, expect, it } from 'vitest'
import {
  formatDay,
  formatDeltaPct,
  formatMonthAxis,
  formatPct,
  formatSignedWon,
  formatWon,
  formatWonCompact,
} from '../../ds/format'

describe('ds/format — 금액·수치 표기 계약', () => {
  it('formatWon: 전체 자릿수 + ₩, 부호 없음', () => {
    expect(formatWon(1_420_000)).toBe('₩1,420,000')
    expect(formatWon(-1_420_000)).toBe('₩1,420,000')
    expect(formatWon(0)).toBe('₩0')
  })

  it('formatWonCompact: 억/만 압축 규칙', () => {
    expect(formatWonCompact(421_000_000)).toBe('₩4.21억')
    expect(formatWonCompact(120_000_000)).toBe('₩1.2억')
    expect(formatWonCompact(100_000_000)).toBe('₩1억')
    expect(formatWonCompact(1_420_000)).toBe('₩142만')
    expect(formatWonCompact(12_000)).toBe('₩1.2만')
    expect(formatWonCompact(4_500)).toBe('₩4,500')
  })

  it('formatSignedWon: 부호 병기 (색에만 의존 금지)', () => {
    expect(formatSignedWon(-23_000)).toBe('-₩23,000')
    expect(formatSignedWon(4_200_000)).toBe('+₩4,200,000')
    expect(formatSignedWon(0)).toBe('₩0')
    expect(formatSignedWon(-120_000_000, { compact: true })).toBe('-₩1.2억')
  })

  it('formatPct / formatDeltaPct: 소수 1자리, 결측은 —', () => {
    expect(formatPct(34.21)).toBe('34.2%')
    expect(formatPct(null)).toBe('—')
    expect(formatDeltaPct(8.24)).toBe('+8.2%')
    expect(formatDeltaPct(-3.06)).toBe('-3.1%')
    expect(formatDeltaPct(null)).toBe('—')
  })

  it('formatDay: 같은 해는 MM-DD, 다른 해는 전체', () => {
    const now = new Date('2026-06-10')
    expect(formatDay('2026-06-09', now)).toBe('06-09')
    expect(formatDay('2025-06-09', now)).toBe('2025-06-09')
  })

  it('formatMonthAxis: YY.MM', () => {
    expect(formatMonthAxis('2026-06')).toBe('26.06')
    expect(formatMonthAxis('2026-06-15')).toBe('26.06')
  })
})
