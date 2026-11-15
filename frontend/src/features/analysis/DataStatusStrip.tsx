import { Link } from 'react-router-dom'
import { Badge } from '../../ds/Badge'
import { Skeleton } from '../../ds/Skeleton'
import { useDataStatus } from '../../hooks/useMetrics'
import type { SnapshotAsOf } from '../../types/metrics'
import { loadErrorMessage, sharePct } from './text'
import { formatDateKo, formatPeriodKo } from './periods'

const SNAPSHOT_LABELS: Record<keyof SnapshotAsOf, string> = {
  assets: '자산',
  loans: '대출',
  investments: '투자',
  insurance: '보험',
  profile: '프로필',
}

interface DataStatusStripProps {
  /** 이 화면이 보고 있는 범위의 미정 비중 (예: 선택한 달) */
  scope?: { label: string; share: number | null }
}

/** 모든 분석 화면 머리의 자료 현황 (Implentation-plan.md 3.1 공통 규칙, Q6). */
export function DataStatusStrip({ scope }: DataStatusStripProps) {
  const status = useDataStatus()

  if (status.isLoading) {
    return (
      <div className="mb-4 rounded-md border border-border bg-bg-surface px-4 py-3" role="status" aria-label="자료 현황 불러오는 중">
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }
  if (status.error || !status.data) {
    return (
      <div role="alert" className="mb-4 rounded-md border border-warn-border bg-warn-bg px-4 py-3 text-caption text-warn">
        자료 현황: {loadErrorMessage(status.error)}
      </div>
    )
  }

  const data = status.data
  const asOf = data.as_of
  const snapshotKinds = Object.keys(SNAPSHOT_LABELS) as Array<keyof SnapshotAsOf>

  return (
    <section aria-label="자료 현황" className="mb-4 rounded-md border border-border bg-bg-surface px-4 py-3 text-caption">
      <dl className="flex flex-wrap gap-x-5 gap-y-2">
        <div className="min-w-0">
          <dt className="text-text-muted">거래 기준일</dt>
          <dd className="tnum font-semibold text-text-primary">{formatDateKo(asOf.transaction_as_of)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-muted">가장 최근 마감월</dt>
          <dd className="tnum text-text-primary">{asOf.last_closed_period ? formatPeriodKo(asOf.last_closed_period) : '없음'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-muted">진행월</dt>
          <dd className="tnum text-text-primary">
            {data.in_progress_period ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                {formatPeriodKo(data.in_progress_period)}
                <Badge variant="warn">부분 기록</Badge>
              </span>
            ) : '없음'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-muted">스냅샷 기준일 (종류별)</dt>
          <dd className="tnum flex flex-wrap gap-x-2 text-text-secondary">
            {snapshotKinds.map((kind) => (
              <span key={kind}>
                {SNAPSHOT_LABELS[kind]} {asOf.snapshot_as_of[kind] ?? '없음'}
              </span>
            ))}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-muted">조정 가능성 미정 비중 (금액 기준)</dt>
          <dd className="tnum flex flex-wrap items-center gap-x-2 text-text-primary">
            {scope ? <span>{scope.label} {sharePct(scope.share)}</span> : null}
            <span className={scope ? 'text-text-muted' : undefined}>전체 기간 {sharePct(data.adjustability_undecided_share)}</span>
            {(data.adjustability_undecided_share ?? 0) > 0 ? (
              <Link to="/data/inbox" className="text-transfer hover:underline">분류하러 가기</Link>
            ) : null}
          </dd>
        </div>
      </dl>
      {data.non_krw_transaction_count > 0 ? (
        <p className="mt-2 text-text-muted">원화가 아닌 거래 {data.non_krw_transaction_count}건은 모든 합계에서 빠져 있습니다.</p>
      ) : null}
    </section>
  )
}
