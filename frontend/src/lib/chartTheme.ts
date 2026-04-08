export const CHART_ACCENT = 'var(--chart-accent)'
export const CHART_ACCENT_MUTED = 'var(--chart-accent-muted)'
export const CHART_ACCENT_BRIGHT = 'var(--chart-accent-bright)'
export const CHART_DANGER = 'var(--chart-danger)'
export const CHART_DANGER_MUTED = 'var(--chart-danger-muted)'
export const CHART_NEUTRAL = 'var(--chart-neutral)'
export const CHART_NEUTRAL_MUTED = 'var(--chart-neutral-muted)'
export const CHART_INFO = 'var(--chart-info)'
export const CHART_INFO_SOFT = 'var(--chart-info-soft)'
export const CHART_WARNING = 'var(--chart-warning)'
export const CHART_WARNING_MUTED = 'var(--chart-warning-muted)'

export const CHART_TOOLTIP_STYLE = {
  background: 'var(--chart-tooltip-bg)',
  border: '1px solid var(--chart-tooltip-border)',
  borderRadius: 6,
  fontSize: 15,
  color: 'var(--chart-tooltip-text)',
  boxShadow: 'var(--chart-tooltip-shadow)',
} as const
export const CHART_TOOLTIP_CLASSNAME = 'chart-tooltip-shell'
export const CHART_TOOLTIP_LABEL_CLASSNAME = 'chart-tooltip-label'
export const CHART_TOOLTIP_VALUE_CLASSNAME = 'chart-tooltip-value'
export const CHART_TOOLTIP_LABEL_STYLE = {
  color: 'var(--chart-tooltip-label)',
} as const
export const CHART_TOOLTIP_ITEM_STYLE = {
  color: 'var(--chart-tooltip-text)',
} as const

export const AXIS_TICK_STYLE = {
  fill: 'var(--chart-axis-text)',
  fontSize: 12,
} as const

export const CATEGORY_COLOR_MAP: Record<string, string> = {
  금융: 'var(--chart-category-finance)',
  데이트: 'var(--chart-category-dating)',
  식비: 'var(--chart-category-food)',
  미분류: 'var(--chart-category-uncategorized)',
  주거: 'var(--chart-category-housing)',
  '주거/통신': 'var(--chart-category-housing)',
  '여행/숙박': 'var(--chart-category-travel)',
  자동차: 'var(--chart-category-auto)',
  '문화/여가': 'var(--chart-category-culture)',
  기타: 'var(--chart-category-other)',
}

export const TREEMAP_COLORS = [
  'var(--chart-treemap-1)',
  'var(--chart-treemap-2)',
  'var(--chart-treemap-3)',
  'var(--chart-treemap-4)',
  'var(--chart-treemap-5)',
  'var(--chart-treemap-6)',
  'var(--chart-treemap-7)',
  'var(--chart-treemap-8)',
] as const

export function getCategoryColor(category: string): string {
  return CATEGORY_COLOR_MAP[category] ?? 'var(--chart-category-fallback)'
}

export function getChartHoverFill(color: string): string {
  if (color === CHART_ACCENT || color === CHART_ACCENT_MUTED || color === CHART_ACCENT_BRIGHT) {
    return 'var(--chart-hover-accent)'
  }
  if (color === CHART_DANGER || color === CHART_DANGER_MUTED) {
    return 'var(--chart-hover-danger)'
  }
  return 'var(--chart-hover-default)'
}
