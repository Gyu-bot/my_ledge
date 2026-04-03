import type { SummaryCard } from '../../types/dashboard';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';
import { getCardGroupSurfaceClass } from './cardGroupSurface';

interface StatusCardProps extends SummaryCard {
  tone?: 'primary' | 'accent';
}

export function StatusCard({ label, value, detail, tone = 'primary' }: StatusCardProps) {
  return (
    <Card
      className={cn(
        'p-0',
        getCardGroupSurfaceClass(tone),
        tone === 'accent'
          ? 'border-[color:var(--color-accent)]'
          : 'border-[color:var(--color-primary)]',
      )}
    >
      <CardContent className="p-4">
        <p className="text-sm font-medium text-[color:var(--color-text-muted)]">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--color-text)] sm:text-3xl">
          {value}
        </p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">{detail}</p>
      </CardContent>
    </Card>
  );
}
