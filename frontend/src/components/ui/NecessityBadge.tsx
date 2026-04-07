import { cn } from '../../lib/utils'

type Necessity = 'essential' | 'discretionary' | null

export function NecessityBadge({ value }: { value: Necessity }) {
  if (!value) return <span className="text-micro text-text-ghost">—</span>
  const isEssential = value === 'essential'
  return (
    <span className={cn(
      'inline-block text-nano px-1.5 py-0.5 rounded border',
      isEssential
        ? 'bg-accent-dim text-accent-bright border-accent-muted'
        : 'bg-warn-dim text-warn border-warn-muted',
    )}>
      {isEssential ? '필수' : '비필수'}
    </span>
  )
}
