/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[color:var(--color-primary)] text-white hover:bg-[color:var(--color-primary-strong)]',
        outline:
          'border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] hover:bg-[color:var(--color-accent-soft)] hover:text-[color:var(--color-accent)]',
        secondary:
          'bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)] hover:bg-[color:var(--color-primary-soft)]',
        destructive: 'bg-rose-600 text-white hover:bg-rose-700',
        ghost: 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-accent-soft)] hover:text-[color:var(--color-accent)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
