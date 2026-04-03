import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltipContent } from './ChartTooltipContent';
import { CHART_NEUTRALS, chartTooltipStyle } from './chartTheme';

interface CategoryBreakdownSlice {
  category: string;
  amount: number;
  share: number;
}

interface CategoryDonutChartProps {
  data: CategoryBreakdownSlice[];
}

const chartColors = CHART_NEUTRALS;
const VISIBLE_CATEGORY_COUNT = 5;

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

function toDisplayData(data: CategoryBreakdownSlice[]) {
  const primary = data.slice(0, VISIBLE_CATEGORY_COUNT);
  const overflow = data.slice(VISIBLE_CATEGORY_COUNT);

  if (overflow.length === 0) {
    return primary;
  }

  const other = overflow.reduce(
    (accumulator, item) => ({
      category: '기타',
      amount: accumulator.amount + item.amount,
      share: accumulator.share + item.share,
    }),
    { category: '기타', amount: 0, share: 0 },
  );

  return [...primary, other];
}

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; payload: CategoryBreakdownSlice }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const item = payload[0].payload;
  const color = payload[0].color ?? '#223a5e';

  return (
    <ChartTooltipContent
      footer={`비중 ${item.share.toFixed(1)}%`}
      items={[
        {
          color,
          label: item.category,
          value: formatCurrency(item.amount),
        },
      ]}
    />
  );
}

export function CategoryDonutChart({ data }: CategoryDonutChartProps) {
  const displayData = toDisplayData(data);

  return (
    <div className="h-64 w-full" aria-label="카테고리 비중 차트">
      <ResponsiveContainer width="100%" height="100%" minHeight={256}>
        <PieChart>
          <Pie
            cx="50%"
            cy="50%"
            data={displayData}
            dataKey="amount"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={1}
            stroke="#ffffff"
            strokeWidth={1}
          >
            {displayData.map((entry, index) => (
              <Cell key={entry.category} fill={chartColors[index % chartColors.length]} />
            ))}
          </Pie>
          <Tooltip
            content={<TooltipContent />}
            contentStyle={chartTooltipStyle}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
