import { describe, expect, it } from 'vitest'
import {
  AXIS_TICK_STYLE,
  CATEGORY_COLOR_MAP,
  CHART_ACCENT,
  CHART_DANGER,
  CHART_NEUTRAL,
  CHART_TOOLTIP_CLASSNAME,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_LABEL_CLASSNAME,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_VALUE_CLASSNAME,
  TREEMAP_COLORS,
  getChartHoverFill,
  getCategoryColor,
} from '../../lib/chartTheme'

describe('chartTheme', () => {
  it('exposes semantic css variable references for core chart colors', () => {
    expect(CHART_ACCENT).toBe('var(--chart-accent)')
    expect(CHART_DANGER).toBe('var(--chart-danger)')
    expect(CHART_NEUTRAL).toBe('var(--chart-neutral)')
  })

  it('returns category-specific colors with a semantic fallback', () => {
    expect(CATEGORY_COLOR_MAP.금융).toBe('var(--chart-category-finance)')
    expect(CATEGORY_COLOR_MAP['문화/여가']).toBe('var(--chart-category-culture)')
    expect(getCategoryColor('금융')).toBe('var(--chart-category-finance)')
    expect(getCategoryColor('문화/여가')).toBe('var(--chart-category-culture)')
    expect(getCategoryColor('알 수 없음')).toBe('var(--chart-category-fallback)')
  })

  it('provides stable tooltip and axis styles', () => {
    expect(AXIS_TICK_STYLE).toEqual({ fill: 'var(--chart-axis-text)', fontSize: 12 })
    expect(CHART_TOOLTIP_CLASSNAME).toBe('chart-tooltip-shell')
    expect(CHART_TOOLTIP_LABEL_CLASSNAME).toBe('chart-tooltip-label')
    expect(CHART_TOOLTIP_VALUE_CLASSNAME).toBe('chart-tooltip-value')
    expect(CHART_TOOLTIP_STYLE).toEqual({
      background: 'var(--chart-tooltip-bg)',
      border: '1px solid var(--chart-tooltip-border)',
      borderRadius: 6,
      fontSize: 15,
      color: 'var(--chart-tooltip-text)',
      boxShadow: 'var(--chart-tooltip-shadow)',
    })
    expect(CHART_TOOLTIP_LABEL_STYLE).toEqual({ color: 'var(--chart-tooltip-label)' })
    expect(CHART_TOOLTIP_ITEM_STYLE).toEqual({ color: 'var(--chart-tooltip-text)' })
  })

  it('derives semantic hover fills for chart active states', () => {
    expect(getChartHoverFill(CHART_ACCENT)).toBe('var(--chart-hover-accent)')
    expect(getChartHoverFill(CHART_DANGER)).toBe('var(--chart-hover-danger)')
    expect(getChartHoverFill('var(--custom-token)')).toBe('var(--chart-hover-default)')
  })

  it('keeps a deterministic treemap palette', () => {
    expect(TREEMAP_COLORS).toHaveLength(8)
    expect(TREEMAP_COLORS[0]).toBe('var(--chart-treemap-1)')
    expect(TREEMAP_COLORS[7]).toBe('var(--chart-treemap-8)')
  })
})
