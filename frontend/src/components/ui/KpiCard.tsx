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
      <div className="text-[10px] text-text-faint tracking-wide mb-2">{label}</div>
      <div className="text-[18px] font-bold leading-tight tracking-tight mb-1">{value}</div>
      {sub && (
        <div data-testid="kpi-sub" className={cn('text-[10px]', subColor)}>
          {sub}
        </div>
      )}
    </div>
  )
}
