import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { CategoryTimelineItem } from '../../types/transaction'
import { formatKRWCompact } from '../../lib/utils'

const CATEGORY_COLORS: Record<string, string> = {
  식비: '#2563a8', 교통: '#059669', 구독: '#7c3aed',
  쇼핑: '#dc2626', 주거: '#d97706', 의료: '#0891b2',
  보험: '#7c3aed', 기타: '#374151',
}

function getColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? '#4b5563'
}

interface StackedBarChartProps {
  items: CategoryTimelineItem[]
  height?: number
}

export function StackedBarChart({ items, height = 160 }: StackedBarChartProps) {
  const periods = [...new Set(items.map((i) => i.period))].sort()
  const categories = [...new Set(items.map((i) => i.category))]

  const data = periods.map((period) => {
    const row: Record<string, unknown> = { period: period.slice(5) }
    for (const cat of categories) {
      const found = items.find((i) => i.period === period && i.category === cat)
      row[cat] = found ? Math.abs(found.amount) : 0
    }
    return row
  })

  const latestPeriod = periods[periods.length - 1]?.slice(5)

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barCategoryGap="20%">
          <XAxis
            dataKey="period"
            tick={(props: Record<string, unknown>) => {
              const x = Number(props.x ?? 0)
              const y = Number(props.y ?? 0)
              const payload = props.payload as { value: string }
              return (
                <text x={x} y={y + 10} textAnchor="middle" fontSize={9}
                  fill={payload.value === latestPeriod ? '#6ee7b7' : '#374151'}>
                  {payload.value}
                </text>
              )
            }}
            axisLine={false} tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#0f1623', border: '1px solid #1a2035', borderRadius: 6, fontSize: 10 }}
            formatter={(value, name) => [`₩ ${formatKRWCompact(Number(value ?? 0))}`, String(name)]}
          />
          {categories.map((cat) => (
            <Bar key={cat} dataKey={cat} stackId="a" fill={getColor(cat)}
              radius={cat === categories[categories.length - 1] ? [2, 2, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2.5 mt-2">
        {categories.map((cat) => (
          <span key={cat} className="flex items-center gap-1 text-[9px] text-text-muted">
            <span className="w-2 h-2 rounded-sm" style={{ background: getColor(cat) }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  )
}
