import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

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
