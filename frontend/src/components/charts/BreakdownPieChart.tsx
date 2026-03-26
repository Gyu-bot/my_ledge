import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SpendingBreakdownDatum } from '../../hooks/useSpending';

interface BreakdownPieChartProps {
  ariaLabel: string;
  data: SpendingBreakdownDatum[];
}

const chartColors = ['#1E40AF', '#3B82F6', '#60A5FA', '#F59E0B', '#FBBF24', '#93C5FD'];

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

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SpendingBreakdownDatum }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const item = payload[0].payload;

  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/95 px-4 py-3 shadow-[var(--shadow-soft)]">
      <p className="text-sm font-semibold text-[color:var(--color-text)]">{item.label}</p>
      <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">{formatCurrency(item.amount)}</p>
      <p className="mt-1 text-xs tracking-[0.16em] text-[color:var(--color-text-subtle)]">
        비중 {item.share.toFixed(1)}%
      </p>
    </div>
  );
}

export function BreakdownPieChart({ ariaLabel, data }: BreakdownPieChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[color:var(--color-border)] bg-white/70 px-6 py-16 text-center text-sm leading-6 text-[color:var(--color-text-muted)]">
        선택한 기간에 표시할 비중 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="h-80 w-full" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={288}>
        <PieChart>
          <Pie
            cx="50%"
            cy="50%"
            data={data}
            dataKey="amount"
            outerRadius={110}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
            ))}
          </Pie>
          <Tooltip content={<TooltipContent />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
