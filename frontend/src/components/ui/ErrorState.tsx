import { cn } from '../../lib/utils'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ message = '불러오는 중 오류가 발생했습니다', onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-10 gap-3', className)}>
      <p className="text-label text-danger">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-caption px-3 py-1.5 border border-border-strong rounded-md text-text-ghost hover:text-text-secondary"
        >
          다시 시도
        </button>
      )}
    </div>
  )
}
