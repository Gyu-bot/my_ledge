import { formatKRW } from '../../lib/utils'

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
  const [year, mon] = month.split('-').map(Number)
  const firstDay = new Date(year, mon - 1, 1).getDay()
  const daysInMonth = new Date(year, mon, 0).getDate()

  const dayMap = new Map(data.map((d) => [d.date.slice(-2), d.amount]))
  const total = data.reduce((sum, d) => sum + (includeIncome ? d.amount : Math.min(d.amount, 0)), 0)
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.amount)), 1)

  return (
    <div>
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
          return (
            <div
              key={day}
              title={amount != null ? `${i + 1}일: ₩${formatKRW(amount)}` : undefined}
              className="aspect-square rounded flex flex-col items-center justify-center gap-0.5 bg-border-subtle"
              style={intensity > 0 ? { opacity: 0.4 + intensity * 0.6 } : undefined}
            >
              <span className="text-nano text-text-faint">{i + 1}</span>
              {amount !== undefined && (
                <span className="w-[3px] h-[3px] rounded-full" style={{ background: amount < 0 ? 'var(--chart-danger)' : 'var(--chart-accent)' }} />
              )}
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
