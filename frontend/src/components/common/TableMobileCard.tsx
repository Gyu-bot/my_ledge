import type { ComponentProps } from 'react';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';

interface TableMobileCardRow {
  label: string;
  value: string;
}

interface TableMobileCardBadge {
  label: string;
  variant?: ComponentProps<typeof Badge>['variant'];
}

interface TableMobileCardProps {
  title: string;
  value?: string;
  subtitle?: string;
  rows: TableMobileCardRow[];
  badges?: TableMobileCardBadge[];
}

export function TableMobileCard({
  title,
  value,
  subtitle,
  rows,
  badges = [],
}: TableMobileCardProps) {
  return (
    <Card className="min-w-0 w-full max-w-full overflow-hidden bg-white/80">
      <CardContent className="min-w-0 w-full max-w-full space-y-3 p-4">
        <div
          className={
            value
              ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3'
              : 'min-w-0'
          }
        >
          <div className="min-w-0 flex-1">
            <p
              className="block min-w-0 truncate text-sm font-semibold text-[color:var(--color-text)]"
              title={title}
            >
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 min-w-0 truncate text-xs text-[color:var(--color-text-muted)]" title={subtitle}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {value ? (
            <p className="shrink-0 whitespace-nowrap text-right text-sm font-semibold text-[color:var(--color-text)]">
              {value}
            </p>
          ) : null}
        </div>

        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <Badge
                key={`${badge.variant ?? 'default'}-${badge.label}`}
                className="normal-case tracking-normal"
                variant={badge.variant}
              >
                {badge.label}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="grid gap-2 text-sm text-[color:var(--color-text-muted)]">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
              <span className="shrink-0">{row.label}</span>
              <span className="min-w-0 break-words text-right text-[color:var(--color-text)]">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
