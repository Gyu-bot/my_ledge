import { CHART_ACCENT, CHART_ACCENT_SOFT } from './chartTheme';
import { cn } from '../../lib/utils';

export interface DailySpendCalendarItem {
  date: string;
  amount: number;
}

interface DailySpendCalendarProps {
  month: string;
  items: DailySpendCalendarItem[];
  maxAmount: number;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getIntensityStyle(amount: number, maxAmount: number) {
  const magnitude = Math.abs(amount);

  if (magnitude <= 0 || maxAmount <= 0) {
    return {
      backgroundColor: 'rgba(244, 244, 245, 0.9)',
      borderColor: 'rgba(228, 228, 231, 1)',
      color: 'var(--color-text-muted)',
    };
  }

  const ratio = Math.max(0.18, magnitude / maxAmount);
  const blue = ratio > 0.66 ? CHART_ACCENT : CHART_ACCENT_SOFT;
  const alpha = ratio > 0.66 ? 0.18 + ratio * 0.18 : 0.16 + ratio * 0.2;

  return {
    backgroundColor: blue === CHART_ACCENT ? `rgba(37, 99, 235, ${alpha})` : `rgba(147, 197, 253, ${alpha})`,
    borderColor: blue === CHART_ACCENT ? 'rgba(37, 99, 235, 0.18)' : 'rgba(147, 197, 253, 0.32)',
    color: 'var(--color-text)',
  };
}

export function DailySpendCalendar({ month, items, maxAmount }: DailySpendCalendarProps) {
  if (!month) {
    return null;
  }

  const [year, monthValue] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthValue, 0).getDate();
  const firstDayOfWeek = new Date(year, monthValue - 1, 1).getDay();
  const totalsByDate = new Map(items.map((item) => [item.date, item.amount]));
  const cells = [];

  for (let i = 0; i < firstDayOfWeek; i += 1) {
    cells.push(
      <div
        key={`empty-${i}`}
        aria-hidden="true"
        className="h-20 rounded-[var(--radius-sm)] border border-dashed border-transparent bg-transparent"
      />,
    );
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${`${day}`.padStart(2, '0')}`;
    const amount = totalsByDate.get(date) ?? 0;

    cells.push(
      <div
        key={date}
        aria-label={`${date} 지출 ${formatCurrency(amount)}`}
        className={cn(
          'flex h-20 flex-col justify-between rounded-[var(--radius-sm)] border p-2 transition-colors',
          amount !== 0 ? 'shadow-[var(--shadow-soft)]' : '',
        )}
        style={getIntensityStyle(amount, maxAmount)}
      >
        <span className="text-xs font-semibold">{day}</span>
        <span className="text-right text-[11px] font-medium leading-4">
          {amount !== 0 ? formatCurrency(amount) : '-'}
        </span>
      </div>,
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-2">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="rounded-[var(--radius-sm)] bg-zinc-100 px-2 py-2 text-center text-xs font-semibold text-[color:var(--color-text-subtle)]"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">{cells}</div>
    </div>
  );
}
