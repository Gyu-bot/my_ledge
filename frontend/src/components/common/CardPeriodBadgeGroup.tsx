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
      className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap"
      role="group"
    >
      <Badge className="shrink-0 whitespace-nowrap" variant="reference">{start}</Badge>
      {hasRange ? (
        <>
          <span className="shrink-0 text-sm text-[color:var(--color-text-muted)]">~</span>
          <Badge className="shrink-0 whitespace-nowrap" variant="reference">{end}</Badge>
        </>
      ) : null}
    </div>
  );
}
