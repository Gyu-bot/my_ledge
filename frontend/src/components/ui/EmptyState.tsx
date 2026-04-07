import { cn } from '../../lib/utils'

interface EmptyStateProps {
  message?: string
  className?: string
}

export function EmptyState({ message = '데이터가 없습니다', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-10 gap-2', className)}>
      <div className="text-display opacity-30">○</div>
      <p className="text-label text-text-ghost">{message}</p>
    </div>
  )
}
