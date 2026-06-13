import { useSyncExternalStore } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { dismissToast as dismiss, getToasts, subscribeToasts } from './toastStore'

export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  if (items.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-2.5 rounded-md border bg-bg-raised px-3 py-2.5 shadow-raised',
            item.variant === 'success' ? 'border-accent-border' : 'border-expense-border',
          )}
        >
          <span
            className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
              item.variant === 'success' ? 'bg-accent-bg text-accent' : 'bg-expense-bg text-expense',
            )}
          >
            {item.variant === 'success' ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-label font-semibold text-text-primary">{item.title}</div>
            {item.description ? <div className="mt-0.5 text-caption text-text-muted">{item.description}</div> : null}
            {item.action ? (
              <button
                type="button"
                onClick={() => {
                  item.action!.onClick()
                  dismiss(item.id)
                }}
                className="mt-1.5 text-caption font-medium text-accent hover:underline"
              >
                {item.action.label}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="알림 닫기"
            onClick={() => dismiss(item.id)}
            className="shrink-0 text-text-faint transition-colors duration-fast hover:text-text-secondary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
