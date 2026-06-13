import type { ReactNode } from 'react'

interface BulkBarProps {
  count: number
  children: ReactNode
  /** preview/확인 행 (선택) */
  preview?: ReactNode
  onClear: () => void
}

/** 선택 시 하단 고정 일괄 작업 바 — 04-design-system.md §4.2 */
export function BulkBar({ count, children, preview, onClear }: BulkBarProps) {
  if (count === 0) return null
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-2 border-t border-border bg-bg-raised px-4 py-3 shadow-raised md:-mx-6 md:px-6">
      <div className="mx-auto flex max-w-content flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption font-semibold text-accent">{count}건 선택됨</span>
          <div className="flex flex-wrap items-center gap-2">{children}</div>
          <button
            type="button"
            onClick={onClear}
            className="ml-auto rounded-md border border-border px-2.5 py-1 text-caption text-text-muted transition-colors duration-fast hover:border-border-strong"
          >
            선택 해제
          </button>
        </div>
        {preview ? <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2">{preview}</div> : null}
      </div>
    </div>
  )
}
