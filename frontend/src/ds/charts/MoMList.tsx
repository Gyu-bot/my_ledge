import { formatDeltaPct, formatSignedWon } from '../format'

export interface MoMItem {
  category: string
  current_amount: number
  previous_amount: number
  delta_amount: number
  delta_pct: number | null
}

interface MoMListProps {
  items: MoMItem[]
}

/** 카테고리 전월 대비 diverging bar 목록 — 증가=expense, 감소=income (04-design-system.md §3) */
export function MoMList({ items }: MoMListProps) {
  const maxDelta = Math.max(...items.map((item) => Math.abs(item.delta_amount)), 1)
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => {
        const increase = item.delta_amount > 0
        const ratio = Math.min(1, Math.abs(item.delta_amount) / maxDelta)
        return (
          <div key={item.category} className="px-2 py-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-label text-text-secondary">{item.category}</span>
              <span className={`tnum shrink-0 text-label font-semibold ${increase ? 'text-expense' : 'text-income'}`}>
                {increase ? '▴' : '▾'} {formatDeltaPct(item.delta_pct != null ? item.delta_pct * 100 : null)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              {/* 중앙 0 기준 diverging */}
              <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-sm bg-bg-inset">
                {!increase && (
                  <div className="h-full rounded-sm bg-income" style={{ width: `${ratio * 100}%` }} />
                )}
              </div>
              <div className="flex h-1.5 flex-1 overflow-hidden rounded-sm bg-bg-inset">
                {increase && (
                  <div className="h-full rounded-sm bg-expense" style={{ width: `${ratio * 100}%` }} />
                )}
              </div>
              <span className="tnum w-20 shrink-0 text-right text-caption text-text-muted">
                {formatSignedWon(item.delta_amount, { compact: true })}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
