import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-[var(--radius-sm)] border px-4 py-3 text-sm',
  {
    variants: {
      variant: {
        default: 'border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-text-muted)]',
        warning: 'border-amber-200 bg-amber-50 text-amber-950',
        destructive: 'border-rose-200 bg-rose-50 text-rose-900',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('mt-2 text-sm leading-6', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
