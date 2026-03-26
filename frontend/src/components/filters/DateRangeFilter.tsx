interface DateRangeFilterProps {
  startMonth: string;
  endMonth: string;
  onStartMonthChange: (value: string) => void;
  onEndMonthChange: (value: string) => void;
}

export function DateRangeFilter({
  endMonth,
  onEndMonthChange,
  onStartMonthChange,
  startMonth,
}: DateRangeFilterProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block">
        <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
          시작 월
        </span>
        <input
          className="mt-1.5 w-full rounded-2xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-blue-100"
          onChange={(event) => onStartMonthChange(event.target.value)}
          type="month"
          value={startMonth}
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
          종료 월
        </span>
        <input
          className="mt-1.5 w-full rounded-2xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-blue-100"
          onChange={(event) => onEndMonthChange(event.target.value)}
          type="month"
          value={endMonth}
        />
      </label>
    </div>
  );
}
