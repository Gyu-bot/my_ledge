import {
  CHART_TOOLTIP_CLASSNAME,
  CHART_TOOLTIP_LABEL_CLASSNAME,
  CHART_TOOLTIP_VALUE_CLASSNAME,
} from '../../lib/chartTheme'
import { cn, formatKRW } from '../../lib/utils'
import { useMemo, useState } from 'react'

interface DayData {
  date: string   // "YYYY-MM-DD"
  amount: number
}

interface DailyCalendarProps {
  month: string      // "YYYY-MM"
  data: DayData[]
  includeIncome?: boolean
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export function DailyCalendar({ month, data, includeIncome = false }: DailyCalendarProps) {
  const [activeDay, setActiveDay] = useState<{ day: number; amount: number } | null>(null)
  const [year, mon] = month.split('-').map(Number)
  const firstDay = new Date(year, mon - 1, 1).getDay()
  const daysInMonth = new Date(year, mon, 0).getDate()

  const dayMap = new Map(data.map((d) => [d.date.slice(-2), d.amount]))
  const total = data.reduce((sum, d) => sum + (includeIncome ? d.amount : Math.min(d.amount, 0)), 0)
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.amount)), 1)
  const activeSummary = useMemo(() => {
    if (!activeDay) return null
    return `${activeDay.day}일 · ₩${formatKRW(activeDay.amount)}`
  }, [activeDay])
  const activeTooltip = useMemo(() => {
    if (!activeDay) return null
    const isNegative = activeDay.amount < 0
    const prefix = isNegative ? '-' : ''
    return {
      title: `${mon}월 ${activeDay.day}일`,
      amount: `${prefix}₩${formatKRW(Math.abs(activeDay.amount))}`,
      isNegative,
    }
  }, [activeDay, mon])

  return (
    <div className="relative">
      <div className="mb-2 min-h-5 text-right text-micro text-text-muted">
        {activeSummary ?? '날짜를 올리거나 눌러 상세 금액을 확인'}
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-nano text-text-ghost pb-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = String(i + 1).padStart(2, '0')
          const amount = dayMap.get(day)
          const intensity = amount ? Math.min(Math.abs(amount) / maxAbs, 1) : 0
          const isActive = activeDay?.day === i + 1 && amount != null

          return (
            <div key={day} className="relative" data-testid={`day-cell-${day}`}>
              {isActive && activeTooltip ? (
                <div
                  role="tooltip"
                  className={cn(
                    CHART_TOOLTIP_CLASSNAME,
                    'pointer-events-none absolute bottom-[calc(100%+0.35rem)] left-1/2 z-10 min-w-28 -translate-x-1/2 px-3 py-2 text-left',
                  )}
                >
                  <div className={cn(CHART_TOOLTIP_LABEL_CLASSNAME, 'text-micro')}>
                    {activeTooltip.title}
                  </div>
                  <div
                    className={cn(
                      CHART_TOOLTIP_VALUE_CLASSNAME,
                      'mt-1 text-caption font-semibold',
                      activeTooltip.isNegative ? 'text-danger' : 'text-accent',
                    )}
                  >
                    {activeTooltip.amount}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                aria-label={amount != null ? `${i + 1}일: ₩${formatKRW(amount)}` : `${i + 1}일`}
                onMouseEnter={() => amount != null && setActiveDay({ day: i + 1, amount })}
                onFocus={() => amount != null && setActiveDay({ day: i + 1, amount })}
                onMouseLeave={() => setActiveDay((current) => (current?.day === i + 1 ? null : current))}
                onBlur={() => setActiveDay((current) => (current?.day === i + 1 ? null : current))}
                onClick={() => amount != null && setActiveDay({ day: i + 1, amount })}
                className="aspect-square w-full rounded flex flex-col items-center justify-center gap-0.5 bg-border-subtle"
                style={intensity > 0 ? { opacity: 0.4 + intensity * 0.6 } : undefined}
              >
                <span className="text-nano text-text-faint">{i + 1}</span>
                {amount !== undefined && (
                  <span className="w-[3px] h-[3px] rounded-full" style={{ background: amount < 0 ? 'var(--chart-danger)' : 'var(--chart-accent)' }} />
                )}
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-right text-caption text-text-muted">
        합계 ₩{formatKRW(Math.abs(total))}
      </div>
    </div>
  )
}
