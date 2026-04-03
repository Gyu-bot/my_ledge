import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_ACCENT,
  CHART_ACCENT_SOFT,
  CHART_BAR_RADIUS_HORIZONTAL,
} from './chartTheme';
import { ChartTooltipContent } from './ChartTooltipContent';

export interface HorizontalBarDatum {
  label: string;
  amount: number;
}

interface HorizontalBarChartProps {
  data: HorizontalBarDatum[];
  ariaLabel: string;
  heightClassName?: string;
  labelWidth?: number;
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

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HorizontalBarDatum }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const item = payload[0].payload;

  return (
    <ChartTooltipContent
      title={item.label}
      items={[
        {
          color: CHART_ACCENT,
          label: '금액',
          value: formatCurrency(item.amount),
        },
      ]}
    />
  );
}

export function HorizontalBarChart({
  ariaLabel,
  data,
  heightClassName = 'h-72',
  labelWidth = 92,
}: HorizontalBarChartProps) {
  return (
    <div className={`${heightClassName} w-full`} aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%" minHeight={288}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
          <CartesianGrid horizontal={false} stroke="#e4e4e7" />
          <XAxis
            axisLine={false}
            tick={{ fill: '#71717a', fontSize: 12 }}
            tickFormatter={formatCurrency}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="label"
            tick={{ fill: '#52525b', fontSize: 12 }}
            tickLine={false}
            type="category"
            width={labelWidth}
          />
          <Tooltip content={<TooltipContent />} cursor={{ fill: CHART_ACCENT_SOFT }} />
          <Bar dataKey="amount" fill={CHART_ACCENT} radius={CHART_BAR_RADIUS_HORIZONTAL} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
