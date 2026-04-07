import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import type { NetWorthPoint } from '../../types/asset'
import { formatKRWCompact } from '../../lib/utils'

interface LineAreaChartProps {
  data: NetWorthPoint[]
  height?: number
}

export function LineAreaChart({ data, height = 130 }: LineAreaChartProps) {
  if (data.length <= 1) {
    return (
      <div className="flex items-center justify-center h-[130px] text-label text-text-ghost">
        시계열 데이터가 부족합니다 (2개 이상 스냅샷 필요)
      </div>
    )
  }

  const chartData = data.map((d) => ({
    date: d.snapshot_date.slice(5),
    value: parseFloat(d.net_worth),
  }))

  const last = chartData[chartData.length - 1]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 16, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: '#374151', fontSize: 9 }}
          axisLine={false} tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: '#0f1623', border: '1px solid #1a2035', borderRadius: 6, fontSize: 10 }}
          formatter={(value) => [`₩ ${formatKRWCompact(Number(value ?? 0))}`, '순자산']}
        />
        <Area
          type="monotone" dataKey="value"
          stroke="#10b981" strokeWidth={2}
          fill="url(#nwGrad)"
          dot={{ fill: '#0f1623', stroke: '#10b981', strokeWidth: 1.5, r: 3 }}
          activeDot={{ r: 5, fill: '#10b981' }}
        />
        <ReferenceDot x={last.date} y={last.value} r={5} fill="#10b981" stroke="none" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
