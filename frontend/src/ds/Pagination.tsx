import { cn } from '../lib/utils'

interface PaginationProps {
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({ page, perPage, total, onPageChange, className }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  if (pageCount <= 1) return null
  const buttonCls =
    'rounded-md border border-border px-2.5 py-1 text-caption text-text-secondary transition-colors duration-fast hover:border-border-strong disabled:opacity-40'
  return (
    <div className={cn('flex items-center justify-between gap-3 px-2 py-2', className)}>
      <span className="tnum text-caption text-text-muted">
        {page} / {pageCount} 페이지 · 총 {total.toLocaleString('ko-KR')}건
      </span>
      <div className="flex gap-1.5">
        <button type="button" className={buttonCls} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          이전
        </button>
        <button type="button" className={buttonCls} disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          다음
        </button>
      </div>
    </div>
  )
}
