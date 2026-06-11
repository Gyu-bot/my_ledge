import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export type BadgeVariant =
  | 'neutral'
  | 'accent'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'warn'
  | 'estimate'

const VARIANT_CLS: Record<BadgeVariant, string> = {
  neutral: 'text-text-secondary bg-bg-inset border-border',
  accent: 'text-accent bg-accent-bg border-accent-border',
  income: 'text-income bg-income-bg border-income-border',
  expense: 'text-expense bg-expense-bg border-expense-border',
  transfer: 'text-transfer bg-transfer-bg border-transfer-border',
  warn: 'text-warn bg-warn-bg border-warn-border',
  estimate: 'text-estimate bg-estimate-bg border-estimate-border',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-micro font-medium',
        VARIANT_CLS[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
