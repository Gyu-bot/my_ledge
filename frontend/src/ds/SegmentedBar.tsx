import { formatPct } from './format'

export interface BarSegment {
  label: string
  value: number // 비율 합 100 기준이 아니어도 됨 — 내부 정규화
  color: string
}

interface SegmentedBarProps {
  segments: BarSegment[]
}

/** 비율 표시 segmented bar — 도넛 금지 원칙의 대체 (04-design-system.md §3) */
export function SegmentedBar({ segments }: SegmentedBarProps) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  if (total <= 0) return null
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-sm">
        {segments.map((segment) => (
          <div
            key={segment.label}
            style={{ width: `${(Math.max(0, segment.value) / total) * 100}%`, background: segment.color }}
            title={`${segment.label} ${formatPct((segment.value / total) * 100)}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-3 text-micro text-text-muted">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: segment.color }} aria-hidden />
            {segment.label} <span className="tnum font-semibold text-text-secondary">{formatPct((segment.value / total) * 100, 0)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
