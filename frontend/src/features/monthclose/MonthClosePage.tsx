import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { Select } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { useDataStatus, useMonthlyFlow, useMonthProjection, useReadDataStatus } from '../../hooks/useMetrics'
import { PageHeader } from '../../shell/PageHeader'
import type { MonthlyFlowMonth } from '../../types/metrics'
import { AmountDrilldown, type DrillTarget } from '../analysis/AmountDrilldown'
import { SpendingReferenceCard } from '../analysis/SpendingReferenceCard'
import { DataStatusStrip } from '../analysis/DataStatusStrip'
import type { FlowMeasureKey } from '../analysis/flowMeasures'
import { formatDateKo, formatPeriodKo } from '../analysis/periods'
import { loadErrorMessage } from '../analysis/text'
import { MonthCoverageLabel } from '../analysis/MonthCoverageLabel'
import { FlowTable } from './FlowTable'
import { ForecastCard } from './ForecastCard'
import { TrendCard } from './TrendCard'

type DrillArea = 'closed' | 'progress'

interface DrillState {
  area: DrillArea
  target: Extract<DrillTarget, { kind: 'flow' }>
}

/** 월 결산 — 첫 화면 (Implentation-plan.md 3.1, Q1). */
export function MonthClosePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = useDataStatus()
  const flow = useMonthlyFlow()
  const projection = useMonthProjection()
  const coverage = useReadDataStatus()
  const [drill, setDrill] = useState<DrillState | null>(null)

  const closedPeriods = status.data?.closed_periods ?? []
  const lastClosed = status.data?.as_of.last_closed_period ?? null
  const inProgressPeriod = status.data?.in_progress_period ?? null
  const requested = searchParams.get('month')
  const selectedPeriod = requested && closedPeriods.includes(requested) ? requested : lastClosed
  const items = flow.data?.items ?? []
  const selectedMonth = items.find((item) => item.period === selectedPeriod) ?? null
  const inProgressMonth = items.find((item) => item.period === inProgressPeriod && item.month_status === 'in_progress') ?? null
  const nonKrwCount = flow.data?.contract.non_krw_transaction_count ?? 0

  function selectMonth(period: string) {
    setDrill(null)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (period === lastClosed) next.delete('month')
      else next.set('month', period)
      return next
    }, { replace: true })
  }

  function toggle(area: DrillArea, month: MonthlyFlowMonth, measure: FlowMeasureKey) {
    setDrill((current) =>
      current && current.area === area && current.target.measure === measure ? null : { area, target: { kind: 'flow', measure, month } },
    )
  }

  function drilldownFor(area: DrillArea) {
    if (!drill || drill.area !== area) return null
    return (
      <AmountDrilldown
        target={drill.target}
        nonKrwCount={nonKrwCount}
        onClose={() => setDrill(null)}
        onNavigate={(target) => {
          if (target.kind === 'flow') setDrill({ area, target })
        }}
      />
    )
  }

  const monthPicker = closedPeriods.length > 0 ? (
    <label className="flex items-center gap-2 text-caption text-text-muted">
      마감월
      <Select aria-label="결산할 마감월" value={selectedPeriod ?? ''} onChange={(event) => selectMonth(event.target.value)}>
        {[...closedPeriods].reverse().map((period) => (
          <option key={period} value={period}>{formatPeriodKo(period)}</option>
        ))}
      </Select>
    </label>
  ) : null

  const loading = status.isLoading || flow.isLoading
  const loadError = status.error ?? flow.error
  const noTransactions = status.data != null && status.data.as_of.transaction_as_of == null

  return (
    <>
      <PageHeader title="월 결산" controls={monthPicker} />
      <DataStatusStrip scope={selectedMonth ? { label: formatPeriodKo(selectedMonth.period), share: selectedMonth.adjustability_undecided_share } : undefined} />

      {loading ? (
        <Card title="월 흐름표"><ListSkeleton rows={8} /></Card>
      ) : loadError ? (
        <Card title="월 흐름표">
          <ErrorState
            message={loadErrorMessage(loadError)}
            onRetry={() => {
              void status.refetch()
              void flow.refetch()
            }}
          />
        </Card>
      ) : noTransactions ? (
        <Card title="시작하기">
          <EmptyState
            message="아직 가져온 거래가 없습니다. BankSalad 내보내기 파일을 올리면 월 결산이 채워집니다."
            actionLabel="가져오기로 가기"
            actionTo="/data/import"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card
            className="xl:col-start-1 xl:row-start-1"
            title={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {selectedPeriod ? `${formatPeriodKo(selectedPeriod)} 월 흐름표` : '월 흐름표'}
                {selectedMonth ? <Badge variant="neutral">마감월</Badge> : null}
                <MonthCoverageLabel month={coverage.data?.data.periods.find((month) => month.period === selectedPeriod)} />
              </span>
            }
            meta="모든 거래가 정확히 한 줄에 들어갑니다. 금액을 누르면 산식, 포함·제외, 해당 거래가 그 자리에서 열립니다."
          >
            {selectedMonth ? (
              <FlowTable
                month={selectedMonth}
                caption={`${selectedMonth.period} 월 흐름표`}
                openMeasure={drill?.area === 'closed' ? drill.target.measure : null}
                onToggle={(measure) => toggle('closed', selectedMonth, measure)}
                drilldown={drilldownFor('closed')}
              />
            ) : (
              <EmptyState message="아직 마감된 달이 없습니다. 거래 자료가 한 달의 말일까지 오면 그 달의 흐름표가 여기에 나옵니다." />
            )}
          </Card>

          <div className="flex flex-col gap-4 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <Card
              title={
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {inProgressPeriod ? `${formatPeriodKo(inProgressPeriod)} 지금까지` : '진행월'}
                  {inProgressPeriod ? <Badge variant="warn">부분 기록</Badge> : null}
                </span>
              }
              meta={
                inProgressPeriod
                  ? `${formatDateKo(status.data?.as_of.transaction_as_of)}까지 관측한 누적입니다. 비율과 지난달 전체 대비 증감은 내지 않습니다.`
                  : undefined
              }
            >
              {inProgressMonth ? (
                <FlowTable
                  month={inProgressMonth}
                  variant="compact"
                  caption={`${inProgressMonth.period} 관측 누적`}
                  openMeasure={drill?.area === 'progress' ? drill.target.measure : null}
                  onToggle={(measure) => toggle('progress', inProgressMonth, measure)}
                  drilldown={drilldownFor('progress')}
                />
              ) : (
                <EmptyState message="진행 중인 달이 없습니다. 마지막 거래가 그 달 말일이면 모든 달이 마감월입니다." />
              )}
            </Card>
            <ForecastCard
              projection={projection.data?.data}
              isLoading={projection.isLoading}
              error={projection.error}
              onRetry={() => void projection.refetch()}
              inProgressPeriod={inProgressPeriod}
            />
          </div>

          <div className="xl:col-start-1 xl:row-start-2">
            {selectedPeriod ? <SpendingReferenceCard period={selectedPeriod} /> : null}
            {items.length > 0 ? (
              <TrendCard
                items={items}
                coveragePeriods={coverage.data?.data.periods}
                coverageError={coverage.error}
                endPeriod={inProgressPeriod ?? lastClosed ?? items[items.length - 1].period}
                firstPeriod={status.data?.as_of.first_transaction_date?.slice(0, 7) ?? null}
                selectedPeriod={selectedPeriod}
                onSelect={selectMonth}
              />
            ) : null}
            <Link
              to={selectedPeriod ? `/analysis?period=${selectedPeriod}` : '/analysis'}
              className="mt-3 inline-flex items-center gap-1 text-caption font-medium text-transfer hover:underline"
            >
              이 달의 지출을 카테고리·거래처로 나눠 보기
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
