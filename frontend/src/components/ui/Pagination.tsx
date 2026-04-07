import { cn } from '../../lib/utils'

interface PaginationProps {
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({ page, perPage, total, onPageChange, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const start = Math.min((page - 1) * perPage + 1, total)
  const end = Math.min(page * perPage, total)

  const btnClass = (active = false, disabled = false) =>
    cn(
      'text-micro px-2 py-1 rounded border',
      active
        ? 'border-accent text-accent bg-accent-dim'
        : 'border-border-strong text-text-ghost bg-transparent',
      disabled && 'opacity-30 cursor-not-allowed pointer-events-none',
    )

  const pages = buildPages(page, totalPages)

  return (
    <div className={cn('flex items-center justify-between px-2.5 py-2.5 border-t border-border-subtle', className)}>
      <span className="text-caption text-text-faint">
        {start}–{end} / {total}건
      </span>
      <div className="flex gap-1 items-center">
        <button
          className={btnClass(false, page === 1)}
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="‹"
        >‹</button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="text-caption text-text-ghost px-1">…</span>
          ) : (
            <button key={p} className={btnClass(p === page)} onClick={() => onPageChange(p as number)}>
              {p}
            </button>
          )
        )}
        <button
          className={btnClass(false, page === totalPages)}
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="›"
        >›</button>
      </div>
    </div>
  )
}

function buildPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total]
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}
