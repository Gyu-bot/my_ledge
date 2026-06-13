import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export type StatTone = 'good' | 'bad' | 'neutral'

const TONE_CLS: Record<StatTone, string> = {
  good: 'text-income',
  bad: 'text-expense',
  neutral: 'text-text-muted',
}

interface StatProps {
  label: string
  value: ReactNode
  /** 값 옆에 붙는 배지 (예: 예상) */
  badge?: ReactNode
  /** 보조 줄 (델타, 기준일 등) */
  sub?: ReactNode
  subTone?: StatTone
  /** 홈 히어로 전용 대형 변형 */
  hero?: boolean
  className?: string
  children?: ReactNode
}

export function Stat({ label, value, badge, sub, subTone = 'neutral', hero = false, className, children }: StatProps) {
  return (
    <div className={cn('rounded-md border border-border bg-bg-surface p-4', className)}>
      <div className="text-caption font-medium text-text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn('tnum text-text-primary', hero ? 'text-display' : 'text-kpi')}>{value}</span>
        {badge}
      </div>
      {sub ? <div className={cn('tnum mt-1 text-caption', TONE_CLS[subTone])}>{sub}</div> : null}
      {children}
    </div>
  )
}
