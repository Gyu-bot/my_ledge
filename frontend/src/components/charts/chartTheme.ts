export const CHART_ACCENT = '#223a5e';
export const CHART_ACCENT_SOFT = '#e7edf5';
export const CHART_SECONDARY = '#c96a1b';
export const CHART_COMPLEMENTARY = '#b6413b';
export const CHART_INFO = '#8f302c';
export const CHART_DANGER = '#b42318';
export const CHART_MUTED = '#475569';
export const CHART_SERIES_COLORS = [
  CHART_ACCENT,
  CHART_COMPLEMENTARY,
  CHART_SECONDARY,
  CHART_INFO,
  CHART_DANGER,
  CHART_MUTED,
];
export const CHART_NEUTRALS = CHART_SERIES_COLORS;
export const CHART_BAR_RADIUS_VERTICAL: [number, number, number, number] = [2, 2, 0, 0];
export const CHART_BAR_RADIUS_HORIZONTAL: [number, number, number, number] = [0, 2, 2, 0];
export const CHART_TOOLTIP_SHADOW =
  '0 20px 44px -20px rgba(15, 23, 42, 0.32), 0 12px 24px -20px rgba(15, 23, 42, 0.22)';

export const chartTooltipStyle = {
  borderRadius: '0.75rem',
  border: '1px solid #e4e4e7',
  boxShadow: CHART_TOOLTIP_SHADOW,
};
