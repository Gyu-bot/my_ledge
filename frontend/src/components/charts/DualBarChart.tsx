import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { MonthlyCashflowItem } from '../../types/analytics'
import { formatKRWCompact } from '../../lib/utils'

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
          tick={{ fill: '#374151', fontSize: 9 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: '#0f1623', border: '1px solid #1a2035', borderRadius: 6, fontSize: 10 }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(value, name) => [
            `₩ ${formatKRWCompact(Number(value ?? 0))}`,
            name === 'income' ? '수입' : '지출',
          ]}
        />
        <Bar dataKey="income" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.isCurrent ? '#10b981' : '#1f3b2e'} />
          ))}
        </Bar>
        <Bar dataKey="expense" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.isCurrent ? '#f87171' : '#2d1a1a'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
