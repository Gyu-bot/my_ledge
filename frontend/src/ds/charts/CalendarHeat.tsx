import { formatWon, formatWonCompact } from '../format'
import { cn } from '../../lib/utils'

export interface DailyAmount {
  date: string // YYYY-MM-DD
  amount: number
}

interface CalendarHeatProps {
  month: string // YYYY-MM
  items: DailyAmount[]
  onSelectDay?: (date: string) => void
  selectedDate?: string | null
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 일별 지출 heat 달력 — 지출 명도 5단계 (04-design-system.md §3) */
export function CalendarHeat({ month, items, onSelectDay, selectedDate }: CalendarHeatProps) {
  const [year, monthNumber] = month.split('-').map(Number)
  const firstDay = new Date(year, monthNumber - 1, 1).getDay()
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const amountByDate = new Map(items.map((item) => [item.date, item.amount]))
  const maxSpend = Math.max(...items.map((item) => Math.abs(Math.min(0, item.amount))), 1)

  function intensity(amount: number | undefined): number {
    if (amount == null || amount >= 0) return 0
    const ratio = Math.abs(amount) / maxSpend
    if (ratio > 0.8) return 5
    if (ratio > 0.6) return 4
    if (ratio > 0.4) return 3
    if (ratio > 0.2) return 2
    return 1
  }

  const INTENSITY_OPACITY = [0, 0.15, 0.3, 0.5, 0.7, 0.95]

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-micro text-text-faint">
        {WEEKDAYS.map((weekday) => <div key={weekday} className="py-1">{weekday}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }, (_, index) => <div key={`pad-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1
          const date = `${month}-${String(day).padStart(2, '0')}`
          const amount = amountByDate.get(date)
          const level = intensity(amount)
          const selected = selectedDate === date
          return (
            <button
              key={date}
              type="button"
              disabled={!onSelectDay}
              onClick={() => onSelectDay?.(date)}
              title={amount != null ? `${date} · ${amount < 0 ? '-' : '+'}${formatWon(amount)}` : date}
              className={cn(
                'flex aspect-square flex-col items-center justify-center rounded-sm border text-micro transition-colors duration-fast',
                selected ? 'border-accent' : 'border-border-subtle',
                onSelectDay && 'hover:border-border-strong',
              )}
              style={{
                background: level > 0
                  ? `color-mix(in srgb, var(--ds-expense-fg) ${INTENSITY_OPACITY[level] * 100}%, transparent)`
                  : undefined,
              }}
            >
              <span className={cn('tnum', level >= 4 ? 'text-white' : 'text-text-muted')}>{day}</span>
              {amount != null && amount < 0 && (
                <span className={cn('tnum text-[9px] leading-tight', level >= 4 ? 'text-white/85' : 'text-text-faint')}>
                  {formatWonCompact(amount).replace('₩', '')}
                </span>
              )}
              {amount != null && amount > 0 && (
                <span className="tnum text-[9px] leading-tight text-income">
                  +{formatWonCompact(amount).replace('₩', '')}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
