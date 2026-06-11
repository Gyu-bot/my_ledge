import type { ReactNode } from 'react'
import { formatWonCompact } from '../format'
import { cn } from '../../lib/utils'

export interface HBarItem {
  label: string
  amount: number
  /** bar 색 — 미지정 시 accent */
  color?: string
  sub?: ReactNode
}

interface HBarListProps {
  items: HBarItem[]
  maxAmount?: number
  selectedLabel?: string | null
  onSelect?: (label: string) => void
  valueFormatter?: (amount: number) => string
  className?: string
}

/** 수평 bar 목록 — 구성 비교의 기본 차트 (04-design-system.md §3) */
export function HBarList({
  items,
  maxAmount,
  selectedLabel,
  onSelect,
  valueFormatter = (amount) => formatWonCompact(Math.abs(amount)),
  className,
}: HBarListProps) {
  const max = maxAmount ?? Math.max(...items.map((item) => Math.abs(item.amount)), 1)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {items.map((item) => {
        const ratio = Math.min(1, Math.abs(item.amount) / max)
        const selected = selectedLabel === item.label
        const row = (
          <>
            <div className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  'truncate text-label',
                  selected ? 'font-semibold text-text-primary' : 'text-text-secondary',
                )}
              >
                {item.label}
                {item.sub ? <span className="ml-1.5 text-caption text-text-faint">{item.sub}</span> : null}
              </span>
              <span className="tnum shrink-0 text-label font-semibold text-text-primary">
                {valueFormatter(item.amount)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-bg-inset">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${ratio * 100}%`,
                  background: item.color ?? 'var(--ds-accent-fg)',
                  opacity: selectedLabel != null && !selected ? 0.4 : 1,
                }}
              />
            </div>
          </>
        )
        return onSelect ? (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect(item.label)}
            className={cn(
              'rounded-md px-2 py-1.5 text-left transition-colors duration-fast hover:bg-bg-inset',
              selected && 'bg-bg-selected',
            )}
          >
            {row}
          </button>
        ) : (
          <div key={item.label} className="px-2 py-1.5">
            {row}
          </div>
        )
      })}
    </div>
  )
}
