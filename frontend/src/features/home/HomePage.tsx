import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { CoverageGauge } from '../../ds/CoverageGauge'
import { Provenance } from '../../ds/Provenance'
import { Sparkline } from '../../ds/Sparkline'
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
import type { CanonicalTrueSpendableMonthlyItem } from '../../types/canonicalViews'
import type { AnalyticsRiskLevel } from '../../types/analytics'

function isEstimated(item: CanonicalTrueSpendableMonthlyItem | undefined): boolean {
  return item?.is_income_estimated === true && item.estimated_income_total != null
}

function displayRemaining(item: CanonicalTrueSpendableMonthlyItem): number | null {
  if (isEstimated(item)) return item.estimated_remaining_after_variable_spend
  return item.remaining_after_variable_spend
}

function incomeEstimateSourceLabel(item: CanonicalTrueSpendableMonthlyItem): string {
  if (item.income_estimate_source === 'trailing_6_outlier_adjusted_avg') return '최근 6개월 이상치 제외 평균 수입'
  if (item.income_estimate_source === 'trailing_6_income_median') return '최근 6개월 중앙값 수입'
  if (item.income_estimate_source === 'trailing_6_closed_month_avg') return '최근 6개월 평균 수입'
  return `${item.income_estimate_month_count}개월 수입 기준`
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

function SignalRow({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: 'warn' | 'neutral' }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-bg-inset px-3 py-2.5">
      <span className="text-label text-text-secondary">{label}</span>
      <span className={`tnum text-label font-semibold ${tone === 'warn' ? 'text-warn' : 'text-text-primary'}`}>
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

  // 히어로 — 실질 가용액 (vw_true_spendable_monthly)
  const spendableItems = canonical.data?.true_spendable_monthly ?? []
  const spendable = spendableItems[spendableItems.length - 1]
  const estimated = isEstimated(spendable)
  const remaining = spendable ? displayRemaining(spendable) : null
  const sparkValues = spendableItems.slice(-6).map((item) => displayRemaining(item) ?? 0)

  // 보조 KPI
  const latestSnapshot = [...(snapshots.data?.items ?? [])]
    .reverse()
    .find((item) => item.asset_total && item.liability_total && item.net_worth)
  const netWorth = latestSnapshot ? parseFloat(latestSnapshot.net_worth) : null
  const cashflowItems = cashflow.data?.items ?? []
  const latestMonth = cashflowItems[cashflowItems.length - 1]
  const previousMonth = cashflowItems[cashflowItems.length - 2]
  const expenseMoM =
    latestMonth && previousMonth && Math.abs(previousMonth.expense) > 0
      ? ((Math.abs(latestMonth.expense) - Math.abs(previousMonth.expense)) / Math.abs(previousMonth.expense)) * 100
      : null
  // 저축률은 진행월 왜곡을 피해 마지막 완성월(is_complete_month) 기준으로 보여준다
  const incompletePeriods = new Set(
    (canonical.data?.monthly_cashflow ?? [])
      .filter((item) => !item.is_complete_month)
      .map((item) => item.period),
  )
  const savingsSource = canonical.data
    ? [...cashflowItems].reverse().find((item) => !incompletePeriods.has(item.period)) ?? latestMonth
    : latestMonth
  const savingsRate = savingsSource?.savings_rate != null ? savingsSource.savings_rate * 100 : null
  const savingsTarget = settings.data?.effective.financial_targets.savings_rate_target ?? null
  const savingsTargetPct = savingsTarget != null ? savingsTarget * 100 : null

  // 주의 신호
  const anomalyCount = anomalies.data?.total ?? null
  const recurringCount = recurring.data?.total ?? null
  const incomeCV = incomeStability.data?.coefficient_of_variation
  const velocityData = velocity.data

  // 해야 할 일
  const queueItems = canonical.data?.unclassified_work_queue ?? []
  const queueCount = canonical.data ? queueItems.length : null
  const dryRunCount = dryRun.data ? dryRun.data.items.length : null
  const unlinkedCount = unlinkedLoans.data?.total ?? null
  const coverage = velocityData?.classification_coverage_ratio ?? null

  const kpiLoading = canonical.isLoading || cashflow.isLoading || snapshots.isLoading
  const noData = !canonical.isLoading && !cashflow.isLoading && !spendable && cashflowItems.length === 0

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
                  label="이번 달 쓸 수 있는 돈"
                  className="border-t-2 border-t-accent md:col-span-2 xl:row-span-2"
                  value={remaining != null ? formatWonCompact(remaining) : EM_DASH}
                  badge={
                    spendable && estimated ? (
                      <Provenance
                        title="추정 기준 실질 가용액"
                        trigger={<Badge variant="estimate">예상</Badge>}
                        triggerLabel="실질 가용액 추정 근거 보기"
                        rows={[
                          { label: '수입 추정', value: incomeEstimateSourceLabel(spendable) },
                          {
                            label: '추정 수입',
                            value: spendable.estimated_income_total != null ? formatWon(spendable.estimated_income_total) : EM_DASH,
                          },
                          ...(spendable.excluded_income_periods.length > 0
                            ? [{ label: '제외 월', value: spendable.excluded_income_periods.join(', ') }]
                            : []),
                          { label: '관측 잔여', value: formatSignedWon(spendable.remaining_after_variable_spend) },
                        ]}
                        note="진행 중인 월은 월급 입금 전 왜곡을 줄이기 위해 마감월 baseline 수입으로 추정합니다."
                      />
                    ) : undefined
                  }
                  sub={
                    spendable
                      ? `${spendable.period} · 대출·고정비·필수 변동 차감 후`
                      : '실질 가용액 데이터가 없습니다'
                  }
                >
                  {spendable && (
                    <div className="mt-3 space-y-2">
                      <div className="tnum grid grid-cols-3 gap-2 text-caption text-text-muted">
                        <span>대출 {formatWonCompact(spendable.loan_repayment_total)}</span>
                        <span>고정 {formatWonCompact(spendable.fixed_commitment_total)}</span>
                        <span>필수 변동 {formatWonCompact(spendable.required_variable_total)}</span>
                      </div>
                      {sparkValues.length >= 2 && (
                        <Sparkline values={sparkValues} width={180} height={32} label="최근 6개월 실질 가용액 추이" />
                      )}
                    </div>
                  )}
                </Stat>
                <Stat
                  label="순자산"
                  value={netWorth != null ? formatWonCompact(netWorth) : EM_DASH}
                  sub={latestSnapshot ? `기준일 ${formatDay(latestSnapshot.snapshot_date)}` : undefined}
                />
                <Stat
                  label="이번 달 수입"
                  value={latestMonth ? formatWonCompact(latestMonth.income) : EM_DASH}
                  sub={latestMonth?.period}
                />
                <Stat
                  label="이번 달 지출"
                  value={latestMonth ? formatWonCompact(Math.abs(latestMonth.expense)) : EM_DASH}
                  sub={expenseMoM != null ? `전월 대비 ${formatDeltaPct(expenseMoM)}` : undefined}
                  subTone={expenseMoM != null && expenseMoM > 0 ? 'bad' : 'neutral'}
                />
                <Stat
                  label="저축률"
                  value={formatPct(savingsRate)}
                  sub={[
                    savingsSource ? `${savingsSource.period} 마감 기준` : null,
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

          {/* 현금흐름 + 주의 신호 */}
          <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
            <Card title="현금흐름" meta="최근 12개월" action={<CardLink to="/spending">지출</CardLink>}>
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
            </Card>

            <Card
              title="주의 신호"
              meta={
                <span className="inline-flex items-center gap-1">
                  직전 마감월 기준
                  <Provenance
                    title="주의 신호 기준"
                    note="이상 지출과 수입 안정성은 직전 마감월 전체를 기준으로 진단합니다. 부분 기간 기준 전환은 신호 화면에서 제공할 예정입니다."
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
                    value={anomalyCount == null ? EM_DASH : `${anomalyCount}건`}
                    tone={(anomalyCount ?? 0) > 0 ? 'warn' : 'neutral'}
                  />
                  <SignalRow label="반복 결제 감지" value={recurringCount == null ? EM_DASH : `${recurringCount}건`} />
                  <SignalRow label="수입 안정성" value={incomeStabilityLabel(incomeCV)} />
                  <SignalRow
                    label="재량 지출 속도"
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
                    label="미분류 거래"
                    value={queueCount == null ? null : queueCount >= 10 ? '10+건' : `${queueCount}건`}
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
