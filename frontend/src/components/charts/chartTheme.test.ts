import { describe, expect, it } from 'vitest';
import {
  CHART_ACCENT,
  CHART_ACCENT_SOFT,
  CHART_BAR_RADIUS_HORIZONTAL,
  CHART_BAR_RADIUS_VERTICAL,
  CHART_SERIES_COLORS,
} from './chartTheme';

describe('chartTheme', () => {
  it('uses a cross-hue chart palette instead of a single blue family', () => {
    expect(CHART_ACCENT).toBe('#2563eb');
    expect(CHART_ACCENT_SOFT).toBe('#bfdbfe');
    expect(CHART_SERIES_COLORS).toEqual([
      '#2563eb',
      '#0f766e',
      '#d97706',
      '#7c3aed',
      '#dc2626',
      '#475569',
    ]);
  });

  it('keeps bar corners nearly square across chart types', () => {
    expect(CHART_BAR_RADIUS_VERTICAL).toEqual([2, 2, 0, 0]);
    expect(CHART_BAR_RADIUS_HORIZONTAL).toEqual([0, 2, 2, 0]);
  });
});
