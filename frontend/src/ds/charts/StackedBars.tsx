import { useMemo, useState } from 'react'
import { formatMonthAxis, formatWon, formatWonCompact } from '../format'
import { cn } from '../../lib/utils'

export interface StackedBarsDatum {
  period: string
  category: string
  amount: number
}

interface StackedBarsProps {
  items: StackedBarsDatum[]
  height?: number
  topN?: number
  onSegmentClick?: (period: string, category: string) => void
}

const OTHER = '기타'
const PALETTE = Array.from({ length: 11 }, (_, index) => `var(--ds-chart-${index + 1})`)

const VIRTUAL_WIDTH = 720
const PAD_LEFT = 52
const PAD_RIGHT = 8
const PAD_TOP = 8
const PAD_BOTTOM = 22

/** 월별 카테고리 스택 바 — Top N + 기타, 범례 클릭 토글 (04-design-system.md §3) */
export function StackedBars({ items, height = 240, topN = 5, onSegmentClick }: StackedBarsProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const { periods, categories, colorOf, byPeriod } = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of items) {
      totals.set(item.category, (totals.get(item.category) ?? 0) + Math.abs(item.amount))
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category)
    const top = ranked.slice(0, topN)
    const hasOther = ranked.length > topN
    const categories = hasOther ? [...top, OTHER] : top

    const colorOf = (category: string) =>
      category === OTHER ? 'var(--ds-chart-other)' : PALETTE[top.indexOf(category) % PALETTE.length]

    const byPeriod = new Map<string, Map<string, number>>()
    for (const item of items) {
      const key = top.includes(item.category) ? item.category : OTHER
      const bucket = byPeriod.get(item.period) ?? new Map<string, number>()
      bucket.set(key, (bucket.get(key) ?? 0) + Math.abs(item.amount))
      byPeriod.set(item.period, bucket)
    }
    const periods = [...byPeriod.keys()].sort()
    return { periods, categories, colorOf, byPeriod }
  }, [items, topN])

  if (periods.length === 0) return null

  const visible = categories.filter((category) => !hidden.has(category))
  const plotWidth = VIRTUAL_WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = height - PAD_TOP - PAD_BOTTOM
  const maxTotal = Math.max(
    ...periods.map((period) =>
      visible.reduce((sum, category) => sum + (byPeriod.get(period)?.get(category) ?? 0), 0),
    ),
    1,
  )
  const groupWidth = plotWidth / periods.length
  const barWidth = Math.min(26, groupWidth * 0.55)
  const labelEvery = periods.length > 8 ? 2 : 1

  function toggle(category: string) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  return (
    <figure className="m-0">
      <svg width="100%" viewBox={`0 0 ${VIRTUAL_WIDTH} ${height}`} role="img" aria-label="월별 카테고리 추이 스택 바">
        {[maxTotal, maxTotal / 2].map((value) => {
          const y = PAD_TOP + plotHeight * (1 - value / maxTotal)
          return (
            <g key={value}>
              <line x1={PAD_LEFT} x2={VIRTUAL_WIDTH - PAD_RIGHT} y1={y} y2={y} stroke="var(--ds-chart-grid)" />
              <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" fontSize={10} fill="var(--ds-chart-axis)">
                {formatWonCompact(value)}
              </text>
            </g>
          )
        })}
        <line
          x1={PAD_LEFT} x2={VIRTUAL_WIDTH - PAD_RIGHT}
          y1={PAD_TOP + plotHeight} y2={PAD_TOP + plotHeight}
          stroke="var(--ds-chart-axis)"
        />
        {periods.map((period, index) => {
          const center = PAD_LEFT + groupWidth * (index + 0.5)
          let cursorY = PAD_TOP + plotHeight
          return (
            <g key={period}>
              {visible.map((category) => {
                const amount = byPeriod.get(period)?.get(category) ?? 0
                const segmentHeight = (amount / maxTotal) * plotHeight
                cursorY -= segmentHeight
                if (amount <= 0) return null
                return (
                  <rect
                    key={category}
                    x={center - barWidth / 2}
                    y={cursorY}
                    width={barWidth}
                    height={segmentHeight}
                    fill={colorOf(category)}
                    className={cn(onSegmentClick && 'cursor-pointer')}
                    onClick={onSegmentClick ? () => onSegmentClick(period, category) : undefined}
                  >
                    <title>{`${period} · ${category} ${formatWon(amount)}`}</title>
                  </rect>
                )
              })}
              {index % labelEvery === 0 && (
                <text x={center} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--ds-chart-axis)">
                  {formatMonthAxis(period)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-micro text-text-muted">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => toggle(category)}
            className={cn('flex items-center gap-1.5', hidden.has(category) && 'opacity-40 line-through')}
          >
            <span className="h-2 w-2 rounded-[2px]" style={{ background: colorOf(category) }} aria-hidden />
            {category}
          </button>
        ))}
      </figcaption>
    </figure>
  )
}
