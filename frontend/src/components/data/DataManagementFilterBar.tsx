export interface DataManagementFilterValues {
  search: string;
  category_major: string;
  payment_method: string;
  include_deleted: boolean;
}

interface DataManagementFilterBarProps {
  values: DataManagementFilterValues;
  categoryOptions: string[];
  paymentMethodOptions: string[];
  onApply: (next: DataManagementFilterValues) => void;
  onReset: () => void;
}

export function DataManagementFilterBar({
  values,
  categoryOptions,
  paymentMethodOptions,
  onApply,
  onReset,
}: DataManagementFilterBarProps) {
  return (
    <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-5 shadow-[var(--shadow-soft)]">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,0.8fr))_auto]">
        <label className="space-y-2">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            검색
          </span>
          <input
            type="search"
            value={values.search}
            onChange={(event) => onApply({ ...values, search: event.target.value })}
            placeholder="거래 설명 또는 메모 검색"
            className="w-full rounded-2xl border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            대분류
          </span>
          <select
            value={values.category_major}
            onChange={(event) => onApply({ ...values, category_major: event.target.value })}
            className="w-full rounded-2xl border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">전체</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            결제수단
          </span>
          <select
            value={values.payment_method}
            onChange={(event) => onApply({ ...values, payment_method: event.target.value })}
            className="w-full rounded-2xl border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">전체</option>
            {paymentMethodOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-end">
          <span className="flex w-full items-center gap-3 rounded-2xl border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm text-[color:var(--color-text)]">
            <input
              type="checkbox"
              checked={values.include_deleted}
              onChange={(event) => onApply({ ...values, include_deleted: event.target.checked })}
              className="h-4 w-4 rounded border-[color:var(--color-border)] text-[color:var(--color-primary)] focus:ring-blue-200"
            />
            삭제된 거래 포함
          </span>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onReset}
            className="w-full rounded-2xl border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm font-medium text-[color:var(--color-text-muted)] transition hover:border-blue-200 hover:bg-blue-50"
          >
            필터 초기화
          </button>
        </div>
      </div>
    </section>
  );
}
