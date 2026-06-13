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
import { EM_DASH, formatDeltaPct, formatPct, formatWon, formatWonCompact } from '../../ds/format'
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
            <Badge variant="neutral">구매 후보</Badge>
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
          rows={Object.entries(item.signals).slice(0, 4).map(([key, value]) => ({ label: key, value: String(value) }))}
          note={item.reasons[0]}
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
  const [compareTab, setCompareTab] = useState<'mom' | 'merchants'>('mom')
  const [merchantMonths, setMerchantMonths] = useState(3)

  const cashflow = useMonthlyCashflow(6)
  const canonical = useCanonicalViewsDashboard()
  const settings = useAnalyticsSettings()
  const incomeStability = useIncomeStability(mode === 'partial' ? { end_date: referenceDate } : {})
  const anomalies = useSpendingAnomalies(
    mode === 'partial' ? { page: anomalyPage, per_page: 8, end_date: referenceDate } : { page: anomalyPage, per_page: 8 },
  )
  const velocity = useDiscretionaryVelocity({ as_of_date: referenceDate })
  const purchaseGate = usePurchaseGateCandidates({ status: 'pending', limit: 10 })
  const recurring = useRecurringPayments(recurringPage, 8)
  const categoryMoM = useCategoryMoM({})

  // 저축률: 마지막 완성월 기준 + 목표
  const incomplete = new Set(
    (canonical.data?.monthly_cashflow ?? []).filter((item) => !item.is_complete_month).map((item) => item.period),
  )
  const cashflowItems = cashflow.data?.items ?? []
  const savingsSource = canonical.data
    ? [...cashflowItems].reverse().find((item) => !incomplete.has(item.period)) ?? cashflowItems[cashflowItems.length - 1]
    : cashflowItems[cashflowItems.length - 1]
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
        list.push({ severity: 'ok', title: `저축률 ${formatPct(savingsRate)} — 목표 ${formatPct(savingsTargetPct, 0)} 달성`, description: '지출이 수입 대비 잘 관리되고 있습니다.' })
      } else {
        list.push({ severity: 'warn', title: `저축률 ${formatPct(savingsRate)}`, description: `목표 ${formatPct(savingsTargetPct, 0)}까지 여유가 있습니다.` })
      }
    }
    if (incomeCV != null && incomeCV < 0.1) {
      list.push({ severity: 'ok', title: '수입 안정성이 높습니다', description: `수입 변동계수 ${formatPct(incomeCV * 100)} — 안정적인 수입 흐름입니다.` })
    } else if (incomeCV != null && incomeCV >= 0.25) {
      list.push({ severity: 'warn', title: '수입 변동성이 큽니다', description: `수입 변동계수 ${formatPct(incomeCV * 100)} — 고정 지출 비중을 점검하세요.` })
    }
    return list
  }, [savingsRate, savingsTargetPct, incomeCV])

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
              onChange={(next) => { setMode(next); setAnomalyPage(1) }}
            />
            {mode === 'partial' && (
              <input
                aria-label="기준일"
                type="date"
                className="tnum rounded-md border border-border bg-bg-inset px-2 py-1 text-caption text-text-secondary"
                value={referenceDate}
                onChange={(event) => { setReferenceDate(event.target.value); setAnomalyPage(1) }}
              />
            )}
          </>
        }
        meta={
          <Provenance
            title="신호 기준"
            rows={[{ label: '모드', value: mode === 'closed' ? '직전 마감월' : `부분 기간 · ${referenceDate}` }]}
            note="마감월 판정은 canonical is_complete_month 기준입니다. 부분 기간은 이전 월의 같은 일자 cutoff 누적과 비교합니다."
          />
        }
      />

      <div className="flex flex-col gap-4">
        {/* KPI + 재량 속도 */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cashflow.isLoading || incomeStability.isLoading ? (
            <><StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton /></>
          ) : (
            <>
              <Stat
                label="저축률"
                value={formatPct(savingsRate)}
                sub={[savingsSource ? `${savingsSource.period} 마감 기준` : null, savingsTargetPct != null ? `목표 ${formatPct(savingsTargetPct, 0)}` : null].filter(Boolean).join(' · ') || undefined}
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
                    ? `현재 ${formatWonCompact(velocityData.discretionary_spend)} vs 기준선 ${formatWonCompact(velocityData.baseline_spend_at_same_progress)}`
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
                      <Provenance title="재량 지출 속도" note={velocityData.reasons.join(' · ') || undefined} />
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
                const severity: Severity = (item.delta_pct ?? 0) >= 50 ? 'danger' : 'warn'
                return (
                  <div key={`anomaly-${item.period}-${item.category}`} className="rounded-md border border-border bg-bg-inset px-3.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={SEVERITY_BADGE[severity].variant}>{SEVERITY_BADGE[severity].label}</Badge>
                          <Badge variant="neutral">이상 지출</Badge>
                          <span className="text-label font-semibold text-text-primary">{item.category}</span>
                        </div>
                        <div className="tnum mt-1 text-caption text-text-muted">
                          {formatWonCompact(item.amount)} (기준선 {formatWonCompact(item.baseline_avg)}, {formatDeltaPct(item.delta_pct)})
                        </div>
                      </div>
                      <Provenance
                        title="이상 지출 근거"
                        rows={[
                          { label: '기준 월', value: item.period },
                          { label: 'anomaly score', value: item.anomaly_score.toFixed(2) },
                        ]}
                        note={item.reason || anomalies.data?.assumptions}
                      />
                    </div>
                    <div className="mt-2 flex gap-3">
                      <Link
                        to={`/spending?lens=composition`}
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
            title="반복 결제"
            meta={
              <span className="inline-flex items-center gap-1.5">
                저장된 분류 · 조회 전용
                <Provenance title="진단 기준" note={recurring.data?.assumptions || undefined} />
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
            {recurring.isLoading ? <div className="p-4"><ListSkeleton rows={5} /></div> :
             recurring.data && recurring.data.items.length > 0 ? (
               <>
                 <table className="w-full border-collapse text-label">
                   <thead className="bg-bg-inset">
                     <tr>
                       {['거래처', '분류', '주기', '평균', '횟수'].map((header) => (
                         <th key={header} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{header}</th>
                       ))}
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border-subtle">
                     {recurring.data.items.map((item) => (
                       <tr key={`${item.merchant}:${item.category}`}>
                         <td className="max-w-[140px] truncate px-4 py-2 text-text-primary">{item.merchant}</td>
                         <td className="px-4 py-2"><Badge variant="neutral">{recurringKindLabel(item.recurring_payment_kind)}</Badge></td>
                         <td className="px-4 py-2 text-caption text-text-muted">{item.interval_type}</td>
                         <td className="tnum px-4 py-2 text-right text-text-secondary">{formatWonCompact(item.avg_amount)}</td>
                         <td className="tnum px-4 py-2 text-right text-text-muted">{item.occurrences}회</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
                 <Pagination page={recurringPage} perPage={8} total={recurring.data.total} onPageChange={setRecurringPage} />
               </>
             ) : <EmptyState className="py-10" message="반복 결제 데이터가 없습니다" />}
          </Card>

          <Card
            title="비교"
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
              <MerchantTopPanel months={merchantMonths} onMonthsChange={setMerchantMonths} />
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function MerchantTopPanel({ months, onMonthsChange }: { months: number; onMonthsChange: (months: number) => void }) {
  const merchants = useMerchantSpend({ months, limit: 5 })
  return (
    <div>
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
             sub: `${item.count}건 · 평균 ${formatWonCompact(item.avg_amount)}`,
           }))}
         />
       ) : <EmptyState message="거래처 데이터가 없습니다" />}
    </div>
  )
}
