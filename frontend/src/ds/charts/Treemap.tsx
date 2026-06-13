import { useMemo } from 'react'
import { formatWon, formatWonCompact } from '../format'
import { cn } from '../../lib/utils'

export interface TreemapItem {
  name: string
  value: number
  /** 그룹(카테고리) — 색 결정 */
  group: string
}

interface TreemapProps {
  items: TreemapItem[]
  height?: number
  onSelect?: (item: TreemapItem) => void
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
  item: TreemapItem
}

const PALETTE = Array.from({ length: 11 }, (_, index) => `var(--ds-chart-${index + 1})`)
const WIDTH = 720

/** squarified treemap — 거래처 비중 (04-design-system.md §3) */
function squarify(items: TreemapItem[], x: number, y: number, w: number, h: number): Rect[] {
  if (items.length === 0) return []
  if (items.length === 1) return [{ x, y, w, h, item: items[0] }]

  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) return []

  // 단순 분할: 절반 가치 기준 이분할 재귀 (가독성 우선, 프로토타입 수준)
  let acc = 0
  let splitIndex = 0
  for (let index = 0; index < items.length; index += 1) {
    acc += items[index].value
    if (acc >= total / 2) {
      splitIndex = index + 1
      break
    }
  }
  splitIndex = Math.max(1, Math.min(items.length - 1, splitIndex))
  const first = items.slice(0, splitIndex)
  const rest = items.slice(splitIndex)
  const firstRatio = first.reduce((sum, item) => sum + item.value, 0) / total

  if (w >= h) {
    const firstWidth = w * firstRatio
    return [
      ...squarify(first, x, y, firstWidth, h),
      ...squarify(rest, x + firstWidth, y, w - firstWidth, h),
    ]
  }
  const firstHeight = h * firstRatio
  return [
    ...squarify(first, x, y, w, firstHeight),
    ...squarify(rest, x, y + firstHeight, w, h - firstHeight),
  ]
}

export function Treemap({ items, height = 360, onSelect }: TreemapProps) {
  const rects = useMemo(() => {
    const sorted = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value)
    return squarify(sorted, 0, 0, WIDTH, height)
  }, [items, height])

  const groups = useMemo(
    () => [...new Set(items.map((item) => item.group))],
    [items],
  )
  const colorOf = (group: string) =>
    group === '기타' ? 'var(--ds-chart-other)' : PALETTE[groups.indexOf(group) % PALETTE.length]

  if (rects.length === 0) return null

  return (
    <figure className="m-0">
      <svg width="100%" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label="거래처별 지출 비중 treemap">
        {rects.map(({ x, y, w, h, item }) => (
          <g
            key={`${item.group}:${item.name}`}
            className={cn(onSelect && 'cursor-pointer')}
            onClick={onSelect ? () => onSelect(item) : undefined}
          >
            <title>{`${item.group} · ${item.name} ${formatWon(item.value)}`}</title>
            <rect
              x={x + 1} y={y + 1} width={Math.max(0, w - 2)} height={Math.max(0, h - 2)}
              rx={3}
              fill={colorOf(item.group)}
              opacity={0.85}
            />
            {w > 72 && h > 30 && (
              <>
                <text x={x + 8} y={y + 17} fontSize={11} fontWeight={600} fill="rgba(255,255,255,0.92)">
                  {item.name.length > Math.floor(w / 8) ? `${item.name.slice(0, Math.floor(w / 8))}…` : item.name}
                </text>
                <text x={x + 8} y={y + 31} fontSize={10} fill="rgba(255,255,255,0.7)" className="tnum">
                  {formatWonCompact(item.value)}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-micro text-text-muted">
        {groups.map((group) => (
          <span key={group} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: colorOf(group) }} aria-hidden />
            {group}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
