import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface DetailPanelProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** 우측 슬라이드 패널 (모바일은 풀 시트) — 04-design-system.md §4.2 */
export function DetailPanel({ open, onClose, title, subtitle, children, footer }: DetailPanelProps) {
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="패널 닫기"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label={title}
        className="relative flex h-full w-full max-w-[380px] flex-col border-l border-border bg-bg-surface shadow-raised duration-base"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-section text-text-primary">{title}</h2>
            {subtitle ? <div className="mt-0.5 text-caption text-text-muted">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="shrink-0 text-text-muted transition-colors duration-fast hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <footer className="border-t border-border-subtle px-4 py-3">{footer}</footer> : null}
      </aside>
    </div>
  )
}
