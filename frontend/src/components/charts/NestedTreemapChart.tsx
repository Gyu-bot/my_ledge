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

type TreemapViewMode = 'category' | 'merchant'

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
    ? `color-mix(in srgb, ${baseColor} 76%, var(--color-surface-popover))`
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
        stroke={`color-mix(in srgb, ${baseColor} 44%, var(--color-surface-card))`}
        strokeWidth={1}
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
  const [viewMode, setViewMode] = useState<TreemapViewMode>('category')

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

  const merchantItems = useMemo(() => {
    const grouped = new Map<string, { size: number; category: string }>()

    for (const node of items) {
      for (const child of node.children ?? []) {
        const current = grouped.get(child.name)
        const nextSize = Number(child.size ?? 0)

        if (!current) {
          grouped.set(child.name, { size: nextSize, category: child.category })
          continue
        }

        grouped.set(child.name, {
          size: current.size + nextSize,
          category: nextSize >= current.size ? child.category : current.category,
        })
      }
    }

    return Array.from(grouped.entries())
      .map(([name, item]) => ({ name, size: item.size, category: item.category }))
      .sort((left, right) => right.size - left.size)
  }, [items])

  const chartItems = viewMode === 'merchant'
    ? merchantItems
    : activeNode
      ? activeNode.children
      : topLevelItems

  const handleCategorySelect = (category: string) => {
    if (!items.some((item) => item.name === category)) return
    setActiveCategory(category)
  }

  const handleViewModeChange = (nextMode: TreemapViewMode) => {
    setViewMode(nextMode)
    if (nextMode === 'merchant') {
      setActiveCategory(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full bg-surface-bar p-0.5">
          {([
            ['category', '카테고리별'],
            ['merchant', '거래처별'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => handleViewModeChange(mode)}
              className={[
                'text-micro rounded-full px-3 py-1 transition-colors',
                viewMode === mode ? 'bg-surface-popover text-text-primary' : 'text-text-muted',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        {viewMode === 'category' && activeNode ? (
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className="text-micro text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5"
          >
            카테고리로 돌아가기
          </button>
        ) : null}
      </div>

      {viewMode === 'category' && activeNode ? (
        <div className="text-caption text-text-secondary">{activeNode.name} 거래처</div>
      ) : null}

      <ResponsiveContainer width="100%" height={height}>
        <Treemap
          data={chartItems}
          dataKey="size"
          stroke="var(--color-surface-card)"
          content={<CustomCell drilldown={!!activeNode} />}
          aspectRatio={4 / 3}
          onClick={(node) => {
            if (viewMode !== 'category' || activeNode) return
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
                viewMode === 'merchant'
                  ? `${category} · 거래처`
                  : activeNode
                    ? `${category} · 거래처`
                    : '카테고리',
              ]
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}
