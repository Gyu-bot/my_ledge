import type { RecentTransaction } from '../../types/dashboard';

interface TransactionsTableProps {
  rows: RecentTransaction[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);
}

export function TransactionsTable({ rows }: TransactionsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="hidden min-w-full border-separate border-spacing-y-2 md:table">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">
            <th className="px-4 pb-2 font-medium">Date</th>
            <th className="px-4 pb-2 font-medium">Description</th>
            <th className="px-4 pb-2 font-medium">Category</th>
            <th className="px-4 pb-2 font-medium">Payment</th>
            <th className="px-4 pb-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="rounded-2xl bg-white/80 shadow-[0_12px_24px_-18px_rgba(30,64,175,0.35)]">
              <td className="rounded-l-2xl px-4 py-4 text-sm text-[color:var(--color-text-muted)]">
                {row.date ?? '-'}
              </td>
              <td className="px-4 py-4 text-sm font-medium text-[color:var(--color-text)]">
                {row.description}
              </td>
              <td className="px-4 py-4 text-sm text-[color:var(--color-text-muted)]">
                {row.effective_category_major}
              </td>
              <td className="px-4 py-4 text-sm text-[color:var(--color-text-muted)]">
                {row.payment_method ?? 'N/A'}
              </td>
              <td className="rounded-r-2xl px-4 py-4 text-right text-sm font-semibold text-[color:var(--color-text)]">
                {formatCurrency(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[color:var(--color-text)]">
                  {row.description}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  {row.date ?? '-'}
                </p>
              </div>
              <p className="text-sm font-semibold text-[color:var(--color-text)]">
                {formatCurrency(row.amount)}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--color-text-muted)]">
              <span className="rounded-full bg-blue-50 px-3 py-1">{row.effective_category_major}</span>
              <span className="rounded-full bg-amber-50 px-3 py-1">
                {row.payment_method ?? 'N/A'}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
