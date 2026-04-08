import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { CategoryTimelineItem } from '../../types/transaction'
import { formatKRWCompact, formatMonthAxisLabel } from '../../lib/utils'
import {
  CHART_ACCENT_BRIGHT,
  CHART_NEUTRAL,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  getCategoryColor,
  getChartHoverFill,
} from '../../lib/chartTheme'

interface StackedBarChartProps {
  items: CategoryTimelineItem[]
  height?: number
}

function buildChartData(items: CategoryTimelineItem[]) {
  const periods = [...new Set(items.map((item) => item.period))].sort()
  const totals = new Map<string, number>()
  for (const item of items) {
    totals.set(item.category, (totals.get(item.category) ?? 0) + Math.abs(item.amount))
  }

  const topCategories = Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([category]) => category)
  const categories = topCategories.includes('기타') ? topCategories : [...topCategories, '기타']

  const data = periods.map((period) => {
    const row: Record<string, unknown> = { period: formatMonthAxisLabel(period) }
    const grouped = new Map<string, number>()
    for (const item of items.filter((entry) => entry.period === period)) {
      const category = topCategories.includes(item.category) ? item.category : '기타'
      grouped.set(category, (grouped.get(category) ?? 0) + Math.abs(item.amount))
    }
    for (const category of categories) {
      row[category] = grouped.get(category) ?? 0
    }
    return row
  })

  return {
    data,
    categories,
    latestPeriod: periods[periods.length - 1] ? formatMonthAxisLabel(periods[periods.length - 1]!) : undefined,
  }
}

export function StackedBarChart({ items, height = 180 }: StackedBarChartProps) {
  const { data, categories, latestPeriod } = buildChartData(items)

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 12, right: 6, left: 4, bottom: 0 }}>
          <defs>
            {categories.map((category) => (
              <linearGradient key={category} id={`stack-grad-${category}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={getCategoryColor(category)} stopOpacity={0.72} />
                <stop offset="100%" stopColor={getCategoryColor(category)} stopOpacity={0.08} />
              </linearGradient>
            ))}
          </defs>
          <XAxis
            dataKey="period"
            tick={(props: Record<string, unknown>) => {
              const x = Number(props.x ?? 0)
              const y = Number(props.y ?? 0)
              const payload = props.payload as { value: string }
              return (
                <text
                  x={x}
                  y={y + 10}
                  textAnchor="middle"
                  fontSize={12}
                  fill={payload.value === latestPeriod ? CHART_ACCENT_BRIGHT : CHART_NEUTRAL}
                >
                  {payload.value}
                </text>
              )
            }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            cursor={{ fill: getChartHoverFill(CHART_NEUTRAL) }}
            formatter={(value, name) => [`₩ ${formatKRWCompact(Number(value ?? 0))}`, String(name)]}
          />
          {categories.map((category) => (
            <Area
              key={category}
              type="monotone"
              dataKey={category}
              stackId="a"
              stroke={getCategoryColor(category)}
              strokeWidth={1.6}
              fill={`url(#stack-grad-${category})`}
              activeDot={{
                r: 4,
                fill: getCategoryColor(category),
                stroke: 'var(--chart-tooltip-bg)',
                strokeWidth: 1,
              }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-2.5">
        {categories.map((category) => (
          <span key={category} className="flex items-center gap-1 text-micro text-text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: getCategoryColor(category) }} />
            {category}
          </span>
        ))}
      </div>
    </div>
  )
}
