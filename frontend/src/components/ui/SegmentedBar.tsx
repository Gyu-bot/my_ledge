interface Segment {
  label: string
  value: number      // 0–100
  color: string      // tailwind bg class or hex
}

interface SegmentedBarProps {
  segments: Segment[]
  height?: number
}

export function SegmentedBar({ segments, height = 20 }: SegmentedBarProps) {
  return (
    <div className="flex rounded overflow-hidden" style={{ height }}>
      {segments.map((seg) => (
        <div
          key={seg.label}
          className="flex items-center justify-center text-[9px] font-semibold text-white/80"
          style={{ width: `${seg.value}%`, background: seg.color }}
        >
          {seg.value >= 12 ? `${Math.round(seg.value)}%` : ''}
        </div>
      ))}
    </div>
  )
}
