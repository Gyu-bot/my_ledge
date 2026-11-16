import { Badge } from '../../ds/Badge'
import type { ReadPeriodState } from '../../types/readSurface'

/** 날짜에서 재판정하지 않고 서버의 월별 자료 범위를 표시한다. */
export function MonthCoverageLabel({ month }: { month: ReadPeriodState | undefined }) {
  if (!month) return null
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 text-micro font-normal">
      {month.data_coverage === 'partial' ? <Badge variant="warn">부분 자료</Badge> : null}
      {month.data_coverage === 'no_transactions_observed' ? <Badge variant="neutral">거래 기록 없음 · 추정</Badge> : null}
      {month.data_coverage_reasons?.includes('first_month_starts_mid_month') ? <span>월중 시작 · 월초 자료 없음</span> : null}
      {month.data_coverage === 'full' ? <span className="sr-only">달 전체 범위 · 수집 완전성 확인 아님</span> : null}
    </span>
  )
}
