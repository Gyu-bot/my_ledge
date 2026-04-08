import { cn } from '../../lib/utils'

interface SectionCardProps {
  title: string
  badge?: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

function renderMeta(meta?: React.ReactNode) {
  if (meta == null) return null
  if (typeof meta === 'string') {
    return (
      <span className="text-micro text-text-muted bg-surface-bar border border-border-subtle px-2 py-0.5 rounded-full">
        {meta}
      </span>
    )
  }
  return meta
}

export function SectionCard({
  title,
  badge,
  meta,
  action,
  description,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  const resolvedMeta = meta ?? badge
  return (
    <div className={cn('bg-surface-card border border-border rounded-card', className)}>
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border-subtle">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label font-semibold text-text-secondary tracking-wide">{title}</span>
            {renderMeta(resolvedMeta)}
          </div>
          {description != null && (
            <div className="mt-1 text-caption text-text-muted">
              {description}
            </div>
          )}
        </div>
        {action != null && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </div>
  )
}
