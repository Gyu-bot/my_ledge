/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.16em]',
  {
    variants: {
      variant: {
        default: 'border-blue-100 bg-blue-50 text-[color:var(--color-primary)]',
        secondary: 'border-slate-200 bg-white/80 text-[color:var(--color-text-muted)]',
        accent: 'border-amber-100 bg-amber-50 text-amber-700',
        destructive: 'border-rose-100 bg-rose-50 text-rose-700',
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
