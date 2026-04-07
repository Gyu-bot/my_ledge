import { cn } from '../../lib/utils'

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  subVariant?: 'up' | 'down' | 'neutral'
  className?: string
}

export function KpiCard({ label, value, sub, subVariant = 'neutral', className }: KpiCardProps) {
  const subColor = {
    up: 'text-accent',
    down: 'text-danger',
    neutral: 'text-text-ghost',
  }[subVariant]

  return (
    <div className={cn('bg-surface-card border border-border rounded-card px-4 py-3.5', className)}>
      <div className="text-caption text-text-faint tracking-wide mb-2">{label}</div>
      <div className="text-kpi font-bold leading-tight tracking-tight mb-1">{value}</div>
      {sub && (
        <div data-testid="kpi-sub" className={cn('text-caption', subColor)}>
          {sub}
        </div>
      )}
    </div>
  )
}
