import { ResponsiveContainer, Tooltip, Treemap } from 'recharts'
import { formatKRWCompact } from '../../lib/utils'
import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
  getCategoryColor,
} from '../../lib/chartTheme'

interface NestedTreemapLeaf extends Record<string, string | number | undefined> {
  name: string
  size: number
  category: string
}

interface NestedTreemapNode extends Record<string, string | number | NestedTreemapLeaf[] | undefined> {
  name: string
  children: NestedTreemapLeaf[]
}

interface NestedTreemapChartProps {
  items: NestedTreemapNode[]
  height?: number
}

function CustomCell(props: Record<string, unknown>) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const height = Number(props.height ?? 0)
  const name = String(props.name ?? '')
  const depth = Number(props.depth ?? 0)
  const category = String(props.category ?? props.name ?? '')

  if (width < 8 || height < 8) return <g />

  const fill = depth <= 1 ? getCategoryColor(category) : `color-mix(in srgb, ${getCategoryColor(category)} 82%, var(--color-surface-card))`
  const label = width > 44 && height > 20 ? name : ''

  return (
    <g>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(width - 2, 0)}
        height={Math.max(height - 2, 0)}
        rx={4}
        fill={fill}
        opacity={depth <= 1 ? 0.85 : 1}
      />
      {label ? (
        <text
          x={x + 8}
          y={y + 16}
          fill="var(--chart-label-strong)"
          fontSize={depth <= 1 ? 10 : 9}
          fontWeight={depth <= 1 ? 700 : 600}
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}

export function NestedTreemapChart({ items, height = 220 }: NestedTreemapChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={items}
        dataKey="size"
        stroke="var(--color-surface-card)"
        content={<CustomCell />}
        aspectRatio={4 / 3}
      >
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          itemStyle={CHART_TOOLTIP_ITEM_STYLE}
          formatter={(value, _name, payload) => {
            const category = String(payload?.payload?.category ?? payload?.payload?.name ?? '')
            return [`₩ ${formatKRWCompact(Number(value ?? 0))}`, category]
          }}
        />
      </Treemap>
    </ResponsiveContainer>
  )
}
