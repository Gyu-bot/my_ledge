import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge, type BadgeVariant } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { Pagination } from '../../ds/Pagination'
import { Provenance } from '../../ds/Provenance'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { Stat } from '../../ds/Stat'
import { ListSkeleton, StatSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { HBarList } from '../../ds/charts/HBarList'
import { MoMList } from '../../ds/charts/MoMList'
import { EM_DASH, formatDeltaPct, formatPct, formatNetWon, formatWon } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import {
  useCategoryMoM,
  useDiscretionaryVelocity,
  useIncomeStability,
  useMerchantSpend,
  useMonthlyCashflow,
  usePurchaseGateCandidates,
  useRecurringPayments,
  useReviewPurchaseGateCandidate,
  useSpendingAnomalies,
} from '../../hooks/useAnalytics'
import { useCanonicalViewsDashboard } from '../../hooks/useCanonicalViews'
import { useAnalyticsSettings } from '../../hooks/useSettings'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import { monthToDateRange, recentMonthsToDateRange } from '../../lib/dateRange'
import type { AnalyticsRiskLevel, PurchaseGateCandidateItem, RecurringPaymentItem } from '../../types/analytics'

type SignalMode = 'closed' | 'partial'
type FeedFilter = 'all' | 'anomaly' | 'purchase' | 'status'
type Severity = 'danger' | 'warn' | 'ok'

const SEVERITY_BADGE: Record<Severity, { variant: BadgeVariant; label: string }> = {
  danger: { variant: 'expense', label: '확인 필요' },
  warn: { variant: 'warn', label: '주의' },
  ok: { variant: 'accent', label: '양호' },
}

function riskLabel(level: AnalyticsRiskLevel): string {
  if (level === 'needs_classification') return '분류 필요'
  if (level === 'unknown') return '불명'
  if (level === 'high' || level === 'critical') return '높음'
  if (level === 'warning') return '주의'
  if (level === 'watch') return '관찰'
  if (level === 'normal') return '정상'
  return '낮음'
}

function riskVariant(level: AnalyticsRiskLevel): BadgeVariant {
  if (level === 'needs_classification' || level === 'unknown') return 'neutral'
  if (level === 'high' || level === 'critical') return 'expense'
  if (level === 'warning' || level === 'watch') return 'warn'
  return 'accent'
}

function confidenceLabel(value: string): string {
  if (value === 'high') return '높음'
  if (value === 'medium') return '보통'
  if (value === 'low') return '낮음'
  return value || EM_DASH
}

function gateTypeLabel(value: string): string {
  if (value === 'large_oneoff') return '큰 일회성'
  if (value === 'new_merchant') return '신규 거래처'
  if (value === 'merchant_spike') return '거래처 급증'
  if (value === 'discretionary_spike') return '재량 급증'
  return value
}

function recurringKindLabel(value: RecurringPaymentItem['recurring_payment_kind']): string {
  if (value === 'installment') return '할부'
  if (value === 'monthly_recurring') return '매월 반복'
  if (value === 'not_recurring') return '반복 아님'
  return '미분류'
}

function activityLabel(value: RecurringPaymentItem['activity_status']): string {
  if (value === 'active_candidate') return '최근 반복 후보'
  if (value === 'historical') return '과거 이력'
  if (value === 'irregular') return '불규칙'
  if (value === 'non_positive') return '순지출 없음'
  if (value === 'not_recurring') return '반복 아님'
  return '이력 확인'
}

function intervalLabel(value: string): string {
  return value === 'monthly' ? '매월' : value === 'weekly' ? '매주' : '불규칙'
}

function signalEvidence(signals: PurchaseGateCandidateItem['signals']) {
  const labels: Record<string, string> = {
    threshold: '큰 지출 기준', lookback_months: '이전 관측 개월', baseline_avg: '과거 월평균',
    current_total: '선택기간 합계', ratio: '기준선 대비 배수', threshold_ratio: '확인 기준 배수',
    refund_netting_refund_total: '반영한 환급액', zscore: '평소 대비 이탈 정도',
  }
  return Object.entries(signals).flatMap(([rawKey, value]) => {
    const namespace = rawKey.match(/^(large_oneoff|new_merchant|merchant_spike|discretionary_spike)[_.:]/)?.[1]
    const key = rawKey.replace(/^(large_oneoff|new_merchant|merchant_spike|discretionary_spike)[_.:]/, '')
    if (!labels[key]) return []
    const formatted = typeof value === 'number' && ['threshold', 'baseline_avg', 'current_total', 'refund_netting_refund_total'].includes(key)
      ? formatNetWon(value) : typeof value === 'boolean' ? (value ? '예' : '아니요') : String(value)
    return [{ label: namespace ? `${gateTypeLabel(namespace)} · ${labels[key]}` : labels[key], value: formatted }]
  }).slice(0, 4)
}

function todayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function PurchaseGateCard({ item }: { item: PurchaseGateCandidateItem }) {
  const hasWrite = useWriteAccess()
  const review = useReviewPurchaseGateCandidate()
  const [memo, setMemo] = useState('')
  const typeLabels = [...new Set((item.candidate_types.length > 0 ? item.candidate_types : [item.candidate_type]).map(gateTypeLabel))]
  const severity: Severity =
    item.risk_level === 'high' || item.risk_level === 'critical' ? 'danger' : 'warn'

  function submit(status: 'reviewed' | 'ignored' | 'snoozed') {
    review.mutate({
      candidateKey: item.candidate_key,
      data: {
        review_status: status,
        memo: memo.trim() || null,
        ...(status === 'snoozed' ? { cooldown_days: 14 } : {}),
      },
    })
  }

  return (
    <div className="rounded-md border border-border bg-bg-inset px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={SEVERITY_BADGE[severity].variant}>{SEVERITY_BADGE[severity].label}</Badge>
            <Badge variant="neutral">지출 검토 후보</Badge>
            {item.possible_cancellation && <Badge variant="neutral">취소 가능성 · 확인 필요</Badge>}
            <span className="truncate text-label font-semibold text-text-primary">
              {item.merchant || `거래 #${item.transaction_id}`}
            </span>
          </div>
          <div className="tnum mt-1 text-caption text-text-muted">
            {item.date} · {formatWon(item.amount)} · {item.category}
          </div>
        </div>
        <Badge variant={riskVariant(item.risk_level)}>{riskLabel(item.risk_level)}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {typeLabels.map((label) => <Badge key={label} variant="transfer">{label}</Badge>)}
        <Provenance
          title="후보 산출 근거"
          rows={signalEvidence(item.signals)}
          note={item.possible_cancellation ? '같은 날 같은 금액의 반대 방향 거래가 있습니다. 취소로 확정되지 않았으며 실제 지출 여부를 확인하세요.' : item.reasons[0]?.replace(/baseline/g, '기준선')}
        />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <input
          aria-label={`${item.merchant} 리뷰 메모`}
          className="w-36 rounded-md border border-border bg-bg-surface px-2 py-1 text-caption text-text-secondary"
          placeholder="메모 (선택)"
          value={memo}
          disabled={!hasWrite || review.isPending}
          onChange={(event) => setMemo(event.target.value)}
        />
        {([
          ['reviewed', '검토함'],
          ['ignored', '무시'],
          ['snoozed', '스누즈 14일'],
        ] as const).map(([status, label]) => (
          <button
            key={status}
            type="button"
            disabled={!hasWrite || review.isPending}
            onClick={() => submit(status)}
            className="rounded-md border border-border px-2.5 py-1 text-caption text-text-secondary transition-colors duration-fast hover:border-border-strong disabled:opacity-40"
            title={hasWrite ? undefined : 'API 키가 없어 저장할 수 없습니다'}
          >
            {label}
          </button>
        ))}
        {review.isError ? <span className="text-caption text-expense">저장 실패 — 다시 시도하세요</span> : null}
      </div>
    </div>
  )
}

export function SignalsPage() {
  const [mode, setMode] = useState<SignalMode>('closed')
  const [referenceDate, setReferenceDate] = useState(todayString)
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all')
  const [anomalyPage, setAnomalyPage] = useState(1)
  const [recurringPage, setRecurringPage] = useState(1)
  const [recurringActivity, setRecurringActivity] = useState<'active' | 'history' | 'all'>('active')
  const [compareTab, setCompareTab] = useState<'mom' | 'merchants'>('mom')
  const [merchantMonths, setMerchantMonths] = useState(3)

  const canonical = useCanonicalViewsDashboard()
  const settings = useAnalyticsSettings()
  const today = todayString()
  const calendarPrevious = new Date(`${today.slice(0, 7)}-01T12:00:00`)
  calendarPrevious.setDate(0)
  const previousPeriod = `${calendarPrevious.getFullYear()}-${String(calendarPrevious.getMonth() + 1).padStart(2, '0')}`
  const closedPeriod = (canonical.data?.monthly_cashflow ?? [])
    .filter((item) => item.is_complete_month && item.period <= previousPeriod)
    .map((item) => item.period).sort().slice(-1)[0]
  const cutoff = mode === 'partial' ? referenceDate : monthToDateRange(closedPeriod ?? previousPeriod).end_date
  const period = cutoff.slice(0, 7)
  const cutoffRange = { start_date: `${period}-01`, end_date: cutoff }
  const closedUnavailable = mode === 'closed' && !closedPeriod
  const scopeLabel = closedUnavailable ? '마감월 관측 범위 확인' : `${period} · ${mode === 'partial' ? `${cutoff}까지 누적` : '마감월 전체'}`
  const cashflow = useMonthlyCashflow(cutoffRange)
  const incomeStability = useIncomeStability({ end_date: cutoff })
  const anomalies = useSpendingAnomalies({ page: anomalyPage, per_page: 8, end_date: cutoff })
  const velocity = useDiscretionaryVelocity({ as_of_date: cutoff })
  const purchaseGate = usePurchaseGateCandidates({ status: 'pending', limit: 10, ...cutoffRange })
  const recurring = useRecurringPayments(recurringPage, 8, { activity: recurringActivity, recent_days: 90, end_date: cutoff })
  const categoryMoM = useCategoryMoM({ end_date: cutoff })
  const savingsSource = cashflow.data?.items.find((item) => item.period === period)
  const savingsRate = savingsSource?.savings_rate != null ? savingsSource.savings_rate * 100 : null
  const savingsTarget = settings.data?.effective.financial_targets.savings_rate_target ?? null
  const savingsTargetPct = savingsTarget != null ? savingsTarget * 100 : null

  const incomeCV = incomeStability.data?.coefficient_of_variation
  const cvLabel = incomeCV == null ? EM_DASH : incomeCV < 0.1 ? '안정' : incomeCV < 0.25 ? '보통' : '불안정'
  const anomalyTotal = anomalies.data?.total ?? null
  const velocityData = velocity.data

  // 상태 신호 (클라이언트 룰)
  const statusSignals = useMemo(() => {
    const list: Array<{ severity: Severity; title: string; description: string }> = []
    if (savingsRate != null && savingsTargetPct != null) {
      if (savingsRate >= savingsTargetPct) {
        list.push({ severity: 'ok', title: `저축률 ${formatPct(savingsRate)} — 목표 ${formatPct(savingsTargetPct, 0)} 달성`, description: mode === 'partial' ? '선택일까지의 실적입니다. 월말 전망이나 마감월 저축률은 아닙니다.' : '선택한 마감월의 실제 수입과 순지출을 비교했습니다.' })
      } else {
        list.push({ severity: 'warn', title: `저축률 ${formatPct(savingsRate)}`, description: mode === 'partial' ? '선택일까지의 실적입니다. 미입금 예상 수입과 남은 지출은 포함하지 않습니다.' : `설정한 목표 ${formatPct(savingsTargetPct, 0)}보다 낮습니다.` })
      }
    }
    if (incomeCV != null && incomeCV < 0.1) {
      list.push({ severity: 'ok', title: '수입 안정성이 높습니다', description: `수입 변동계수 ${formatPct(incomeCV * 100)} — 안정적인 수입 흐름입니다.` })
    } else if (incomeCV != null && incomeCV >= 0.25) {
      list.push({ severity: 'warn', title: '수입 변동성이 큽니다', description: `수입 변동계수 ${formatPct(incomeCV * 100)} — 고정 지출 비중을 점검하세요.` })
    }
    return list
  }, [savingsRate, savingsTargetPct, incomeCV, mode])

  const showAnomalies = feedFilter === 'all' || feedFilter === 'anomaly'
  const showPurchase = feedFilter === 'all' || feedFilter === 'purchase'
  const showStatus = feedFilter === 'all' || feedFilter === 'status'

  const feedLoading = anomalies.isLoading || purchaseGate.isLoading || cashflow.isLoading
  const anomalyItems = anomalies.data?.items ?? []
  const purchaseItems = purchaseGate.data?.items ?? []
  const feedEmpty =
    !feedLoading
    && (!showAnomalies || anomalyItems.length === 0)
    && (!showPurchase || purchaseItems.length === 0)
    && (!showStatus || statusSignals.length === 0)

  return (
    <>
      <PageHeader
        title="신호"
        controls={
          <>
            <SegmentedControl
              ariaLabel="신호 기준 모드"
              options={[
                { value: 'closed', label: '직전 마감월' },
                { value: 'partial', label: '부분 기간' },
              ] as const}
              value={mode}
              onChange={(next) => { setMode(next); setAnomalyPage(1); setRecurringPage(1) }}
            />
            {mode === 'partial' && (
              <input
                aria-label="기준일"
                type="date"
                className="tnum rounded-md border border-border bg-bg-inset px-2 py-1 text-caption text-text-secondary"
                value={referenceDate}
                max={today}
                onChange={(event) => {
                  if (!event.target.value) return
                  setReferenceDate(event.target.value); setAnomalyPage(1); setRecurringPage(1)
                }}
              />
            )}
          </>
        }
        meta={
          <Provenance
            title="신호 기준"
            rows={[{ label: '조회 기준', value: scopeLabel }]}
            note="거래 관측 범위로 확인된 마지막 마감월을 사용합니다. 부분기간 전월 비교는 같은 일자까지의 누적입니다. 재량 속도는 과거 월평균에 선택월 진행률을 곱한 기준과 비교합니다."
          />
        }
      />

      {closedUnavailable ? (
        canonical.isLoading ? <StatSkeleton /> : canonical.error ? <ErrorState onRetry={() => void canonical.refetch()} /> :
          <EmptyState message="거래 관측 범위로 확인된 마감월이 없습니다. 부분 기간을 선택해 조회할 수 있습니다." />
      ) : <div className="flex flex-col gap-4">
        <p className="text-caption text-text-muted">{scopeLabel} · 모든 신호의 종료 기준일입니다. 반복 이력과 거래처 비교는 별도 표시한 과거 관측 기간을 포함합니다.</p>
        {/* KPI + 재량 속도 */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cashflow.isLoading || incomeStability.isLoading ? (
            <><StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton /></>
          ) : (
            <>
              <Stat
                label="저축률"
                value={formatPct(savingsRate)}
                sub={[savingsSource ? `${savingsSource.period} ${mode === 'partial' ? '부분기간 실적' : '마감 기준'}` : null, savingsTargetPct != null ? `목표 ${formatPct(savingsTargetPct, 0)}` : null].filter(Boolean).join(' · ') || undefined}
                subTone={savingsRate != null && savingsTargetPct != null && savingsRate >= savingsTargetPct ? 'good' : 'neutral'}
              />
              <Stat label="수입 변동성" value={cvLabel} sub={incomeCV != null ? `CV ${formatPct(incomeCV * 100)}` : undefined} />
              <Stat
                label="이상 지출 카테고리"
                value={anomalyTotal != null ? `${anomalyTotal}개` : EM_DASH}
                subTone={(anomalyTotal ?? 0) > 0 ? 'bad' : 'neutral'}
              />
              <Stat
                label="재량 지출 속도"
                value={velocityData?.velocity_ratio != null ? `${velocityData.velocity_ratio.toFixed(2)}x` : EM_DASH}
                badge={velocityData ? <Badge variant={riskVariant(velocityData.risk_level)}>{riskLabel(velocityData.risk_level)}</Badge> : undefined}
                sub={
                  velocityData
                    ? `순지출 ${formatNetWon(velocityData.discretionary_spend, { compact: true })} vs 기준선 ${formatNetWon(velocityData.baseline_spend_at_same_progress, { compact: true })}`
                    : undefined
                }
              >
                {velocityData && (
                  <div className="tnum mt-2 flex flex-wrap gap-2 text-micro text-text-muted">
                    <span>진행률 {formatPct(velocityData.month_progress_ratio * 100, 0)}</span>
                    <span>
                      커버리지 {
                        velocityData.classification_coverage_ratio != null
                          ? formatPct(velocityData.classification_coverage_ratio * 100, 0)
                          : EM_DASH
                      }
                    </span>
                    <span className="inline-flex items-center gap-1">
                      신뢰도 {confidenceLabel(velocityData.confidence)}
                      <Provenance title="재량 지출 속도" note={velocityData.reasons.map((reason) => reason.replace(/baseline/g, '기준선')).join(' · ') || undefined} />
                    </span>
                  </div>
                )}
              </Stat>
            </>
          )}
        </div>

        {/* 신호 피드 */}
        <Card
          title="신호 피드"
          meta="심각도순"
          action={
            <SegmentedControl
              ariaLabel="신호 타입 필터"
              options={[
                { value: 'all', label: '전체' },
                { value: 'anomaly', label: '이상 지출' },
                { value: 'purchase', label: '구매 후보' },
                { value: 'status', label: '상태' },
              ] as const}
              value={feedFilter}
              onChange={setFeedFilter}
            />
          }
        >
          {feedLoading ? <ListSkeleton rows={4} /> :
           anomalies.error ? <ErrorState onRetry={() => void anomalies.refetch()} /> :
           feedEmpty ? <EmptyState message="표시할 신호가 없습니다 — 좋은 신호입니다" /> : (
            <div className="flex flex-col gap-2.5">
              {showAnomalies && anomalyItems.map((item) => {
                const decrease = item.direction === 'decrease' || item.amount < item.baseline_avg
                const severity: Severity = decrease ? 'ok' : (item.delta_pct_display ?? item.delta_pct ?? 0) >= 50 ? 'danger' : 'warn'
                const deltaDisplay = item.delta_pct_display === undefined ? item.delta_pct : item.delta_pct_display
                const anomalyEnd = item.period === period ? cutoff : monthToDateRange(item.period).end_date
                const drilldown = new URLSearchParams({ lens: 'composition', category: item.category, from: item.period, to: item.period, start_date: `${item.period}-01`, end_date: anomalyEnd })
                return (
                  <div key={`anomaly-${item.period}-${item.category}`} className="rounded-md border border-border bg-bg-inset px-3.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={SEVERITY_BADGE[severity].variant}>{item.amount < 0 ? '순환급' : decrease ? '지출 감소' : SEVERITY_BADGE[severity].label}</Badge>
                          <Badge variant="neutral">지출 변동</Badge>
                          <span className="text-label font-semibold text-text-primary">{item.category}</span>
                        </div>
                        <div className="tnum mt-1 text-caption text-text-muted">
                          {formatNetWon(item.amount, { compact: true })} (기준선 {formatNetWon(item.baseline_avg, { compact: true })}, {deltaDisplay == null ? '비교 기준 부족' : formatDeltaPct(deltaDisplay)})
                        </div>
                      </div>
                      <Provenance
                        title="이상 지출 근거"
                        rows={[
                          { label: '기준 월', value: item.period },
                          { label: '평소 대비 이탈 정도', value: item.anomaly_score.toFixed(2) },
                        ]}
                        note={item.reason?.replace(/baseline/g, '기준선') || '선택한 기간의 순지출을 과거 관측값과 비교합니다.'}
                      />
                    </div>
                    <div className="mt-2 flex gap-3">
                      <Link
                        to={`/spending?${drilldown.toString()}`}
                        className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline"
                      >
                        지출에서 {item.category} 보기
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )
              })}
              {showAnomalies && anomalies.data && anomalies.data.total > 8 && (
                <Pagination page={anomalyPage} perPage={8} total={anomalies.data.total} onPageChange={setAnomalyPage} />
              )}

              {showPurchase && purchaseItems.map((item) => <PurchaseGateCard key={item.candidate_key} item={item} />)}

              {showStatus && statusSignals.map((signal) => (
                <div key={signal.title} className="rounded-md border border-border bg-bg-inset px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={SEVERITY_BADGE[signal.severity].variant}>{SEVERITY_BADGE[signal.severity].label}</Badge>
                    <Badge variant="neutral">상태</Badge>
                    <span className="text-label font-semibold text-text-primary">{signal.title}</span>
                  </div>
                  <div className="mt-1 text-caption text-text-muted">{signal.description}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 반복 결제 + 비교 */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title="반복 결제 후보·이력"
            meta={
              <span className="inline-flex items-center gap-1.5">
                {cutoff} 기준 · 활성 구독으로 확정된 목록은 아닙니다
                <Provenance title="진단 기준" note="최근 후보는 기준일 전 90일 이내 결제가 관측된 반복 거래입니다. 불규칙·과거 이력·순지출 없는 항목은 별도로 확인할 수 있습니다." />
              </span>
            }
            action={
              <Link
                to="/data/transactions?view=groups"
                className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline"
              >
                분류 바꾸기
                <ArrowRight className="h-3 w-3" />
              </Link>
            }
            bodyClassName="p-0"
          >
            <div className="p-3">
              <SegmentedControl
                ariaLabel="반복 결제 관측 범위"
                options={[{ value: 'active', label: '최근 후보' }, { value: 'history', label: '과거·기타' }, { value: 'all', label: '전체 이력' }] as const}
                value={recurringActivity}
                onChange={(next) => { setRecurringActivity(next); setRecurringPage(1) }}
              />
            </div>
            {recurring.isLoading ? <div className="p-4"><ListSkeleton rows={5} /></div> :
             recurring.data && recurring.data.items.length > 0 ? (
               <>
                 <div className="overflow-x-auto">
                 <table className="w-full border-collapse text-label">
                   <thead className="bg-bg-inset">
                     <tr>
                       {['거래처', '분류', '주기·상태', '평균', '횟수', '마지막 관측'].map((header) => (
                         <th key={header} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{header}</th>
                       ))}
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border-subtle">
                     {recurring.data.items.map((item) => (
                       <tr key={`${item.merchant}:${item.category}`}>
                         <td className="max-w-[140px] truncate px-4 py-2 text-text-primary">{item.merchant}</td>
                         <td className="px-4 py-2"><Badge variant="neutral">{recurringKindLabel(item.recurring_payment_kind)}</Badge></td>
                         <td className="px-4 py-2 text-caption text-text-muted">{intervalLabel(item.interval_type)} · {activityLabel(item.activity_status)}</td>
                         <td className="tnum px-4 py-2 text-right text-text-secondary">{formatNetWon(item.avg_amount, { compact: true })}</td>
                         <td className="tnum px-4 py-2 text-right text-text-muted">{item.occurrences}회</td>
                         <td className="tnum px-4 py-2 text-caption text-text-muted">{item.last_date}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
                 </div>
                 <Pagination page={recurringPage} perPage={8} total={recurring.data.total} onPageChange={setRecurringPage} />
               </>
             ) : <EmptyState className="py-10" message="반복 결제 데이터가 없습니다" />}
          </Card>

          <Card
            title="비교"
            meta={categoryMoM.data?.is_partial_period ? '부분기간 · 전월 같은 일자 누적과 비교' : `${period} · 전월 전체와 비교`}
            action={
              <SegmentedControl
                ariaLabel="비교 도구"
                options={[
                  { value: 'mom', label: '카테고리 MoM' },
                  { value: 'merchants', label: '거래처 Top' },
                ] as const}
                value={compareTab}
                onChange={setCompareTab}
              />
            }
          >
            {compareTab === 'mom' ? (
              categoryMoM.isLoading ? <ListSkeleton rows={5} /> :
              categoryMoM.data && categoryMoM.data.items.length > 0 ? (
                <MoMList items={categoryMoM.data.items} />
              ) : <EmptyState message="비교할 데이터가 없습니다" />
            ) : (
              <MerchantTopPanel months={merchantMonths} cutoff={cutoff} onMonthsChange={setMerchantMonths} />
            )}
          </Card>
        </div>
      </div>}
    </>
  )
}

function MerchantTopPanel({ months, cutoff, onMonthsChange }: { months: number; cutoff: string; onMonthsChange: (months: number) => void }) {
  const dates = recentMonthsToDateRange(months, new Date(`${cutoff}T12:00:00`))
  const merchants = useMerchantSpend({ start_date: dates.start_date, end_date: cutoff, limit: 5 })
  return (
    <div>
      <p className="mb-2 text-caption text-text-muted">{dates.start_date} ~ {cutoff} 누적</p>
      <div className="mb-3">
        <label className="sr-only" htmlFor="merchant-months">기간</label>
        <select
          id="merchant-months"
          className="rounded-md border border-border bg-bg-inset px-2 py-1 text-caption text-text-secondary"
          value={months}
          onChange={(event) => onMonthsChange(Number(event.target.value))}
        >
          <option value={1}>최근 1개월</option>
          <option value={3}>최근 3개월</option>
          <option value={6}>최근 6개월</option>
          <option value={12}>최근 1년</option>
        </select>
      </div>
      {merchants.isLoading ? <ListSkeleton rows={5} /> :
       merchants.data && merchants.data.items.length > 0 ? (
         <HBarList
           items={merchants.data.items.map((item) => ({
             label: item.merchant,
             amount: item.amount,
             sub: `${item.count}건 · 평균 ${formatNetWon(item.avg_amount, { compact: true })}`,
           }))}
         />
       ) : <EmptyState message="거래처 데이터가 없습니다" />}
    </div>
  )
}
