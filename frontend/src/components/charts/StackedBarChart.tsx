import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
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

interface TooltipPayloadEntry {
  color?: string
  name?: string
  payload?: { total?: number }
  value?: number | string
}

interface StackedBarTooltipProps {
  active?: boolean
  label?: string
  payload?: TooltipPayloadEntry[]
}

function StackedBarTooltip({ active, label, payload = [] }: StackedBarTooltipProps) {
  if (!active || payload.length === 0) return null

  const total =
    Number(payload[0]?.payload?.total ?? 0) ||
    payload.reduce((sum, item) => sum + Number(item.value ?? 0), 0)
  const visibleItems = payload.filter((item) => Number(item.value ?? 0) > 0)

  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <div style={CHART_TOOLTIP_LABEL_STYLE}>{label}</div>
      <div className="mb-1 flex items-center justify-between gap-5 text-caption font-semibold text-text-primary">
        <span>총액</span>
        <span>{`₩ ${formatKRWCompact(total)}`}</span>
      </div>
      <div className="h-px bg-border-strong my-1.5" />
      <div className="flex flex-col gap-1">
        {visibleItems.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-5" style={CHART_TOOLTIP_ITEM_STYLE}>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
              {item.name}
            </span>
            <span>{`₩ ${formatKRWCompact(Number(item.value ?? 0))}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
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
    const row: Record<string, unknown> = { period: formatMonthAxisLabel(period), total: 0 }
    const grouped = new Map<string, number>()
    for (const item of items.filter((entry) => entry.period === period)) {
      const category = topCategories.includes(item.category) ? item.category : '기타'
      grouped.set(category, (grouped.get(category) ?? 0) + Math.abs(item.amount))
      row.total = Number(row.total ?? 0) + Math.abs(item.amount)
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
      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            margin={{ top: 30, right: 6, left: 4, bottom: 0 }}
            barCategoryGap="32%"
            maxBarSize={42}
          >
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
            content={<StackedBarTooltip />}
            cursor={{ fill: getChartHoverFill(CHART_NEUTRAL) }}
          />
          {categories.map((category) => (
            <Bar
              key={category}
              dataKey={category}
              stackId="spending"
              fill={getCategoryColor(category)}
              radius={[2, 2, 0, 0]}
            />
          ))}
          </BarChart>
        </ResponsiveContainer>
        <div
          className="pointer-events-none absolute left-0 right-0 top-1 grid px-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(data.length, 1)}, minmax(0, 1fr))` }}
        >
          {data.map((row) => (
            <span
              key={String(row.period)}
              data-testid="monthly-total-label"
              className="text-center text-micro font-semibold text-text-secondary"
            >
              {`₩ ${formatKRWCompact(Number(row.total ?? 0))}`}
            </span>
          ))}
        </div>
      </div>
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
