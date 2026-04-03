import { describe, expect, it } from 'vitest';
import {
  CHART_ACCENT,
  CHART_ACCENT_SOFT,
  CHART_BAR_RADIUS_HORIZONTAL,
  CHART_BAR_RADIUS_VERTICAL,
  CHART_SERIES_COLORS,
  chartTooltipStyle,
} from './chartTheme';

describe('chartTheme', () => {
  it('uses a cross-hue chart palette instead of a single blue family', () => {
    expect(CHART_ACCENT).toBe('#223a5e');
    expect(CHART_ACCENT_SOFT).toBe('#e7edf5');
    expect(CHART_SERIES_COLORS).toEqual([
      '#223a5e',
      '#b6413b',
      '#c96a1b',
      '#8f302c',
      '#b42318',
      '#475569',
    ]);
  });

  it('keeps bar corners nearly square across chart types', () => {
    expect(CHART_BAR_RADIUS_VERTICAL).toEqual([2, 2, 0, 0]);
    expect(CHART_BAR_RADIUS_HORIZONTAL).toEqual([0, 2, 2, 0]);
  });

  it('uses an elevated tooltip surface shadow', () => {
    expect(chartTooltipStyle.boxShadow).toContain('rgba');
    expect(chartTooltipStyle.boxShadow).not.toBe('0 1px 2px 0 rgba(0, 0, 0, 0.05)');
  });
});
