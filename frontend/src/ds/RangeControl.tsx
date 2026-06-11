import { cn } from '../lib/utils'

export interface MonthRange {
  start: string
  end: string
}

interface RangeControlProps {
  /** 선택 가능한 월 목록 (오름차순) */
  months: string[]
  value: MonthRange
  onChange: (value: MonthRange) => void
  className?: string
}

const PRESETS = [
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '12개월', months: 12 },
]

function presetRange(months: string[], count: number): MonthRange {
  const end = months[months.length - 1]
  const start = months[Math.max(0, months.length - count)]
  return { start, end }
}

/** 페이지 헤더 전역 기간 컨트롤 — 프리셋 + 커스텀 월 범위 (04-design-system.md §4.2) */
export function RangeControl({ months, value, onChange, className }: RangeControlProps) {
  if (months.length === 0) return null
  const selectCls = 'tnum rounded-md border border-border bg-bg-inset px-2 py-1 text-caption text-text-secondary'

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {PRESETS.map((preset) => {
        const range = presetRange(months, preset.months)
        const active = range.start === value.start && range.end === value.end
        return (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(range)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-caption font-medium transition-colors duration-fast',
              active
                ? 'border-accent-border bg-accent-bg text-accent'
                : 'border-border text-text-muted hover:text-text-secondary',
            )}
          >
            {preset.label}
          </button>
        )
      })}
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <label className="sr-only" htmlFor="range-start">시작 월</label>
      <select
        id="range-start"
        className={selectCls}
        value={value.start}
        onChange={(event) => {
          const start = event.target.value
          onChange({ start, end: start > value.end ? start : value.end })
        }}
      >
        {months.map((month) => <option key={month} value={month}>{month}</option>)}
      </select>
      <span className="text-caption text-text-faint">~</span>
      <label className="sr-only" htmlFor="range-end">종료 월</label>
      <select
        id="range-end"
        className={selectCls}
        value={value.end}
        onChange={(event) => {
          const end = event.target.value
          onChange({ start: end < value.start ? end : value.start, end })
        }}
      >
        {months.map((month) => <option key={month} value={month}>{month}</option>)}
      </select>
    </div>
  )
}
