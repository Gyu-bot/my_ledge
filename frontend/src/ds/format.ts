// Ledger DS 금액·수치 표기 계약 — docs/frontend-remake/04-design-system.md §2.3

/** 전체 자릿수: ₩1,420,000 (부호 없음 — 부호는 호출부 의미에 따라 결합) */
export function formatWon(amount: number): string {
  return `₩${new Intl.NumberFormat('ko-KR').format(Math.abs(Math.round(amount)))}`
}

function trimZeros(value: string): string {
  return value.replace(/\.?0+$/, '')
}

/** 압축 표기 (KPI/카드 전용): ≥1억 "4.21억", ≥1만 "142만", 미만 전체 자릿수 */
export function formatWonCompact(amount: number): string {
  const abs = Math.abs(amount)
  if (abs >= 100_000_000) return `₩${trimZeros((abs / 100_000_000).toFixed(2))}억`
  if (abs >= 10_000) {
    const man = abs / 10_000
    return `₩${man >= 100 ? Math.round(man).toLocaleString('ko-KR') : trimZeros(man.toFixed(1))}만`
  }
  return formatWon(abs)
}

/** 부호 병기 (색에만 의존 금지 원칙): +₩…/-₩… */
export function formatSignedWon(amount: number, options: { compact?: boolean } = {}): string {
  const body = options.compact ? formatWonCompact(amount) : formatWon(amount)
  if (amount === 0) return body
  return `${amount < 0 ? '-' : '+'}${body}`
}

/** 백분율: 소수 1자리 고정. null/undefined → "—" */
export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(decimals)}%`
}

/** 증감: +8.2% / -3.1% (0은 부호 없음) */
export function formatDeltaPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/** 날짜: 같은 해 "06-09", 다른 해 "2025-06-09" */
export function formatDay(dateStr: string, now: Date = new Date()): string {
  const year = dateStr.slice(0, 4)
  return Number(year) === now.getFullYear() ? dateStr.slice(5, 10) : dateStr.slice(0, 10)
}

/** 월: "2026-06" */
export function formatMonth(value: string): string {
  return value.slice(0, 7)
}

/** 월 축 라벨: "26.06" */
export function formatMonthAxis(value: string): string {
  const [year, month] = value.slice(0, 7).split('-')
  if (!year || !month) return value
  return `${year.slice(-2)}.${month}`
}

/** 결측 표기 — 0과 결측을 구분한다 */
export const EM_DASH = '—'
