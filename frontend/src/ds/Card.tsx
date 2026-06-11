import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

interface CardProps {
  title?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function Card({ title, meta, action, children, className, bodyClassName }: CardProps) {
  return (
    <section className={cn('rounded-md border border-border bg-bg-surface', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-0">
          <div className="min-w-0">
            <h2 className="text-section text-text-secondary">{title}</h2>
            {meta ? <div className="mt-0.5 text-caption text-text-muted">{meta}</div> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
