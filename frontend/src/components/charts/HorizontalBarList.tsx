import { formatKRW } from '../../lib/utils'

interface BarItem {
  label: string
  amount: number
  color?: string
}

interface HorizontalBarListProps {
  items: BarItem[]
  maxAmount?: number
}

export function HorizontalBarList({ items, maxAmount }: HorizontalBarListProps) {
  const max = maxAmount ?? Math.max(...items.map((i) => Math.abs(i.amount)), 1)
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-[10px] text-text-secondary w-14 shrink-0 truncate">{item.label}</span>
          <div className="flex-1 h-[5px] bg-border-subtle rounded overflow-hidden">
            <div
              className="h-full rounded"
              style={{
                width: `${(Math.abs(item.amount) / max) * 100}%`,
                background: item.color ?? '#10b981',
              }}
            />
          </div>
          <span className="text-[10px] text-text-muted w-20 text-right shrink-0">
            ₩ {formatKRW(item.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}
