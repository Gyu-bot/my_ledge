import { formatPct } from './format'
import { cn } from '../lib/utils'

interface CoverageGaugeProps {
  label: string
  /** 0~1 */
  ratio: number | null | undefined
  className?: string
}

/** 분류 커버리지 게이지 — 인박스 처리 진행을 보여주는 진행 표시 */
export function CoverageGauge({ label, ratio, className }: CoverageGaugeProps) {
  const pct = ratio == null ? null : Math.max(0, Math.min(1, ratio)) * 100
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="shrink-0 text-caption text-text-muted">{label}</span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-sm bg-bg-inset"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct == null ? undefined : Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {pct != null && (
          <div className="h-full rounded-sm bg-accent transition-[width] duration-base" style={{ width: `${pct}%` }} />
        )}
      </div>
      <span className="tnum shrink-0 text-caption font-semibold text-text-secondary">{formatPct(pct, 0)}</span>
    </div>
  )
}
