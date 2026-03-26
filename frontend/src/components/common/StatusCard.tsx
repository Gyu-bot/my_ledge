import type { SummaryCard } from '../../types/dashboard';

interface StatusCardProps extends SummaryCard {
  tone?: 'primary' | 'accent';
}

export function StatusCard({ label, value, detail, tone = 'primary' }: StatusCardProps) {
  const toneClass =
    tone === 'accent'
      ? 'border-amber-200 bg-gradient-to-br from-white via-amber-50 to-amber-100/70'
      : 'border-blue-200 bg-gradient-to-br from-white via-blue-50 to-slate-50';

  return (
    <article
      className={`rounded-[1.5rem] border p-5 shadow-[var(--shadow-soft)] transition-transform duration-200 motion-reduce:transition-none hover:-translate-y-0.5 ${toneClass}`}
    >
      <p className="text-sm font-medium text-[color:var(--color-text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--color-text)]">
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-[color:var(--color-text-muted)]">{detail}</p>
    </article>
  );
}
