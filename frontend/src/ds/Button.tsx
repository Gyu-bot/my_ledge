import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANT_CLS: Record<Variant, string> = {
  primary: 'border-accent-border bg-accent-bg text-accent hover:border-accent',
  secondary: 'border-border text-text-secondary hover:border-border-strong',
  ghost: 'border-transparent text-text-muted hover:text-text-secondary',
  danger: 'border-expense-border bg-expense-bg text-expense hover:border-expense',
}

const SIZE_CLS: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-caption',
  md: 'px-3 py-1.5 text-caption',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors duration-fast disabled:opacity-40',
        VARIANT_CLS[variant],
        SIZE_CLS[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
