import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface CategoryBreakdownSlice {
  category: string;
  amount: number;
  share: number;
}

interface CategoryDonutChartProps {
  data: CategoryBreakdownSlice[];
}

const chartColors = ['#1E40AF', '#3B82F6', '#60A5FA', '#F59E0B', '#FBBF24', '#93C5FD'];
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
  payload?: Array<{ payload: CategoryBreakdownSlice }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const item = payload[0].payload;

  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/95 px-4 py-3 shadow-[var(--shadow-soft)]">
      <p className="text-sm font-semibold text-[color:var(--color-text)]">{item.category}</p>
      <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
        {formatCurrency(item.amount)}
      </p>
      <p className="mt-1 text-xs tracking-[0.16em] text-[color:var(--color-text-subtle)]">
        비중 {item.share.toFixed(1)}%
      </p>
    </div>
  );
}

export function CategoryDonutChart({ data }: CategoryDonutChartProps) {
  const displayData = toDisplayData(data);

  return (
    <div className="h-64 w-full" aria-label="카테고리 비중 차트">
      <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={256}>
        <PieChart>
          <Pie
            cx="50%"
            cy="50%"
            data={displayData}
            dataKey="amount"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={2}
          >
            {displayData.map((entry, index) => (
              <Cell key={entry.category} fill={chartColors[index % chartColors.length]} />
            ))}
          </Pie>
          <Tooltip
            content={<TooltipContent />}
            contentStyle={{
              borderRadius: '1rem',
              border: '1px solid rgba(148, 163, 184, 0.24)',
              boxShadow: '0 24px 48px -28px rgba(30, 64, 175, 0.38)',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
