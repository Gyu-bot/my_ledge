import type { CSSProperties } from 'react'
import { cn } from '../lib/utils'

interface SkeletonProps {
  className?: string
  style?: CSSProperties
}

/** 형태 보존 스켈레톤 — 스피너 금지 원칙 (05-detail-design.md 공통 규약) */
export function Skeleton({ className, style }: SkeletonProps) {
  return <div aria-hidden className={cn('animate-pulse rounded-sm bg-bg-inset', className)} style={style} />
}

export function StatSkeleton({ hero = false }: { hero?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-bg-surface p-4" role="status" aria-label="불러오는 중">
      <Skeleton className="h-3 w-20" />
      <Skeleton className={cn('mt-2', hero ? 'h-9 w-44' : 'h-7 w-28')} />
      <Skeleton className="mt-2 h-3 w-24" />
    </div>
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" role="status" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  const ratios = [0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.5, 0.7, 0.4, 0.6, 0.8, 0.5]
  return (
    <div className="flex items-end gap-2" style={{ height }} role="status" aria-label="불러오는 중">
      {ratios.map((ratio, index) => (
        <Skeleton key={index} className="flex-1" style={{ height: `${ratio * 100}%` }} />
      ))}
    </div>
  )
}
