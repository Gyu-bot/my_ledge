import type { SpendingBreakdownDatum } from '../../hooks/useSpending';

interface CategoryBreakdownTableProps {
  rows: SpendingBreakdownDatum[];
  title: string;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShare(share: number) {
  return `${share.toFixed(1)}%`;
}

export function CategoryBreakdownTable({ rows, title }: CategoryBreakdownTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[color:var(--color-border)] bg-white/70 px-5 py-10 text-sm leading-6 text-[color:var(--color-text-muted)]">
        선택한 기간에 표시할 {title} 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-white/75 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            {title} 표
          </p>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            비중과 금액을 함께 확인합니다.
          </p>
        </div>
        <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
          {rows.length}개
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[color:var(--color-border)]">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="bg-slate-50/90 text-xs uppercase tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            <tr>
              <th className="px-4 py-3 text-left font-medium">카테고리</th>
              <th className="px-4 py-3 text-right font-medium">비중</th>
              <th className="px-4 py-3 text-right font-medium">금액</th>
            </tr>
          </thead>
          <tbody className="bg-white/90">
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-t border-[color:rgba(148,163,184,0.14)] text-sm text-[color:var(--color-text)]"
              >
                <td className="px-4 py-3 font-medium text-[color:var(--color-text)]">{row.label}</td>
                <td className="px-4 py-3 text-right text-[color:var(--color-text-muted)]">
                  {formatShare(row.share)}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
