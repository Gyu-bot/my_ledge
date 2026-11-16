import { Card } from '../../ds/Card'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import type { SnapshotDatesByKind, SnapshotIntervalsResponse } from '../../types/netWorth'
import { loadErrorMessage } from '../analysis/text'

const KINDS: Array<{ key: keyof SnapshotDatesByKind; label: string; use: string }> = [
  { key: 'assets', label: '자산(순자산)', use: '구간을 정하는 날짜' },
  { key: 'loans', label: '대출', use: '대출 잔액 감소에 씀' },
  { key: 'investments', label: '투자', use: '투자 평가 변동에 씀' },
  { key: 'insurance', label: '보험', use: '대조에 쓰지 않음' },
  { key: 'profile', label: '프로필', use: '대조에 쓰지 않음' },
]

/** 스냅샷 기준일을 종류마다 따로 보인다 (Implentation-plan.md 2.1). 하나로 합치지 않는다. */
export function SnapshotDatesCard({
  data,
  isLoading,
  error,
  onRetry,
}: {
  data: SnapshotIntervalsResponse | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}) {
  return (
    <Card title="종류별 스냅샷 날짜" meta="내보내기 파일마다 잔액을 찍은 날짜입니다. 종류마다 날짜가 다를 수 있어 따로 적습니다.">
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : error || !data ? (
        <ErrorState message={loadErrorMessage(error)} onRetry={onRetry} />
      ) : (
        <ul aria-label="종류별 스냅샷 날짜" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {KINDS.map((kind) => {
            const dates = data.snapshot_dates[kind.key]
            return (
              <li key={kind.key} className="min-w-0 rounded-md border border-border bg-bg-inset p-2.5 text-caption">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-text-primary">{kind.label}</span>
                  <span className="tnum text-micro text-text-muted">{dates.length}개</span>
                </div>
                <div className="tnum mt-0.5 text-text-secondary">최근 {dates[0] ?? '없음'}</div>
                <div className="text-micro text-text-faint">{kind.use}</div>
                {dates.length > 1 ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-micro text-transfer">날짜 모두 보기</summary>
                    <p className="tnum mt-1 break-words text-micro text-text-muted">{dates.join(', ')}</p>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
