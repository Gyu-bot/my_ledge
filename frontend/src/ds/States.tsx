import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { cn } from '../lib/utils'

interface EmptyStateProps {
  message: string
  /** 해결 액션 — "데이터 없음"으로 끝내지 않기 원칙 */
  actionLabel?: string
  actionTo?: string
  className?: string
  children?: ReactNode
}

export function EmptyState({ message, actionLabel, actionTo, className, children }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-8 text-center', className)}>
      <p className="text-label text-text-muted">{message}</p>
      {actionLabel && actionTo ? (
        <Link
          to={actionTo}
          className="rounded-md border border-accent-border bg-accent-bg px-3 py-1.5 text-caption font-medium text-accent transition-colors duration-fast hover:border-accent"
        >
          {actionLabel}
        </Link>
      ) : null}
      {children}
    </div>
  )
}

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ message = '데이터를 불러오지 못했습니다', onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-8 text-center', className)}>
      <p className="text-label text-text-muted">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-caption font-medium text-text-secondary transition-colors duration-fast hover:border-border-strong"
        >
          <RefreshCw className="h-3 w-3" />
          다시 시도
        </button>
      ) : null}
    </div>
  )
}
