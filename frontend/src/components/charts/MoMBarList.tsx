import { formatKRW } from '../../lib/utils'
import type { CategoryMoMItem } from '../../types/analytics'
import { CHART_ACCENT, CHART_DANGER } from '../../lib/chartTheme'

interface MoMBarListProps {
  items: CategoryMoMItem[]
}

export function MoMBarList({ items }: MoMBarListProps) {
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.delta_amount)), 1)

  return (
    <div className="flex flex-col">
      <div className="text-center text-micro text-text-ghost mb-2">← 감소 &nbsp;|&nbsp; 증가 →</div>
      {items.map((item) => {
        const pct = (Math.abs(item.delta_amount) / maxAbs) * 48
        const isUp = item.delta_amount > 0
        return (
          <div key={`${item.category}-${item.period}`} className="flex items-center gap-2.5 py-2 border-b border-border-subtle last:border-0">
            <span className="text-caption text-text-secondary w-14 shrink-0 truncate">{item.category}</span>
            <div className="flex-1 h-[6px] bg-border-subtle rounded relative">
              <div
                className={`absolute h-full rounded ${isUp ? 'left-1/2' : 'right-1/2'}`}
                style={{
                  width: `${pct}%`,
                  background: isUp ? CHART_DANGER : CHART_ACCENT,
                }}
              />
            </div>
            <span className={`text-caption font-semibold w-16 text-right shrink-0 ${isUp ? 'text-danger' : 'text-accent'}`}>
              {item.delta_amount > 0 ? '+' : item.delta_amount < 0 ? '-' : ''}₩{formatKRW(item.delta_amount)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
