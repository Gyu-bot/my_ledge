import { useSearchParams } from 'react-router-dom'
import { Card } from '../../ds/Card'
import { Select } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { useDataStatus, useMonthlyFlow } from '../../hooks/useMetrics'
import { PageHeader } from '../../shell/PageHeader'
import { DataStatusStrip } from '../analysis/DataStatusStrip'
import { formatPeriodKo } from '../analysis/periods'
import { loadErrorMessage } from '../analysis/text'
import { CategoryBreakdownCard } from './CategoryBreakdownCard'
import { ContributionsCard } from './ContributionsCard'
import { NewPurchaseCard } from './NewPurchaseCard'
import { ReviewItemsCard } from './ReviewItemsCard'

/** 지출 분석 (Implentation-plan.md 3.1, Q2·Q3). 기본 대상은 가장 최근 마감월. */
export function SpendingAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = useDataStatus()
  const closedPeriods = status.data?.closed_periods ?? []
  const inProgress = status.data?.in_progress_period ?? null
  const choices = [...(inProgress ? [inProgress] : []), ...[...closedPeriods].reverse()]
  const requested = searchParams.get('period')
  const defaultPeriod = status.data?.as_of.last_closed_period ?? inProgress
  const period = requested && choices.includes(requested) ? requested : defaultPeriod
  const flow = useMonthlyFlow(period ? { start_period: period, end_period: period } : {})
  const month = flow.data?.items.find((item) => item.period === period) ?? null
  const monthStatus = month?.month_status ?? (period === inProgress ? 'in_progress' : period ? 'closed' : null)

  function selectPeriod(next: string) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      params.set('period', next)
      params.delete('category')
      return params
    }, { replace: true })
  }

  const picker = choices.length > 0 ? (
    <label className="flex items-center gap-2 text-caption text-text-muted">
      대상 달
      <Select aria-label="분석할 달" value={period ?? ''} onChange={(event) => selectPeriod(event.target.value)}>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {formatPeriodKo(choice)}{choice === inProgress ? ' (진행월 · 부분 기록)' : ''}
          </option>
        ))}
      </Select>
    </label>
  ) : null

  return (
    <>
      <PageHeader title="지출 분석" controls={picker} />
      <DataStatusStrip scope={month ? { label: formatPeriodKo(month.period), share: month.adjustability_undecided_share } : undefined} />

      {status.isLoading ? (
        <Card title="지출 분석"><ListSkeleton rows={6} /></Card>
      ) : status.error ? (
        <Card title="지출 분석"><ErrorState message={loadErrorMessage(status.error)} onRetry={() => void status.refetch()} /></Card>
      ) : !period ? (
        <Card title="시작하기">
          <EmptyState
            message="아직 가져온 거래가 없습니다. BankSalad 내보내기 파일을 올리면 지출 분석이 채워집니다."
            actionLabel="가져오기로 가기"
            actionTo="/data/import"
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {monthStatus === 'in_progress' ? (
            <p role="note" className="rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-caption text-warn">
              진행월(부분 기록)을 보고 있습니다. 거래 기준일까지의 누적만 있고, 비교는 기준 달들도 같은 날짜까지 잘라서 합니다.
            </p>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
            <CategoryBreakdownCard key={`breakdown-${period}`} period={period} monthStatus={monthStatus} initialCategory={searchParams.get('category')} />
            <ContributionsCard key={`contrib-${period}`} period={period} />
            {flow.error ? (
              <Card title="기존 할부 회차를 뺀 지출"><ErrorState message={loadErrorMessage(flow.error)} onRetry={() => void flow.refetch()} /></Card>
            ) : flow.isLoading ? (
              <Card title="기존 할부 회차를 뺀 지출"><ListSkeleton rows={4} /></Card>
            ) : (
              <NewPurchaseCard key={`new-${period}`} month={month} />
            )}
            <ReviewItemsCard period={period} />
          </div>
        </div>
      )}
    </>
  )
}
