import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '../../types/dashboard';
import { CHART_ACCENT, CHART_ACCENT_SOFT, chartTooltipStyle } from './chartTheme';

interface LineTrendChartProps {
  data: TrendPoint[];
}

function formatCurrency(value: number | string | readonly (number | string)[] | null | undefined) {
  const normalized =
    Array.isArray(value) && value.length > 0 ? value[0] : (value ?? 0);
  const numericValue = typeof normalized === 'number' ? normalized : Number(normalized);
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

export function LineTrendChart({ data }: LineTrendChartProps) {
  if (data.length === 1) {
    const point = data[0];

    return (
      <div
        className="flex w-full flex-col justify-center rounded-[var(--radius)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-6 py-8 text-center"
        aria-label="Single point trend summary"
      >
        <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
          단일 스냅샷
        </p>
        <p className="mt-4 text-3xl font-semibold tracking-tight text-[color:var(--color-text)]">
          {formatCurrency(point.amount)}
        </p>
        <p className="mt-3 text-sm text-[color:var(--color-text-muted)]">
          {point.period} 기준 값만 표시합니다. 추세 비교를 하려면 스냅샷이 더 필요합니다.
        </p>
      </div>
    );
  }

  return (
    <div className="h-72 w-full" aria-label="Monthly spend trend chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={288}>
        <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={CHART_ACCENT_SOFT} stopOpacity={0.45} />
              <stop offset="100%" stopColor={CHART_ACCENT_SOFT} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e4e4e7" strokeDasharray="4 4" />
          <XAxis
            axisLine={false}
            dataKey="period"
            tick={{ fill: '#71717a', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            tick={{ fill: '#71717a', fontSize: 12 }}
            tickFormatter={formatCurrency}
            tickLine={false}
            width={92}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value) => formatCurrency(value)}
            labelStyle={{ color: '#18181b', fontWeight: 600 }}
          />
          <Area
            dataKey="amount"
            fill="url(#trendGradient)"
            fillOpacity={1}
            stroke={CHART_ACCENT}
            strokeWidth={3}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
