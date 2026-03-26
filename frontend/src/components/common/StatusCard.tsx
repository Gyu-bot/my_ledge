import type { SummaryCard } from '../../types/dashboard';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';

interface StatusCardProps extends SummaryCard {
  tone?: 'primary' | 'accent';
}

export function StatusCard({ label, value, detail, tone = 'primary' }: StatusCardProps) {
  const toneClass =
    tone === 'accent'
      ? 'border-[color:var(--color-accent-soft)] bg-[color:var(--color-accent-soft)]'
      : 'border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)]';

  return (
    <Card
      className={cn(
        'p-0',
        toneClass,
      )}
    >
      <CardContent className="p-5">
        <p className="text-sm font-medium text-[color:var(--color-text-muted)]">{label}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--color-text)]">
          {value}
        </p>
        <p className="mt-3 text-sm leading-6 text-[color:var(--color-text-muted)]">{detail}</p>
      </CardContent>
    </Card>
  );
}
