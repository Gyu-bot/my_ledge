import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface DetailPanelProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('data-panel-backdrop'))
}

/**
 * 우측 슬라이드 패널 (모바일은 풀 시트) — 04-design-system.md §4.2
 * 키보드: 열리면 본문의 첫 입력으로 초점이 가고, Tab은 패널 안에서만 돌며,
 * Esc로 닫으면 패널을 연 요소로 초점이 돌아간다.
 */
export function DetailPanel({ open, onClose, title, subtitle, children, footer }: DetailPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // 연 요소를 기억했다가 닫힐 때 돌려준다. 본문의 autoFocus가 초점을 먼저 옮기므로
  // 열리는 순간의 렌더에서 기억한다.
  const openerRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  if (open && !wasOpenRef.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  wasOpenRef.current = open

  useEffect(() => {
    if (!open) return
    const opener = openerRef.current
    const panel = panelRef.current
    // 본문이 스스로 초점을 잡지 않았으면 첫 입력(없으면 패널)으로 보낸다.
    if (!panel?.contains(document.activeElement)) {
      const first = bodyRef.current ? focusables(bodyRef.current)[0] : undefined
      ;(first ?? panel)?.focus()
    }
    return () => {
      if (opener && opener.isConnected) opener.focus()
    }
  }, [open])

  function trapTab(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab' || !panelRef.current) return
    const items = focusables(panelRef.current)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="패널 닫기"
        tabIndex={-1}
        data-panel-backdrop=""
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={trapTab}
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
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <footer className="border-t border-border-subtle px-4 py-3">{footer}</footer> : null}
      </aside>
    </div>
  )
}
