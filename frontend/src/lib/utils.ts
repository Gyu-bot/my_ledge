import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind.config.js의 글자 크기 이름을 알려 준다. 모르면 `text-micro`와
// `text-text-secondary`를 같은 무리로 보고 하나를 지워, 배지·버튼의 글자 크기나
// 색이 빠진다.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'kpi', 'title', 'section', 'body', 'label', 'caption', 'micro'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatKRW(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.abs(amount))
}

export function formatKRWCompact(amount: number): string {
  const abs = Math.abs(amount)
  if (abs >= 100_000_000) return `${(abs / 100_000_000).toFixed(1)}억`
  if (abs >= 10_000) return `${Math.round(abs / 10_000)}만`
  return formatKRW(abs)
}

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—'
  return `${value.toFixed(decimals)}%`
}

export function formatDate(dateStr: string): string {
  return dateStr.slice(5).replace('-', '.')
}

export function formatYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function formatMonthAxisLabel(value: string): string {
  const normalized = value.slice(0, 7)
  const [year, month] = normalized.split('-')
  if (!year || !month) return value
  return `${year.slice(-2)}.${month}`
}

export function monthRange(start: string, end: string): string[] {
  const result: string[] = []
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    if (m === 12) { y++; m = 1 } else { m++ }
  }
  return result
}
