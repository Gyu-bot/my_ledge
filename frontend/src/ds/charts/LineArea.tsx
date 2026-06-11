import { formatDay, formatWon, formatWonCompact } from '../format'

export interface LineAreaPoint {
  label: string // 날짜/월
  value: number
}

interface LineAreaProps {
  points: LineAreaPoint[]
  height?: number
  ariaLabel: string
}

const WIDTH = 720
const PAD_LEFT = 56
const PAD_RIGHT = 10
const PAD_TOP = 10
const PAD_BOTTOM = 22

/** 순자산 추이 등 시계열 line + soft area (04-design-system.md §3) */
export function LineArea({ points, height = 220, ariaLabel }: LineAreaProps) {
  if (points.length === 0) return null

  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = height - PAD_TOP - PAD_BOTTOM
  const xOf = (index: number) =>
    PAD_LEFT + (points.length === 1 ? plotWidth / 2 : (plotWidth * index) / (points.length - 1))
  const yOf = (value: number) => PAD_TOP + plotHeight * (1 - (value - min) / span)

  const linePoints = points.map((point, index) => `${xOf(index).toFixed(1)},${yOf(point.value).toFixed(1)}`)
  const areaPath = [
    `M ${xOf(0).toFixed(1)} ${(PAD_TOP + plotHeight).toFixed(1)}`,
    ...linePoints.map((pt) => `L ${pt.replace(',', ' ')}`),
    `L ${xOf(points.length - 1).toFixed(1)} ${(PAD_TOP + plotHeight).toFixed(1)} Z`,
  ].join(' ')
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))

  return (
    <svg width="100%" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={ariaLabel}>
      {[max, (max + min) / 2, min].map((value) => (
        <g key={value}>
          <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yOf(value)} y2={yOf(value)} stroke="var(--ds-chart-grid)" />
          <text x={PAD_LEFT - 6} y={yOf(value) + 3} textAnchor="end" fontSize={10} fill="var(--ds-chart-axis)">
            {formatWonCompact(value)}
          </text>
        </g>
      ))}
      <path d={areaPath} fill="var(--ds-accent-bg)" />
      <polyline
        points={linePoints.join(' ')}
        fill="none"
        stroke="var(--ds-accent-fg)"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <g key={point.label}>
          <circle cx={xOf(index)} cy={yOf(point.value)} r={2.5} fill="var(--ds-accent-fg)">
            <title>{`${point.label} · ${formatWon(point.value)}`}</title>
          </circle>
          {index % labelEvery === 0 && (
            <text x={xOf(index)} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--ds-chart-axis)">
              {point.label.length === 10 ? formatDay(point.label) : point.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
