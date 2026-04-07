import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import type { NetWorthPoint } from '../../types/asset'
import { formatKRWCompact } from '../../lib/utils'
import { AXIS_TICK_STYLE, CHART_ACCENT, CHART_TOOLTIP_STYLE } from '../../lib/chartTheme'

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
            <stop offset="0%" stopColor={CHART_ACCENT} stopOpacity={0.25} />
            <stop offset="100%" stopColor={CHART_ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={AXIS_TICK_STYLE}
          axisLine={false} tickLine={false}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value) => [`₩ ${formatKRWCompact(Number(value ?? 0))}`, '순자산']}
        />
        <Area
          type="monotone" dataKey="value"
          stroke={CHART_ACCENT} strokeWidth={2}
          fill="url(#nwGrad)"
          dot={{ fill: 'var(--chart-tooltip-bg)', stroke: CHART_ACCENT, strokeWidth: 1.5, r: 3 }}
          activeDot={{ r: 5, fill: CHART_ACCENT }}
        />
        <ReferenceDot x={last.date} y={last.value} r={5} fill={CHART_ACCENT} stroke="none" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
