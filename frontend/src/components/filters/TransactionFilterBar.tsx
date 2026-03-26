import { DateRangeFilter } from './DateRangeFilter';

export interface TransactionFilterValues {
  start_month: string;
  end_month: string;
  category_major: string;
  payment_method: string;
  search: string;
}

interface TransactionFilterBarProps {
  values: TransactionFilterValues;
  categoryOptions: string[];
  paymentMethodOptions: string[];
  onApply: (next: TransactionFilterValues) => void;
  onReset: () => void;
}

export function TransactionFilterBar({
  categoryOptions,
  onApply,
  onReset,
  paymentMethodOptions,
  values,
}: TransactionFilterBarProps) {
  return (
    <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <DateRangeFilter
            startMonth={values.start_month}
            endMonth={values.end_month}
            onStartMonthChange={(start_month) => onApply({ ...values, start_month })}
            onEndMonthChange={(end_month) => onApply({ ...values, end_month })}
          />
        </div>

        <label className="min-w-[11rem]">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            카테고리
          </span>
          <select
            className="mt-1.5 w-full rounded-2xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-blue-100"
            onChange={(event) => onApply({ ...values, category_major: event.target.value })}
            value={values.category_major}
          >
            <option value="">전체</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[11rem]">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            결제수단
          </span>
          <select
            className="mt-1.5 w-full rounded-2xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-blue-100"
            onChange={(event) => onApply({ ...values, payment_method: event.target.value })}
            value={values.payment_method}
          >
            <option value="">전체</option>
            {paymentMethodOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[14rem] flex-1">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            검색
          </span>
          <input
            className="mt-1.5 w-full rounded-2xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-primary)] focus:ring-2 focus:ring-blue-100"
            onChange={(event) => onApply({ ...values, search: event.target.value })}
            placeholder="거래 설명 검색"
            value={values.search}
          />
        </label>

        <button
          className="inline-flex h-[3.125rem] items-center justify-center rounded-2xl border border-[color:var(--color-border)] bg-white px-5 text-sm font-semibold text-[color:var(--color-text-muted)] transition hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)]"
          onClick={onReset}
          type="button"
        >
          초기화
        </button>
      </div>
    </section>
  );
}
