import { monthRange } from '../../lib/utils'

/** "2026-07" → { start_date: "2026-07-01", end_date: "2026-07-31" } */
export function periodDateRange(period: string): { start_date: string; end_date: string } {
  const [year, month] = period.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start_date: `${period}-01`, end_date: `${period}-${String(lastDay).padStart(2, '0')}` }
}

/** "2026-07" → "2026년 7월" */
export function formatPeriodKo(period: string): string {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period
  return `${year}년 ${month}월`
}

function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** end를 포함해 거슬러 올라간 n개월 (오름차순) */
export function lastMonths(end: string, count: number): string[] {
  return monthRange(shiftPeriod(end, -(count - 1)), end)
}

/** "2026-08-14" → "2026년 8월 14일" */
export function formatDateKo(date: string | null | undefined): string {
  if (!date) return '없음'
  const [, month, day] = date.split('-').map(Number)
  if (!month || !day) return date
  return `${date.slice(0, 4)}년 ${month}월 ${day}일`
}
