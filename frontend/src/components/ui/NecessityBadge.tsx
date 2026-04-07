import { cn } from '../../lib/utils'

type Necessity = 'essential' | 'discretionary' | null

export function NecessityBadge({ value }: { value: Necessity }) {
  if (!value) return <span className="text-[9px] text-text-ghost">—</span>
  const isEssential = value === 'essential'
  return (
    <span className={cn(
      'inline-block text-[8px] px-1.5 py-0.5 rounded border',
      isEssential
        ? 'bg-[#062818] text-[#34d399] border-[#0d3b22]'
        : 'bg-warn-dim text-warn border-warn-muted',
    )}>
      {isEssential ? '필수' : '비필수'}
    </span>
  )
}
