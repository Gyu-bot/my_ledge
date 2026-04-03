import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { SectionPlaceholder } from '../common/SectionPlaceholder';
import {
  CHART_BAR_RADIUS_VERTICAL,
  CHART_NEUTRALS,
  CHART_TOOLTIP_SHADOW,
} from './chartTheme';

export interface CategoryTimelinePoint {
  period: string;
  values: Record<string, number>;
}

interface CategoryTimelineAreaChartProps {
  data: CategoryTimelinePoint[];
  categories: string[];
}

const SERIES_COLORS = CHART_NEUTRALS;

function formatCurrency(value: number | string | readonly (number | string)[] | null | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  const numericValue = typeof normalized === 'number' ? normalized : Number(normalized ?? 0);
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function TooltipContent({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ color?: string; name?: string; value?: number | string }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2"
      style={{ boxShadow: CHART_TOOLTIP_SHADOW }}
    >
      <p className="text-sm font-semibold text-[color:var(--color-text)]">{label}</p>
      <div className="mt-2 space-y-1.5">
        {payload.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center justify-between gap-4 text-sm text-[color:var(--color-text-muted)]"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-px w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color ?? '#223a5e' }}
              />
              <span>{entry.name}</span>
            </div>
            <span className="font-medium text-[color:var(--color-text)]">
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryTimelineAreaChart({
  data,
  categories,
}: CategoryTimelineAreaChartProps) {
  if (data.length === 0 || categories.length === 0) {
    return (
      <SectionPlaceholder
        title="월별 카테고리 추이 데이터 없음"
        description="선택한 조건에서 월별 카테고리 시계열 데이터를 찾지 못했습니다."
      />
    );
  }

  const chartData: Array<Record<string, string | number>> = data.map((item) => ({
    period: item.period,
    ...item.values,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {categories.map((category, index) => (
          <span
            key={category}
            className="inline-flex items-center gap-2 rounded-[var(--radius-xs)] border border-[color:var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--color-text-muted)]"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
            />
            {category}
          </span>
        ))}
      </div>

      <div className="h-80 w-full" aria-label="Monthly category spend trend chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={320}>
          <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="4 4" />
            <XAxis
              axisLine={false}
              dataKey="period"
              tick={{ fill: '#71717a', fontSize: 12 }}
              tickLine={false}
            />
            <Tooltip content={<TooltipContent />} />
            {categories.map((category, index) => (
              <Bar
                key={category}
                dataKey={category}
                stackId="category-spend"
                fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                maxBarSize={48}
                radius={CHART_BAR_RADIUS_VERTICAL}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
