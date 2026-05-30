import { cn } from '../../lib/utils'

type AlertVariant = 'success' | 'error' | 'warn'

const styles: Record<AlertVariant, string> = {
  success: 'bg-accent-dim border border-accent-muted text-accent',
  error:   'bg-danger-dim border border-danger-muted text-danger',
  warn:    'bg-warn-dim border border-warn-muted text-warn',
}

interface AlertBannerProps {
  variant: AlertVariant
  title: string
  description?: string
  timestamp?: string
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
}

export function AlertBanner({ variant, title, description, timestamp, actionLabel, onAction, onDismiss }: AlertBannerProps) {
  return (
    <div className={cn('flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-label', styles[variant])}>
      <span className="font-semibold shrink-0">{title}</span>
      {description && <span className="text-caption opacity-80">{description}</span>}
      {timestamp && <span className="text-micro opacity-50 ml-auto shrink-0">{timestamp}</span>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="ml-auto text-caption font-semibold underline underline-offset-2 hover:opacity-80">
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} className="ml-2 opacity-50 hover:opacity-80 text-body-sm">✕</button>
      )}
    </div>
  )
}
