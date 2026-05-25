import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { FixedCostTrendItem } from '../../types/analytics'
import { formatKRWCompact, formatMonthAxisLabel } from '../../lib/utils'
import {
  AXIS_TICK_STYLE,
  CHART_ACCENT,
  CHART_ACCENT_MUTED,
  CHART_INFO_SOFT,
  CHART_NEUTRAL_MUTED,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  CHART_WARNING,
  getChartHoverFill,
} from '../../lib/chartTheme'

type FixedCostTrendMode = 'cost-kind' | 'fixed-necessity'

interface FixedCostTrendChartProps {
  items: FixedCostTrendItem[]
  mode: FixedCostTrendMode
  height?: number
}

interface SeriesDefinition {
  key: string
  label: string
  color: string
}

interface TooltipPayloadEntry {
  color?: string
  name?: string
  payload?: { total?: number }
  value?: number | string
}

interface FixedCostTrendTooltipProps {
  active?: boolean
  label?: string
  payload?: TooltipPayloadEntry[]
}

const SERIES_BY_MODE: Record<FixedCostTrendMode, SeriesDefinition[]> = {
  'cost-kind': [
    { key: 'fixed_total', label: '고정비', color: CHART_INFO_SOFT },
    { key: 'variable_total', label: '변동비', color: CHART_ACCENT },
    { key: 'unclassified_total', label: '미분류', color: CHART_NEUTRAL_MUTED },
  ],
  'fixed-necessity': [
    { key: 'essential_fixed_total', label: '필수 고정비', color: CHART_ACCENT_MUTED },
    { key: 'discretionary_fixed_total', label: '비필수 고정비', color: CHART_WARNING },
    { key: 'unclassified_fixed_total', label: '필수 여부 미분류', color: CHART_NEUTRAL_MUTED },
  ],
}

function FixedCostTrendTooltip({ active, label, payload = [] }: FixedCostTrendTooltipProps) {
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

function buildChartRows(items: FixedCostTrendItem[], mode: FixedCostTrendMode) {
  return items.map((item) => {
    const unclassifiedFixedTotal = Math.max(
      item.fixed_total - item.essential_fixed_total - item.discretionary_fixed_total,
      0,
    )
    const total = mode === 'fixed-necessity' ? item.fixed_total : item.expense_total
    return {
      period: formatMonthAxisLabel(item.period),
      fixed_total: item.fixed_total,
      variable_total: item.variable_total,
      unclassified_total: item.unclassified_total,
      essential_fixed_total: item.essential_fixed_total,
      discretionary_fixed_total: item.discretionary_fixed_total,
      unclassified_fixed_total: unclassifiedFixedTotal,
      total,
    }
  })
}

export function FixedCostTrendChart({ items, mode, height = 190 }: FixedCostTrendChartProps) {
  const series = SERIES_BY_MODE[mode]
  const data = buildChartRows(items, mode)

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 18, right: 6, left: 4, bottom: 0 }}
          barCategoryGap="32%"
          maxBarSize={42}
        >
          <XAxis
            dataKey="period"
            tick={AXIS_TICK_STYLE}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<FixedCostTrendTooltip />}
            cursor={{ fill: getChartHoverFill(CHART_INFO_SOFT) }}
          />
          {series.map((item) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.label}
              stackId="fixed-cost"
              fill={item.color}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-2.5">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-1 text-micro text-text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
