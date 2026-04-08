import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { MonthlyCashflowItem } from '../../types/analytics'
import { formatKRWCompact } from '../../lib/utils'
import {
  AXIS_TICK_STYLE,
  CHART_ACCENT,
  CHART_ACCENT_MUTED,
  CHART_DANGER,
  CHART_DANGER_MUTED,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  getChartHoverFill,
} from '../../lib/chartTheme'

interface DualBarChartProps {
  data: MonthlyCashflowItem[]
  height?: number
}

export function DualBarChart({ data, height = 110 }: DualBarChartProps) {
  const chartData = data.map((d) => ({
    period: d.period.slice(5),
    income: d.income,
    expense: Math.abs(d.expense),
    isCurrent: d === data[data.length - 1],
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} barGap={2} barCategoryGap="30%">
        <XAxis
          dataKey="period"
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          itemStyle={CHART_TOOLTIP_ITEM_STYLE}
          cursor={{ fill: getChartHoverFill(CHART_ACCENT_MUTED) }}
          formatter={(value, name) => [
            `₩ ${formatKRWCompact(Number(value ?? 0))}`,
            name === 'income' ? '수입' : '지출',
          ]}
        />
        <Bar dataKey="income" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.isCurrent ? CHART_ACCENT : CHART_ACCENT_MUTED}
            />
          ))}
        </Bar>
        <Bar dataKey="expense" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.isCurrent ? CHART_DANGER : CHART_DANGER_MUTED}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
