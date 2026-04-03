import { Badge } from '../ui/badge';

interface CardPeriodBadgeGroupProps {
  ariaLabel: string;
  start: string;
  end?: string;
}

export function CardPeriodBadgeGroup({
  ariaLabel,
  start,
  end,
}: CardPeriodBadgeGroupProps) {
  const hasRange = end !== undefined && end !== start;

  return (
    <div
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-2"
      role="group"
    >
      <Badge variant="reference">{start}</Badge>
      {hasRange ? (
        <>
          <span className="text-sm text-[color:var(--color-text-muted)]">~</span>
          <Badge variant="reference">{end}</Badge>
        </>
      ) : null}
    </div>
  );
}
