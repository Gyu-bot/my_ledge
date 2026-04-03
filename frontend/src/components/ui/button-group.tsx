import type { PropsWithChildren } from 'react';
import { cn } from '../../lib/utils';

export function ButtonGroup({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] shadow-[var(--shadow-soft)] [&>*:not(:first-child)]:border-l [&>*:not(:first-child)]:border-[color:var(--color-border)]',
        className,
      )}
      role="group"
    >
      {children}
    </div>
  );
}
