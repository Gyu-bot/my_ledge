import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface HorizontalBarDatum {
  label: string;
  amount: number;
}

interface HorizontalBarChartProps {
  data: HorizontalBarDatum[];
  ariaLabel: string;
}

function formatCurrency(value: number | string | readonly (number | string)[] | null | undefined) {
  const normalized = Array.isArray(value) && value.length > 0 ? value[0] : (value ?? 0);
  const numericValue = typeof normalized === 'number' ? normalized : Number(normalized);

  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

export function HorizontalBarChart({ ariaLabel, data }: HorizontalBarChartProps) {
  return (
    <div className="h-72 w-full" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={288}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
          <CartesianGrid horizontal={false} stroke="rgba(148, 163, 184, 0.18)" />
          <XAxis
            axisLine={false}
            tick={{ fill: '#475569', fontSize: 12 }}
            tickFormatter={formatCurrency}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="label"
            tick={{ fill: '#1E3A8A', fontSize: 12 }}
            tickLine={false}
            type="category"
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
          <Bar dataKey="amount" fill="#1E40AF" radius={[0, 10, 10, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
