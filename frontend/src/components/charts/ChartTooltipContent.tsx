import type { ReactNode } from 'react';
import { CHART_TOOLTIP_SHADOW } from './chartTheme';

export interface ChartTooltipItem {
  color?: string;
  label: ReactNode;
  value: ReactNode;
}

interface ChartTooltipContentProps {
  footer?: ReactNode;
  items: ChartTooltipItem[];
  title?: ReactNode;
}

export function ChartTooltipContent({
  footer,
  items,
  title,
}: ChartTooltipContentProps) {
  return (
    <div
      className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-2 py-1.5"
      style={{ boxShadow: CHART_TOOLTIP_SHADOW }}
    >
      {title ? (
        <p className="text-xs font-semibold text-[color:var(--color-text)]">{title}</p>
      ) : null}
      <div className={title ? 'mt-1.5 space-y-1.5' : 'space-y-1.5'}>
        {items.map((item, index) => (
          <div
            key={`${String(item.label)}-${index}`}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex min-w-0 items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
              <span
                aria-hidden="true"
                data-testid="chart-tooltip-indicator"
                className="h-0.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color ?? '#223a5e' }}
              />
              <span className="truncate">{item.label}</span>
            </div>
            <span className="shrink-0 text-xs font-medium text-[color:var(--color-text)]">
              {item.value}
            </span>
          </div>
        ))}
      </div>
      {footer ? (
        <div className="mt-1.5 border-t border-[color:var(--color-border)] pt-1.5 text-[11px] tracking-[0.12em] text-[color:var(--color-text-subtle)]">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
