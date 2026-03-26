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
  return (
    <div className="h-72 w-full" aria-label="Monthly spend trend chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={288}>
        <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 4" />
          <XAxis
            axisLine={false}
            dataKey="period"
            tick={{ fill: '#475569', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            tick={{ fill: '#475569', fontSize: 12 }}
            tickFormatter={formatCurrency}
            tickLine={false}
            width={92}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '1rem',
              border: '1px solid rgba(148, 163, 184, 0.24)',
              boxShadow: '0 24px 48px -28px rgba(30, 64, 175, 0.38)',
            }}
            formatter={(value) => formatCurrency(value)}
            labelStyle={{ color: '#1E3A8A', fontWeight: 600 }}
          />
          <Area
            dataKey="amount"
            fill="url(#trendGradient)"
            fillOpacity={1}
            stroke="#1E40AF"
            strokeWidth={3}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
