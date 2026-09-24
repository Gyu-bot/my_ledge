import { formatNetWon, formatPct } from './format'

export interface BarSegment {
  label: string
  value: number
  color: string
}

interface SegmentedBarProps {
  segments: BarSegment[]
}

/** 비음수 구성만 비율로 표시한다. 환급으로 음수가 있으면 순액을 직접 비교한다. */
export function SegmentedBar({ segments }: SegmentedBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const canShowShares = total > 0 && segments.every((segment) => segment.value >= 0)
  const rawShares = segments.map((segment) => canShowShares ? segment.value / total * 100 : 0)
  const shares = rawShares.map(Math.floor)
  const remainderOrder = rawShares.map((share, index) => ({ index, fraction: share - shares[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
  const remainder = canShowShares ? 100 - shares.reduce((sum, share) => sum + share, 0) : 0
  for (const { index } of remainderOrder.slice(0, remainder)) shares[index] += 1

  return (
    <div>
      {canShowShares ? (
        <div className="flex h-2.5 overflow-hidden rounded-sm">
          {segments.map((segment, index) => (
            <div
              key={segment.label}
              style={{ width: `${rawShares[index]}%`, background: segment.color }}
              title={`${segment.label} ${formatPct(shares[index], 0)}`}
            />
          ))}
        </div>
      ) : (
        <p className="text-caption text-text-muted">
          {segments.some((segment) => segment.value < 0)
            ? '환급으로 음수 항목이 있어 비율 대신 순액을 표시합니다.'
            : '합계가 0원이어서 비율을 계산하지 않습니다.'}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-3 text-micro text-text-muted">
        {segments.map((segment, index) => (
          <span key={segment.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: segment.color }} aria-hidden />
            {segment.label} <span className="tnum font-semibold text-text-secondary">
              {canShowShares ? formatPct(shares[index], 0) : formatNetWon(segment.value)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
