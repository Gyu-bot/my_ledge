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
  fontSize: 10,
  color: 'var(--chart-tooltip-text)',
  boxShadow: '0 14px 30px rgba(4, 8, 18, 0.45)',
} as const
export const CHART_TOOLTIP_LABEL_STYLE = {
  color: 'var(--chart-tooltip-label)',
} as const
export const CHART_TOOLTIP_ITEM_STYLE = {
  color: 'var(--chart-tooltip-text)',
} as const

export const AXIS_TICK_STYLE = {
  fill: 'var(--chart-axis-text)',
  fontSize: 9,
} as const

export const CATEGORY_COLOR_MAP: Record<string, string> = {
  식비: 'var(--chart-category-food)',
  교통: 'var(--chart-category-transport)',
  구독: 'var(--chart-category-subscription)',
  쇼핑: 'var(--chart-category-shopping)',
  주거: 'var(--chart-category-housing)',
  의료: 'var(--chart-category-medical)',
  보험: 'var(--chart-category-insurance)',
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
