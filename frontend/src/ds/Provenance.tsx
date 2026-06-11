import type { ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Info } from 'lucide-react'
import { cn } from '../lib/utils'

export interface ProvenanceRow {
  label: string
  value: ReactNode
}

interface ProvenanceProps {
  /** 팝오버 제목 — 값의 출처 한 줄 (예: "연결 거래 추정") */
  title: string
  rows?: ProvenanceRow[]
  /** 가정/제외 등 보충 설명 */
  note?: string
  /** 기본 ⓘ 아이콘 대신 쓸 트리거 (예: 예상 배지) */
  trigger?: ReactNode
  triggerLabel?: string
  className?: string
}

/**
 * 출처/근거 팝오버 — docs/frontend-remake/04-design-system.md §4.2
 * 모든 추정·자동·수동 값에 동일 구조: 출처 → 산출 기준 → 가정·제외 → 신뢰도.
 */
export function Provenance({ title, rows = [], note, trigger, triggerLabel, className }: ProvenanceProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        {trigger ? (
          <button type="button" aria-label={triggerLabel ?? `${title} 근거 보기`} className={cn('inline-flex', className)}>
            {trigger}
          </button>
        ) : (
          <button
            type="button"
            aria-label={triggerLabel ?? `${title} 근거 보기`}
            className={cn(
              'inline-flex h-4 w-4 items-center justify-center rounded-sm text-text-muted transition-colors duration-fast hover:text-text-secondary',
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-72 rounded-md border border-border bg-bg-raised p-3 shadow-raised"
        >
          <div className="text-label font-semibold text-text-primary">{title}</div>
          {rows.length > 0 && (
            <dl className="mt-2 space-y-1.5">
              {rows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-caption text-text-muted">{row.label}</dt>
                  <dd className="tnum text-right text-caption text-text-secondary">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {note ? <p className="mt-2 text-caption leading-relaxed text-text-muted">{note}</p> : null}
          <Popover.Arrow className="fill-[var(--ds-border-default)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
