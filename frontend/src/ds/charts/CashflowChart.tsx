import { formatMonthAxis, formatNetWon, formatSignedWon, formatWon } from '../format'

export interface CashflowChartItem {
  period: string
  income: number
  expense: number
  net: number
}

interface CashflowChartProps {
  items: CashflowChartItem[]
  height?: number
  outflowOnly?: boolean
  /** is_complete_month=false인 월 — 반투명 처리 + 진행중 표기 */
  incompletePeriods?: ReadonlySet<string>
  /** 범례 이름 (기본: 수입 / 지출 / 순현금흐름) */
  labels?: { income: string; expense: string; net: string }
}

const DEFAULT_LABELS = { income: '수입', expense: '지출', net: '순현금흐름' }

const VIRTUAL_WIDTH = 720
const PAD_LEFT = 52
const PAD_RIGHT = 8
const PAD_TOP = 8
const PAD_BOTTOM = 22

/**
 * 수입/지출 dual bar + 순현금흐름 라인 — 04-design-system.md §3.
 * 경량 커스텀 SVG (프로토타입 단계, recharts 미사용).
 */
export function CashflowChart({ items, height = 200, incompletePeriods, labels = DEFAULT_LABELS, outflowOnly = false }: CashflowChartProps) {
  if (items.length === 0) return null

  const plotWidth = VIRTUAL_WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = height - PAD_TOP - PAD_BOTTOM
  const values = items.flatMap(({ income, expense, net }) => outflowOnly ? [expense] : [income, expense, net])
  const domainMax = Math.max(1, ...values)
  const domainMin = Math.min(0, ...values)
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

  const gridValues = [
    ...domainMax > 1 || domainMin === 0 ? [domainMax, domainMax / 2] : [],
    ...domainMin < 0 ? [domainMin] : [],
  ]
  const chartLabel = outflowOnly ? labels.expense : `${labels.income}·${labels.expense}·${labels.net}`

  return (
    <figure className="m-0">
      <svg
        width="100%"
        viewBox={`0 0 ${VIRTUAL_WIDTH} ${height}`}
        role="img"
        aria-label={`최근 ${items.length}개월 ${chartLabel} 차트`}
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
              {formatNetWon(value, { compact: true })}
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
          const expenseY = yOf(item.expense)
          const incomplete = incompletePeriods?.has(item.period) ?? false
          return (
            <g key={item.period} opacity={incomplete ? 0.45 : 1}>
              <title>
                {`${item.period}${incomplete ? ' (진행중)' : ''} · ${labels.expense} ${formatNetWon(item.expense)}`}
                {outflowOnly ? '' : ` · ${labels.income} ${formatWon(item.income)} · ${labels.net} ${formatSignedWon(item.net)}`}
              </title>
              {outflowOnly ? null : <rect
                x={center - barWidth - 1.5}
                y={yOf(item.income)}
                width={barWidth}
                height={Math.max(0, incomeHeight)}
                rx={2}
                fill="var(--ds-chart-income)"
              />}
              <rect
                x={outflowOnly ? center - barWidth / 2 : center + 1.5}
                y={Math.min(zeroY, expenseY)}
                width={barWidth}
                height={Math.abs(zeroY - expenseY)}
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

        {outflowOnly ? null : <><polyline points={netPoints} fill="none" stroke="var(--ds-chart-net)" strokeWidth={1.5} strokeDasharray="3 3" />
        {items.map((item, index) => (
          <circle
            key={item.period}
            cx={PAD_LEFT + groupWidth * (index + 0.5)}
            cy={yOf(item.net)}
            r={2.5}
            fill="var(--ds-chart-net)"
          />
        ))}</>}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-micro text-text-muted">
        {outflowOnly ? null : <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-[var(--ds-chart-income)]" aria-hidden />
          {labels.income}
        </span>}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-[var(--ds-chart-expense)]" aria-hidden />
          {labels.expense}
        </span>
        {outflowOnly ? null : <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-[var(--ds-chart-net)]" aria-hidden />
          {labels.net}
        </span>}
      </figcaption>
    </figure>
  )
}
