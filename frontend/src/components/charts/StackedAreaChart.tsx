import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { CategoryTimelineItem } from '../../types/transaction'
import { formatKRWCompact } from '../../lib/utils'
import {
  AXIS_TICK_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  getChartHoverFill,
  getCategoryColor,
} from '../../lib/chartTheme'

interface StackedAreaChartProps {
  items: CategoryTimelineItem[]
  height?: number
}

export function StackedAreaChart({ items, height = 220 }: StackedAreaChartProps) {
  const periods = [...new Set(items.map((item) => item.period))].sort()
  const totals = new Map<string, number>()

  for (const item of items) {
    totals.set(item.category, (totals.get(item.category) ?? 0) + Math.abs(item.amount))
  }

  const topCategories = Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([category]) => category)

  const categories = [...topCategories, '기타']
  const data = periods.map((period) => {
    const row: Record<string, number | string> = { period: period.slice(5), fullPeriod: period }

    for (const category of categories) {
      row[category] = 0
    }

    for (const item of items.filter((entry) => entry.period === period)) {
      const targetCategory = topCategories.includes(item.category) ? item.category : '기타'
      row[targetCategory] = Number(row[targetCategory] ?? 0) + Math.abs(item.amount)
    }

    return row
  })

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="period" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            cursor={{ fill: getChartHoverFill('stacked-area') }}
            formatter={(value, name) => [`₩ ${formatKRWCompact(Number(value ?? 0))}`, String(name)]}
          />
          {categories.map((category) => (
            <Area
              key={category}
              type="monotone"
              dataKey={category}
              stackId="spending"
              stroke={getCategoryColor(category)}
              fill={getCategoryColor(category)}
              fillOpacity={category === '기타' ? 0.18 : 0.28}
              strokeWidth={1.5}
              activeDot={{ r: 4, fill: getCategoryColor(category) }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2.5 mt-3">
        {categories.map((category) => (
          <span key={category} className="flex items-center gap-1 text-micro text-text-muted">
            <span className="w-2 h-2 rounded-sm" style={{ background: getCategoryColor(category) }} />
            {category}
          </span>
        ))}
      </div>
    </div>
  )
}
