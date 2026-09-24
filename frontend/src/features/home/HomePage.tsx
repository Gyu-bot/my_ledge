import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { CoverageGauge } from '../../ds/CoverageGauge'
import { Provenance } from '../../ds/Provenance'
import { Stat } from '../../ds/Stat'
import { ChartSkeleton, ListSkeleton, StatSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { CashflowChart } from '../../ds/charts/CashflowChart'
import {
  EM_DASH,
  formatDay,
  formatDeltaPct,
  formatPct,
  formatSignedWon,
  formatWon,
  formatWonCompact,
} from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import {
  useDiscretionaryVelocity,
  useIncomeStability,
  useMonthlyCashflow,
  useRecurringPayments,
  useSpendingAnomalies,
} from '../../hooks/useAnalytics'
import { useAssetSnapshots } from '../../hooks/useAssets'
import { useCanonicalViewsDashboard } from '../../hooks/useCanonicalViews'
import { useAnalyticsSettings } from '../../hooks/useSettings'
import {
  useLoanTransactionMappings,
  useRecurringCategoryRulesDryRun,
  useTransactionList,
} from '../../hooks/useTransactions'
import type { MonthlyProjection } from '../../types/canonicalViews'
import type { AnalyticsRiskLevel } from '../../types/analytics'

const CONFIDENCE_LABELS = { high: '높음', medium: '보통', low: '낮음', unavailable: '산출 불가' }
const INCOME_STATUS_LABELS = { expected: '입금 예정', received: '입금 확인', partial: '일부 입금', late: '입금 지연', stopped: '중단', uncertain: '검토 필요' }
const EXPENSE_LABELS = { loan: '대출', installment: '할부', recurring: '반복결제', variable: '변동 지출' }

function projectionMoney(value: number | null | undefined) {
  return value == null ? '산출 불가' : formatSignedWon(value, { compact: true })
}

function ProjectionDetails({ projection }: { projection: MonthlyProjection }) {
  return (
    <Card title="이번 달 전망 근거" meta={`${projection.period} · 신뢰도 ${CONFIDENCE_LABELS[projection.confidence]}`} action={<CardLink to="/data/settings">수입 예상 설정</CardLink>}>
      <p className="text-caption text-text-muted">기준일 {projection.as_of_date} · 거래 관측 {projection.observed_through ?? '없음'} · 최신 업로드 {projection.coverage.latest_upload_date ?? '없음'}</p>
      <p className="mt-1 text-caption text-text-muted">월말 순현금흐름 = 월 예상 수입 − (관측 순지출 + 잔여 예상 순지출). 현재 계좌 잔액과는 별개입니다.</p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section aria-label="수입처별 예상 입금">
          <h3 className="text-label font-semibold text-text-primary">수입처별 예상 입금</h3>
          {projection.income_sources.length === 0 ? <p className="mt-2 text-caption text-text-muted">감지된 정기 수입이 없습니다. 설정에서 예상 수입을 추가할 수 있습니다.</p> : (
            <ul className="mt-2 divide-y divide-border-subtle">
              {projection.income_sources.map((source) => (
                <li key={source.source_key} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-label font-semibold text-text-primary">{source.merchant}</span><Badge variant={source.status === 'late' || source.status === 'uncertain' ? 'warn' : 'neutral'}>{INCOME_STATUS_LABELS[source.status]}</Badge></div>
                  <p className="tnum mt-1 text-caption text-text-secondary">예정일 {source.expected_date ?? '날짜 미정'}{source.expected_date_from || source.expected_date_to ? ` · 입금 범위 ${source.expected_date_from ?? '미정'} ~ ${source.expected_date_to ?? '미정'}` : ''} · 신뢰도 {CONFIDENCE_LABELS[source.confidence]}</p>
                  <p className="tnum mt-1 text-caption text-text-secondary">예상 {formatWon(source.expected_amount)} · 입금 확인 {formatWon(source.observed_amount)} · 남은 예상 {formatWon(source.remaining_amount)}</p>
                  <p className="mt-1 text-caption text-text-muted">{source.reason}</p>
                  <p className="mt-1 text-micro text-text-muted">근거 월 {source.history_periods.join(', ') || '없음'} · 제외 월 {source.excluded_periods.join(', ') || '없음'} · 대조 거래 {source.matched_transaction_ids.length}건</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="남은 예상 지출">
          <h3 className="text-label font-semibold text-text-primary">남은 예상 지출 · {projectionMoney(projection.expected_remaining_expense)}</h3>
          <ul className="mt-2 divide-y divide-border-subtle">
            {projection.expense_components.map((component) => (
              <li key={component.kind} className="py-3 first:pt-0">
                <div className="flex justify-between gap-3 text-label"><span>{EXPENSE_LABELS[component.kind]}</span><span className="tnum">{projectionMoney(component.expected_remaining)}</span></div>
                {component.expected_remaining == null ? <p className="tnum mt-1 text-caption text-text-secondary">확인 가능한 잔여 예상 지출 {projectionMoney(component.known_expected_remaining)}</p> : null}
                <p className="mt-1 text-caption text-text-muted">{component.basis}</p>
                {component.missing_reasons.length > 0 ? <p className="mt-1 text-caption text-warn">{component.missing_reasons.join(' · ')}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <details className="mt-3 rounded-md border border-border bg-bg-inset p-3 text-caption">
        <summary className="cursor-pointer font-medium text-text-secondary">수집 범위와 포함·제외 월 보기</summary>
        <dl className="mt-2 space-y-1 text-text-muted">
          <div><dt className="inline">수집 근거: </dt><dd className="inline">{projection.coverage.basis}</dd></div>
          <div><dt className="inline">관측 범위: </dt><dd className="inline">{projection.coverage.first_observed_date ?? '없음'} ~ {projection.coverage.last_observed_date ?? '없음'}</dd></div>
          <div><dt className="inline">충분히 수집된 월: </dt><dd className="inline">{projection.coverage.adequately_covered_periods.join(', ') || '없음'}</dd></div>
          <div><dt className="inline">전망 포함 월: </dt><dd className="inline">{projection.included_periods.join(', ') || '없음'}</dd></div>
          <div><dt className="inline">전망 제외 월: </dt><dd className="inline">{projection.excluded_periods.join(', ') || '없음'}</dd></div>
          <div><dt className="inline">부분 수집 제외 월: </dt><dd className="inline">{projection.coverage.excluded_periods.join(', ') || '없음'}</dd></div>
          <div><dt className="inline">누락 월: </dt><dd className="inline">{projection.coverage.missing_periods.join(', ') || '없음'}</dd></div>
        </dl>
      </details>
      {projection.missing_reasons.length > 0 ? <p className="mt-3 text-caption text-warn">산출 제한: {projection.missing_reasons.join(' · ')}</p> : null}
      {projection.limitations.length > 0 ? <ul className="mt-2 list-inside list-disc text-caption text-text-muted">{projection.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul> : null}
    </Card>
  )
}

function incomeStabilityLabel(cv: number | null | undefined): string {
  if (cv == null) return EM_DASH
  if (cv < 0.1) return '안정'
  if (cv < 0.25) return '보통'
  return '불안정'
}

function riskLabel(level: AnalyticsRiskLevel): string {
  if (level === 'high' || level === 'critical') return '높음'
  if (level === 'warning') return '주의'
  if (level === 'watch') return '관찰'
  return '낮음'
}

function riskVariant(level: AnalyticsRiskLevel): 'expense' | 'warn' | 'accent' {
  if (level === 'high' || level === 'critical') return 'expense'
  if (level === 'warning' || level === 'watch') return 'warn'
  return 'accent'
}

function SignalRow({ label, scope, value, tone = 'neutral' }: { label: string; scope: string; value: ReactNode; tone?: 'warn' | 'neutral' }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-bg-inset px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-label text-text-secondary">{label}</span>
        <span className="mt-0.5 block text-micro text-text-muted">{scope}</span>
      </span>
      <span className={`tnum shrink-0 text-label font-semibold ${tone === 'warn' ? 'text-warn' : 'text-text-primary'}`}>
        {value}
      </span>
    </div>
  )
}

function TodoRow({ label, value, to }: { label: string; value: string | null; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-md border border-border bg-bg-inset px-3 py-2.5 transition-colors duration-fast hover:border-border-strong"
    >
      <span className="text-label text-text-secondary">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="tnum text-label font-semibold text-text-primary">{value ?? EM_DASH}</span>
        <ArrowRight className="h-3.5 w-3.5 text-text-faint" />
      </span>
    </Link>
  )
}

function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline">
      {children}
      <ArrowRight className="h-3 w-3" />
    </Link>
  )
}

export function HomePage() {
  const canonical = useCanonicalViewsDashboard()
  const cashflow = useMonthlyCashflow(12)
  const snapshots = useAssetSnapshots()
  const anomalies = useSpendingAnomalies({ page: 1, per_page: 1 })
  const recurring = useRecurringPayments(1, 1)
  const incomeStability = useIncomeStability()
  const velocity = useDiscretionaryVelocity()
  const dryRun = useRecurringCategoryRulesDryRun()
  const unlinkedLoans = useLoanTransactionMappings({ linked: 'unlinked', page: 1, per_page: 1 })
  const recentTx = useTransactionList({ page: 1, per_page: 5, type: 'all' })
  const settings = useAnalyticsSettings()

  const projection = canonical.data?.month_projection
  const canonicalCashflow = canonical.data?.monthly_cashflow ?? []
  const observedMonth = projection
    ? canonicalCashflow.find((item) => item.period === projection.period)
    : canonicalCashflow[canonicalCashflow.length - 1]
  const observedIncome = projection?.observed_income ?? observedMonth?.income_total
  const observedNet = projection?.observed_net_cashflow ?? observedMonth?.net_cashflow

  // 보조 KPI
  const latestSnapshot = [...(snapshots.data?.items ?? [])]
    .reverse()
    .find((item) => item.asset_total && item.liability_total && item.net_worth)
  const netWorth = latestSnapshot ? parseFloat(latestSnapshot.net_worth) : null
  const cashflowItems = cashflow.data?.items ?? []
  const latestMonth = cashflowItems[cashflowItems.length - 1]
  const activePeriod = projection?.period ?? latestMonth?.period
  const [activeYear, activeMonth] = (activePeriod ?? '').split('-').map(Number)
  const previousPeriod = activePeriod ? new Date(Date.UTC(activeYear, activeMonth - 2, 1)).toISOString().slice(0, 7) : null
  const previousMonth = cashflowItems.find((item) => item.period === previousPeriod)
  const currentExpense = projection?.observed_net_expense ?? latestMonth?.expense
  const previousIsComplete = canonicalCashflow.some((item) => item.period === previousPeriod && item.is_complete_month)
  const expenseMoM =
    currentExpense != null && previousMonth && previousMonth.expense > 0
      ? ((currentExpense - previousMonth.expense) / previousMonth.expense) * 100
      : null
  // 저축률은 진행월 왜곡을 피해 마지막 완성월(is_complete_month) 기준으로 보여준다
  const incompletePeriods = new Set(
    (canonical.data?.monthly_cashflow ?? [])
      .filter((item) => !item.is_complete_month)
      .map((item) => item.period),
  )
  const savingsSource = [...cashflowItems].reverse().find((item) => canonicalCashflow.some((month) => month.period === item.period && month.is_complete_month))
  const savingsRate = savingsSource?.savings_rate != null ? savingsSource.savings_rate * 100 : null
  const savingsTarget = settings.data?.effective.financial_targets.savings_rate_target ?? null
  const savingsTargetPct = savingsTarget != null ? savingsTarget * 100 : null

  // 주의 신호
  const anomalyCount = anomalies.data?.total ?? null
  const recurringCount = recurring.data?.total ?? null
  const incomeCV = incomeStability.data?.coefficient_of_variation
  const velocityData = velocity.data

  // 해야 할 일
  const queueCount = canonical.data?.unclassified_work_queue_total ?? null
  const dryRunCount = dryRun.data ? dryRun.data.items.length : null
  const unlinkedCount = unlinkedLoans.data?.total ?? null
  const coverage = velocityData?.classification_coverage_ratio ?? null

  const kpiLoading = canonical.isLoading || cashflow.isLoading || snapshots.isLoading
  const noData = !canonical.isLoading && !cashflow.isLoading && !projection?.coverage.first_observed_date && (projection?.income_sources.length ?? 0) === 0 && canonicalCashflow.length === 0 && cashflowItems.length === 0

  return (
    <>
      <PageHeader
        title="홈"
        meta={
          latestSnapshot ? (
            <span className="tnum rounded-sm border border-border bg-bg-inset px-2 py-0.5">
              기준일 {latestSnapshot.snapshot_date}
            </span>
          ) : undefined
        }
      />

      {noData ? (
        <Card title="시작하기">
          <EmptyState
            message="아직 데이터가 없습니다. BankSalad 엑셀 파일을 업로드하면 대시보드가 채워집니다."
            actionLabel="가져오기에서 업로드 시작"
            actionTo="/data/import"
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {/* KPI */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {kpiLoading ? (
              <>
                <div className="md:col-span-2 xl:row-span-2">
                  <StatSkeleton hero />
                </div>
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </>
            ) : (
              <>
                <Stat
                  hero
                  label="월말 예상 순현금흐름"
                  className="border-t-2 border-t-estimate md:col-span-2 xl:row-span-2"
                  value={projectionMoney(projection?.projected_month_end_net)}
                  badge={<Badge variant={projection?.projected_month_end_net == null ? 'warn' : 'estimate'}>{projection?.projected_month_end_net == null ? '입력 부족' : '예상'}</Badge>}
                  sub={projection ? `${projection.period} · 기준일 ${projection.as_of_date}` : '월간 전망 데이터가 없습니다'}
                >
                  <div className="mt-3 space-y-2 text-caption">
                    <div className="flex flex-wrap justify-between gap-2 text-text-secondary"><span>관측 순현금흐름</span><span className="tnum font-semibold">{observedNet == null ? EM_DASH : formatSignedWon(observedNet, { compact: true })}</span></div>
                    <p className="text-text-muted">현재 계좌 잔액과는 별개이며, 남은 예상 수입과 지출을 반영한 월간 전망입니다.</p>
                    {projection?.projected_month_end_net == null ? <p className="text-warn">남은 지출 등 전망 입력이 부족하면 월말 예상액을 표시하지 않습니다.</p> : null}
                    {projection?.projected_month_end_net == null && projection ? <div className="space-y-1 border-t border-border pt-2 text-text-secondary">
                      <p className="tnum">확인 가능한 잔여 예상 지출 {projectionMoney(projection.known_expected_remaining_expense)}</p>
                      <p className="tnum">확인된 입력만 반영한 차액 {projectionMoney(projection.net_after_known_remaining_expense)}</p>
                      <p className="text-warn">월말 전망 아님 · 미확정 지출은 차감되지 않았습니다.</p>
                    </div> : null}
                  </div>
                </Stat>
                <Stat
                  label="순자산"
                  value={netWorth != null ? (netWorth < 0 ? '-' : '') + formatWonCompact(netWorth) : EM_DASH}
                  sub={latestSnapshot ? `기준일 ${formatDay(latestSnapshot.snapshot_date)}` : undefined}
                />
                <Stat
                  label="이번 달 관측 수입"
                  badge={projection ? <Provenance
                    title="월 예상 수입 계산"
                    triggerLabel="월 예상 수입 계산 근거 보기"
                    rows={[
                      { label: '관측 수입', value: formatWon(projection.observed_income) },
                      { label: '남은 예상 수입', value: formatWon(projection.expected_remaining_income) },
                      { label: '월 예상 수입', value: formatWon(projection.projected_month_income) },
                    ]}
                    note="월 예상 수입 = 관측 수입 + 남은 예상 수입"
                  /> : undefined}
                  value={observedIncome == null ? EM_DASH : formatWonCompact(observedIncome)}
                  sub={projection?.period ?? observedMonth?.period}
                >
                  <p className="tnum mt-2 text-caption text-estimate">월 예상 수입 {projectionMoney(projection?.projected_month_income)}</p>
                  <p className="tnum mt-1 text-caption text-text-muted">남은 예상 수입 {projectionMoney(projection?.expected_remaining_income)}</p>
                </Stat>
                <Stat
                  label="이번 달 관측 순지출"
                  value={projection ? projectionMoney(projection.observed_net_expense) : latestMonth ? projectionMoney(latestMonth.expense) : EM_DASH}
                  sub={expenseMoM != null ? `${observedMonth?.is_complete_month ? '해당 월 전체' : '이번 달 누적'} / ${previousIsComplete ? '전월 전체' : '전월 누적'} ${formatDeltaPct(expenseMoM)}` : undefined}
                  subTone={expenseMoM != null && expenseMoM > 0 ? 'bad' : 'neutral'}
                >
                  <p className="tnum mt-2 text-caption text-estimate">남은 예상 순지출 {projectionMoney(projection?.expected_remaining_expense)}</p>
                </Stat>
                <Stat
                  label="저축률"
                  value={formatPct(savingsRate)}
                  sub={[
                    savingsSource ? `${savingsSource.period} 마감 기준` : '확인된 마감월 없음',
                    savingsTargetPct != null ? `목표 ${formatPct(savingsTargetPct, 0)}` : null,
                  ].filter(Boolean).join(' · ') || undefined}
                  subTone={
                    savingsRate != null && savingsTargetPct != null && savingsRate >= savingsTargetPct
                      ? 'good'
                      : 'neutral'
                  }
                />
              </>
            )}
          </div>

          {projection ? <ProjectionDetails projection={projection} /> : null}

          {/* 현금흐름 + 주의 신호 */}
          <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
            <Card title="현금흐름" meta="최근 12개월 · 관측 실적" action={<CardLink to="/spending">지출</CardLink>}>
              {cashflow.isLoading ? (
                <ChartSkeleton height={200} />
              ) : cashflow.error ? (
                <ErrorState onRetry={() => void cashflow.refetch()} />
              ) : cashflowItems.length > 0 ? (
                <CashflowChart
                    incompletePeriods={incompletePeriods}
                    items={cashflowItems.map((item) => ({
                      period: item.period,
                      income: item.income,
                      expense: item.expense,
                      net: item.net_cashflow,
                    }))}
                />
              ) : (
                <EmptyState message="현금흐름 데이터가 없습니다" actionLabel="가져오기" actionTo="/data/import" />
              )}
              {projection ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-caption" aria-label={`${projection.period} 관측과 전망 비교`}>
                    <thead><tr><th className="py-2">{projection.period}</th><th>수입</th><th>순지출</th><th>순현금흐름</th></tr></thead>
                    <tbody className="tnum text-text-secondary">
                      <tr><th className="py-2">관측 실적</th><td>{projectionMoney(projection.observed_income)}</td><td>{projectionMoney(projection.observed_net_expense)}</td><td>{projectionMoney(projection.observed_net_cashflow)}</td></tr>
                      <tr className="text-estimate"><th className="py-2">월말 전망</th><td>{projectionMoney(projection.projected_month_income)}</td><td>{projectionMoney(projection.projected_month_expense)}</td><td>{projectionMoney(projection.projected_month_end_net)}</td></tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>

            <Card
              title="주의 신호"
              meta={
                <span className="inline-flex items-center gap-1">
                  항목별 기준
                  <Provenance
                    title="주의 신호 기준"
                    note="이상 지출·수입 안정성은 마감월 기준, 재량 지출 속도는 진행월 기준이며 반복 결제는 전체 이력입니다. 신호 화면에서 마감월·부분 기간 기준을 전환할 수 있습니다."
                  />
                </span>
              }
              action={<CardLink to="/signals">신호</CardLink>}
            >
              {anomalies.isLoading || recurring.isLoading || incomeStability.isLoading ? (
                <ListSkeleton rows={4} />
              ) : (
                <div className="flex flex-col gap-2">
                  <SignalRow
                    label="이상 지출 카테고리"
                    scope={anomalies.data?.reference_date ? `직전 마감월 · ${anomalies.data.reference_date.slice(0, 7)}` : '직전 마감월'}
                    value={anomalyCount == null ? EM_DASH : `${anomalyCount}건`}
                    tone={(anomalyCount ?? 0) > 0 ? 'warn' : 'neutral'}
                  />
                  <SignalRow label="반복 결제 감지" scope="전체 이력 · 현재 구독 수 아님" value={recurringCount == null ? EM_DASH : `${recurringCount}건`} />
                  <SignalRow label="수입 안정성" scope={incomeStability.data?.reference_date ? `직전 마감월까지 · ${incomeStability.data.reference_date} 기준` : '직전 마감월까지의 수입 이력'} value={incomeStabilityLabel(incomeCV)} />
                  <SignalRow
                    label="재량 지출 속도"
                    scope={velocityData ? `${velocityData.period} 진행월 · ${velocityData.as_of_date} 기준` : '진행월 · 기준일 확인 불가'}
                    value={
                      velocityData ? (
                        <span className="inline-flex items-center gap-1.5">
                          {velocityData.velocity_ratio == null ? EM_DASH : `${velocityData.velocity_ratio.toFixed(2)}x`}
                          <Badge variant={riskVariant(velocityData.risk_level)}>{riskLabel(velocityData.risk_level)}</Badge>
                        </span>
                      ) : (
                        EM_DASH
                      )
                    }
                  />
                </div>
              )}
            </Card>
          </div>

          {/* 해야 할 일 + 최근 거래 */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card title="해야 할 일" meta="데이터 품질 작업" action={<CardLink to="/data/inbox">인박스</CardLink>}>
              {canonical.isLoading || dryRun.isLoading || unlinkedLoans.isLoading ? (
                <ListSkeleton rows={3} />
              ) : (
                <div className="flex flex-col gap-2">
                  <TodoRow
                    label="분류 품질 검토"
                    value={queueCount == null ? null : `${queueCount.toLocaleString('ko-KR')}건`}
                    to="/data/inbox"
                  />
                  <TodoRow
                    label="반복 분류 승인 대기"
                    value={dryRunCount == null ? null : `${dryRunCount}건`}
                    to="/data/inbox"
                  />
                  <TodoRow
                    label="대출 연결 후보"
                    value={unlinkedCount == null ? null : `${unlinkedCount}건`}
                    to="/data/inbox"
                  />
                  <div className="mt-1 px-1">
                    <CoverageGauge label="분류 커버리지" ratio={coverage} />
                  </div>
                </div>
              )}
            </Card>

            <Card title="최근 거래" meta="최근 5건 · 조회 전용" action={<CardLink to="/data/transactions">거래</CardLink>}>
              {recentTx.isLoading ? (
                <ListSkeleton rows={5} />
              ) : recentTx.data && recentTx.data.items.length > 0 ? (
                <ul className="divide-y divide-border-subtle">
                  {recentTx.data.items.map((tx) => (
                    <li key={tx.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-label text-text-primary">{tx.merchant}</div>
                        <div className="text-caption text-text-muted">{tx.effective_category_major}</div>
                      </div>
                      <span className="tnum shrink-0 text-caption text-text-faint">{formatDay(tx.date)}</span>
                      <span
                        className={`tnum shrink-0 text-label font-semibold ${
                          tx.amount < 0 ? 'text-expense' : 'text-income'
                        }`}
                      >
                        {formatSignedWon(tx.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="거래 내역이 없습니다" actionLabel="가져오기" actionTo="/data/import" />
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
