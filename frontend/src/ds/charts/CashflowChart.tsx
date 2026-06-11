import { formatMonthAxis, formatSignedWon, formatWon, formatWonCompact } from '../format'

export interface CashflowChartItem {
  period: string
  income: number
  expense: number
  net: number
}

interface CashflowChartProps {
  items: CashflowChartItem[]
  height?: number
  /** is_complete_month=false인 월 — 반투명 처리 + 진행중 표기 */
  incompletePeriods?: ReadonlySet<string>
}

const VIRTUAL_WIDTH = 720
const PAD_LEFT = 52
const PAD_RIGHT = 8
const PAD_TOP = 8
const PAD_BOTTOM = 22

/**
 * 수입/지출 dual bar + 순현금흐름 라인 — 04-design-system.md §3.
 * 경량 커스텀 SVG (프로토타입 단계, recharts 미사용).
 */
export function CashflowChart({ items, height = 200, incompletePeriods }: CashflowChartProps) {
  if (items.length === 0) return null

  const plotWidth = VIRTUAL_WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = height - PAD_TOP - PAD_BOTTOM
  const maxBar = Math.max(...items.map((item) => Math.max(item.income, Math.abs(item.expense))), 1)
  const minNet = Math.min(0, ...items.map((item) => item.net))
  const domainMax = maxBar
  const domainMin = minNet
  const domainSpan = domainMax - domainMin || 1

  const yOf = (value: number) => PAD_TOP + plotHeight * (1 - (value - domainMin) / domainSpan)
  const zeroY = yOf(0)
  const groupWidth = plotWidth / items.length
  const barWidth = Math.min(14, groupWidth * 0.28)
  const labelEvery = items.length > 8 ? 2 : 1

  const netPoints = items
    .map((item, index) => {
      const x = PAD_LEFT + groupWidth * (index + 0.5)
      return `${x.toFixed(1)},${yOf(item.net).toFixed(1)}`
    })
    .join(' ')

  const gridValues = [domainMax, domainMax / 2]

  return (
    <figure className="m-0">
      <svg
        width="100%"
        viewBox={`0 0 ${VIRTUAL_WIDTH} ${height}`}
        role="img"
        aria-label={`최근 ${items.length}개월 수입·지출·순현금흐름 차트`}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD_LEFT}
              x2={VIRTUAL_WIDTH - PAD_RIGHT}
              y1={yOf(value)}
              y2={yOf(value)}
              stroke="var(--ds-chart-grid)"
              strokeWidth={1}
            />
            <text x={PAD_LEFT - 6} y={yOf(value) + 3} textAnchor="end" fontSize={10} fill="var(--ds-chart-axis)">
              {formatWonCompact(value)}
            </text>
          </g>
        ))}
        <line
          x1={PAD_LEFT}
          x2={VIRTUAL_WIDTH - PAD_RIGHT}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--ds-chart-axis)"
          strokeWidth={1}
        />

        {items.map((item, index) => {
          const groupX = PAD_LEFT + groupWidth * index
          const center = groupX + groupWidth / 2
          const incomeHeight = zeroY - yOf(item.income)
          const expenseHeight = zeroY - yOf(Math.abs(item.expense))
          const incomplete = incompletePeriods?.has(item.period) ?? false
          return (
            <g key={item.period} opacity={incomplete ? 0.45 : 1}>
              <title>
                {`${item.period}${incomplete ? ' (진행중)' : ''} · 수입 ${formatWon(item.income)} · 지출 ${formatWon(Math.abs(item.expense))} · 순 ${formatSignedWon(item.net)}`}
              </title>
              <rect
                x={center - barWidth - 1.5}
                y={yOf(item.income)}
                width={barWidth}
                height={Math.max(0, incomeHeight)}
                rx={2}
                fill="var(--ds-chart-income)"
              />
              <rect
                x={center + 1.5}
                y={yOf(Math.abs(item.expense))}
                width={barWidth}
                height={Math.max(0, expenseHeight)}
                rx={2}
                fill="var(--ds-chart-expense)"
              />
              {index % labelEvery === 0 && (
                <text x={center} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--ds-chart-axis)">
                  {formatMonthAxis(item.period)}
                </text>
              )}
            </g>
          )
        })}

        <polyline points={netPoints} fill="none" stroke="var(--ds-chart-net)" strokeWidth={1.5} strokeDasharray="3 3" />
        {items.map((item, index) => (
          <circle
            key={item.period}
            cx={PAD_LEFT + groupWidth * (index + 0.5)}
            cy={yOf(item.net)}
            r={2.5}
            fill="var(--ds-chart-net)"
          />
        ))}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-micro text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-[var(--ds-chart-income)]" aria-hidden />
          수입
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-[var(--ds-chart-expense)]" aria-hidden />
          지출
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-[var(--ds-chart-net)]" aria-hidden />
          순현금흐름
        </span>
      </figcaption>
    </figure>
  )
}
