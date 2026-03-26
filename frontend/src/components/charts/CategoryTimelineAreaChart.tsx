import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SectionPlaceholder } from '../common/SectionPlaceholder';

export interface CategoryTimelinePoint {
  period: string;
  values: Record<string, number>;
}

interface CategoryTimelineAreaChartProps {
  data: CategoryTimelinePoint[];
  categories: string[];
}

const SERIES_COLORS = ['#1D4ED8', '#3B82F6', '#60A5FA', '#F59E0B', '#F97316', '#FB7185'];

function formatCurrency(value: number | string | readonly (number | string)[] | null | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  const numericValue = typeof normalized === 'number' ? normalized : Number(normalized ?? 0);
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(numericValue);
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
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white/85 px-3 py-1 text-xs font-medium text-[color:var(--color-text-muted)]"
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
          <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
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
              formatter={(value, name) => [formatCurrency(value), name]}
              labelStyle={{ color: '#1E3A8A', fontWeight: 600 }}
            />
            {categories.map((category, index) => (
              <Area
                key={category}
                type="monotone"
                dataKey={category}
                stackId="category-spend"
                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                fillOpacity={0.72}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
