import { cn } from '../../lib/utils'

interface SectionCardProps {
  title: string
  badge?: string
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

export function SectionCard({ title, badge, children, className, bodyClassName }: SectionCardProps) {
  return (
    <div className={cn('bg-surface-card border border-border rounded-card', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="text-[11px] font-semibold text-text-secondary tracking-wide">{title}</span>
        {badge && (
          <span className="text-[9px] text-text-faint bg-surface-bar border border-border-strong px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </div>
  )
}
