/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-[var(--radius-xs)] border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-[color:var(--color-primary-soft)] bg-[color:var(--color-primary-soft)] text-[color:var(--color-primary-strong)]',
        secondary:
          'border-[color:var(--color-secondary-soft)] bg-[color:var(--color-secondary-soft)] text-[color:var(--color-secondary-strong)]',
        accent:
          'border-[color:var(--color-accent-soft)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent-strong)]',
        reference:
          'border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]',
        destructive:
          'border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
