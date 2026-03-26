/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[color:var(--color-primary)] text-white shadow-[var(--shadow-glow)] hover:brightness-105',
        outline:
          'border border-[color:var(--color-border)] bg-white/90 text-[color:var(--color-text-muted)] hover:border-blue-200 hover:bg-blue-50 hover:text-[color:var(--color-primary)]',
        secondary:
          'bg-blue-50 text-[color:var(--color-primary)] hover:bg-blue-100',
        destructive: 'bg-rose-600 text-white hover:bg-rose-700',
        ghost: 'text-[color:var(--color-text-muted)] hover:bg-blue-50 hover:text-[color:var(--color-primary)]',
      },
      size: {
        default: 'h-11 px-5 py-3',
        sm: 'h-9 rounded-xl px-3',
        lg: 'h-12 rounded-2xl px-6',
        icon: 'h-10 w-10 rounded-xl',
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
