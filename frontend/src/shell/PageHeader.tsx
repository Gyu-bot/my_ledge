import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

interface PageHeaderProps {
  title: string
  /** 페이지가 정의하는 헤더 컨트롤 (기간/기준 모드/스냅샷 메타) */
  controls?: ReactNode
  /** 우측 메타 배지 슬롯 (기준일, 건수 등) */
  meta?: ReactNode
  className?: string
}

/**
 * 페이지 sticky 헤더 — 페이지가 컨텐츠 최상단에서 직접 렌더한다.
 * (구 metaBadge 컨텍스트 플럼빙 폐지 — 03-wireframes.md §0)
 */
export function PageHeader({ title, controls, meta, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 -mx-4 mb-4 flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle bg-bg-base/90 px-4 py-2.5 backdrop-blur md:-mx-6 md:px-6',
        className,
      )}
    >
      <h1 className="text-title text-text-primary">{title}</h1>
      {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
      {meta ? <div className="ml-auto flex items-center gap-2 text-caption text-text-muted">{meta}</div> : null}
    </header>
  )
}
