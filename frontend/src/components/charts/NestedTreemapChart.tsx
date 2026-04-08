import { useMemo, useState } from 'react'
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
  value?: number
}

interface NestedTreemapChartProps {
  items: NestedTreemapNode[]
  height?: number
}

interface CustomCellProps extends Record<string, unknown> {
  drilldown?: boolean
}

function CustomCell({ drilldown, ...props }: CustomCellProps) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const height = Number(props.height ?? 0)
  const name = String(props.name ?? '')
  const category = String(props.category ?? props.name ?? '')

  if (width < 10 || height < 10) return <g />

  const baseColor = getCategoryColor(category)
  const fill = drilldown
    ? `color-mix(in srgb, ${baseColor} 82%, var(--color-surface-popover))`
    : baseColor
  const label = width > 52 && height > 24 ? name : ''

  return (
    <g>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(width - 2, 0)}
        height={Math.max(height - 2, 0)}
        rx={6}
        fill={fill}
        opacity={drilldown ? 0.96 : 0.9}
      />
      {label ? (
        <text
          x={x + 8}
          y={y + 17}
          fill="var(--chart-label-strong)"
          fontSize={drilldown ? 9 : 10}
          fontWeight={drilldown ? 600 : 700}
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}

export function NestedTreemapChart({ items, height = 440 }: NestedTreemapChartProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const topLevelItems = useMemo(
    () =>
      items.map((item) => ({
        name: item.name,
        category: item.name,
        size:
          item.value ??
          (item.children ?? []).reduce((sum, child) => sum + Number(child.size ?? 0), 0),
      })),
    [items],
  )

  const activeNode = useMemo(
    () => items.find((item) => item.name === activeCategory) ?? null,
    [activeCategory, items],
  )

  const chartItems = activeNode ? activeNode.children : topLevelItems

  const handleCategorySelect = (category: string) => {
    if (!items.some((item) => item.name === category)) return
    setActiveCategory(category)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-caption font-semibold text-text-secondary">
            {activeNode ? `${activeNode.name} 거래처` : '카테고리 기준'}
          </div>
          <div className="text-micro text-text-muted">
            {activeNode ? '선택한 카테고리 안에서 거래처별 비중을 확인합니다.' : '카테고리 타일이나 버튼을 눌러 거래처 단위로 drilldown 합니다.'}
          </div>
        </div>
        {activeNode ? (
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className="text-micro text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5"
          >
            카테고리로 돌아가기
          </button>
        ) : null}
      </div>

      {!activeNode ? (
        <div className="flex flex-wrap gap-2">
          {topLevelItems.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => handleCategorySelect(item.name)}
              aria-label={`${item.name} 드릴다운`}
              className="text-micro text-text-secondary bg-surface-bar border border-border-subtle rounded-full px-2.5 py-1"
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      <ResponsiveContainer width="100%" height={height}>
        <Treemap
          data={chartItems}
          dataKey="size"
          stroke="var(--color-surface-card)"
          content={<CustomCell drilldown={!!activeNode} />}
          aspectRatio={4 / 3}
          onClick={(node) => {
            if (activeNode) return
            const category = String(node?.category ?? node?.name ?? '')
            handleCategorySelect(category)
          }}
        >
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            formatter={(value, _name, payload) => {
              const category = String(payload?.payload?.category ?? payload?.payload?.name ?? '')
              return [
                `₩ ${formatKRWCompact(Number(value ?? 0))}`,
                activeNode ? `${category} · 거래처` : '카테고리',
              ]
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}
