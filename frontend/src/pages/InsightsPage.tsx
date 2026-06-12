import { useEffect, useState } from 'react'
import { KpiCard } from '../components/ui/KpiCard'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { MoMBarList } from '../components/charts/MoMBarList'
import {
  useMonthlyCashflow, useIncomeStability,
  useRecurringPayments, useSpendingAnomalies,
  useMerchantSpend, useCategoryMoM,
  useDiscretionaryVelocity, usePurchaseGateCandidates, useReviewPurchaseGateCandidate,
} from '../hooks/useAnalytics'
import { useChromeContext } from '../components/layout/chromeContext'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { formatKRW, formatKRWCompact, formatPct } from '../lib/utils'
import type {
  AnalyticsRiskLevel,
  PurchaseGateCandidateItem,
  RecurringPaymentItem,
} from '../types/analytics'

interface InsightItem {
  icon: string
  title: string
  description: string
  variant: 'ok' | 'warn' | 'danger'
}

const VARIANT_BADGE: Record<string, string> = {
  ok:     'bg-accent-dim text-accent border border-accent-muted',
  warn:   'bg-warn-dim text-warn border border-warn-muted',
  danger: 'bg-danger-dim text-danger border border-danger-muted',
}
const VARIANT_LABEL: Record<string, string> = {
  ok: '양호', warn: '주의', danger: '확인 필요',
}

function recurringKindLabel(value: RecurringPaymentItem['recurring_payment_kind']) {
  if (value === 'installment') return '할부'
  if (value === 'monthly_recurring') return '매월 반복'
  return '미분류'
}

function recurringKindSummary(item: RecurringPaymentItem) {
  return [
    item.installment_count > 0 ? `할부 ${item.installment_count}` : null,
    item.monthly_recurring_count > 0 ? `매월 ${item.monthly_recurring_count}` : null,
    `미분류 ${item.unclassified_count}`,
  ].filter(Boolean).join(' · ')
}

function riskLabel(value: AnalyticsRiskLevel) {
  if (value === 'high' || value === 'critical') return '높음'
  if (value === 'warning') return '주의'
  if (value === 'watch') return '관찰'
  return '낮음'
}

function riskBadgeClass(value: AnalyticsRiskLevel) {
  if (value === 'high' || value === 'critical') return VARIANT_BADGE.danger
  if (value === 'warning' || value === 'watch') return VARIANT_BADGE.warn
  return VARIANT_BADGE.ok
}

function purchaseGateTypeLabel(value: string) {
  if (value === 'large_oneoff') return '큰 일회성'
  if (value === 'new_merchant') return '신규 거래처'
  if (value === 'merchant_spike') return '거래처 급증'
  if (value === 'discretionary_spike') return '재량 급증'
  return value
}

function purchaseGateTypeLabels(item: PurchaseGateCandidateItem) {
  const rawTypes = item.candidate_types.length > 0
    ? item.candidate_types
    : [item.candidate_type]
  return [...new Set(rawTypes.map((value) => purchaseGateTypeLabel(value)))]
}

export function InsightsPage() {
  const cashflow = useMonthlyCashflow(6)
  const incomeStability = useIncomeStability()
  const [recurringPage, setRecurringPage] = useState(1)
  const [anomalyPage, setAnomalyPage] = useState(1)
  const [merchantMonths, setMerchantMonths] = useState(3)
  const now = new Date()
  const allMonths = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }).reverse()
  const [categoryBaseMonth, setCategoryBaseMonth] = useState(allMonths[allMonths.length - 1])
  const [showRecurringAssumption, setShowRecurringAssumption] = useState(false)
  const [showAnomalyAssumption, setShowAnomalyAssumption] = useState(false)
  const [anomalyMode, setAnomalyMode] = useState<'closed' | 'partial'>('closed')
  const partialEndDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const recurring = useRecurringPayments(recurringPage, 10)
  const anomalies = useSpendingAnomalies(
    anomalyMode === 'partial'
      ? { page: anomalyPage, per_page: 10, end_date: partialEndDate }
      : { page: anomalyPage, per_page: 10 },
  )
  const discretionaryVelocity = useDiscretionaryVelocity({ as_of_date: partialEndDate })
  const purchaseGateCandidates = usePurchaseGateCandidates({ status: 'pending', limit: 5 })
  const reviewPurchaseGateCandidate = useReviewPurchaseGateCandidate()
  const canWrite = useWriteAccess()
  const merchants = useMerchantSpend({ months: merchantMonths, limit: 5 })
  const categoryMoM = useCategoryMoM({
    start_month: allMonths[Math.max(0, allMonths.indexOf(categoryBaseMonth) - 1)],
    end_month: categoryBaseMonth,
  })
  const { setMetaBadge } = useChromeContext()
  const anomalyModeLabel = anomalyMode === 'closed' ? '직전 마감월' : '부분 기간'
  const anomalyGuidance =
    anomalyMode === 'closed'
      ? '기본값은 직전 마감월 전체 지출을 기준으로 이상지출을 탐지합니다.'
      : `부분 기간은 ${partialEndDate}까지 누적 지출을 이전 월의 같은 일자 cutoff와 비교합니다.`

  // 요약 지표 계산
  const latestCashflow = cashflow.data?.items?.[cashflow.data.items.length - 1]
  const savingsRate = latestCashflow?.savings_rate != null ? latestCashflow.savings_rate * 100 : null
  const incomeCV = incomeStability.data?.coefficient_of_variation
  const incomeStabilityLabel = incomeCV == null ? '—' : incomeCV < 0.1 ? '낮음' : incomeCV < 0.25 ? '보통' : '높음'
  const anomalyCount = anomalies.data?.total ?? null

  // 핵심 인사이트 생성 (클라이언트 조합)
  const insights: InsightItem[] = []
  if (savingsRate != null) {
    if (savingsRate > 50) insights.push({ icon: '💰', title: `저축률 ${formatPct(savingsRate)} — 목표 초과 달성`, description: '지출이 수입 대비 잘 관리되고 있습니다.', variant: 'ok' })
    else if (savingsRate > 0) insights.push({ icon: '📊', title: `저축률 ${formatPct(savingsRate)}`, description: '저축률 50% 목표까지 여유가 있습니다.', variant: 'warn' })
  }
  if (anomalyCount != null && anomalyCount > 0) {
    insights.push({ icon: '⚠️', title: `이상 지출 ${anomalyCount}개 카테고리 감지`, description: '전월 대비 급증한 지출 카테고리가 있습니다. 이상 지출 탭을 확인해주세요.', variant: 'warn' })
  }
  if (recurring.data?.total != null && recurring.data.total > 0) {
    insights.push({ icon: '🔁', title: `반복 결제 ${recurring.data.total}건 감지`, description: '정기 결제 항목을 확인하고 불필요한 구독을 정리해보세요.', variant: 'warn' })
  }
  if (incomeStabilityLabel === '낮음') {
    insights.push({ icon: '✅', title: '수입 안정성이 높습니다', description: `최근 6개월 수입 변동계수 ${formatPct(incomeCV != null ? incomeCV * 100 : null)} — 안정적인 수입 흐름입니다.`, variant: 'ok' })
  }

  useEffect(() => {
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        핵심 인사이트 {insights.length}건
      </span>
    )
    return () => setMetaBadge(null)
  }, [insights.length, setMetaBadge])

  return (
    <div className="flex flex-col gap-4">

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="저축률" value={formatPct(savingsRate)} subVariant={savingsRate != null && savingsRate > 50 ? 'up' : 'neutral'} />
        <KpiCard label="수입 변동성" value={incomeStabilityLabel} />
        <KpiCard label="이상 지출 카테고리" value={anomalyCount != null ? `${anomalyCount}개` : '—'} subVariant={anomalyCount ? 'down' : 'neutral'} />
      </div>

      {/* 핵심 인사이트 */}
      <SectionCard title="핵심 인사이트" meta={`${insights.length}건`}>
        {insights.length === 0 ? <EmptyState message="분석할 데이터가 부족합니다" /> : (
          <div className="flex flex-col gap-2">
            {insights.map((insight, i) => (
              <div key={i} className="flex gap-3 p-3 bg-surface-bar border border-border rounded-lg">
                <div className="w-7 h-7 rounded-md bg-border-subtle flex items-center justify-center text-body-md shrink-0">{insight.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-label font-semibold text-text-primary mb-0.5">{insight.title}</div>
                  <div className="text-caption text-text-faint">{insight.description}</div>
                </div>
                <span className={`text-nano px-1.5 py-0.5 rounded self-start shrink-0 ${VARIANT_BADGE[insight.variant]}`}>
                  {VARIANT_LABEL[insight.variant]}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Advisor 후보 신호 */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="재량 지출 속도" meta="조용한 참고 신호">
          {discretionaryVelocity.isLoading ? <LoadingState /> :
           discretionaryVelocity.data ? (
             <div className="flex flex-col gap-3">
               <div className="flex items-start justify-between gap-3">
                 <div>
                   <div className="text-kpi font-bold text-text-primary">
                     {discretionaryVelocity.data.velocity_ratio == null
                       ? '—'
                       : `${discretionaryVelocity.data.velocity_ratio.toFixed(2)}x`}
                   </div>
                   <div className="text-caption text-text-faint">
                     {discretionaryVelocity.data.period} · {discretionaryVelocity.data.as_of_date} 기준
                   </div>
                 </div>
                 <span className={`text-nano px-1.5 py-0.5 rounded shrink-0 ${riskBadgeClass(discretionaryVelocity.data.risk_level)}`}>
                   {riskLabel(discretionaryVelocity.data.risk_level)}
                 </span>
               </div>
               <div className="grid grid-cols-2 gap-2 text-caption">
                 <div className="bg-surface-bar border border-border rounded p-2">
                   <div className="text-micro text-text-ghost mb-1">현재 재량 지출</div>
                   <div className="font-semibold text-text-primary">₩ {formatKRW(discretionaryVelocity.data.discretionary_spend)}</div>
                 </div>
                 <div className="bg-surface-bar border border-border rounded p-2">
                   <div className="text-micro text-text-ghost mb-1">진행률 기준선</div>
                   <div className="font-semibold text-text-primary">₩ {formatKRW(discretionaryVelocity.data.baseline_spend_at_same_progress)}</div>
                 </div>
               </div>
               <div className="flex flex-wrap gap-2 text-micro text-text-muted">
                 <span className="bg-surface-bar border border-border-subtle rounded-full px-2 py-0.5">
                   월 진행률 {formatPct(discretionaryVelocity.data.month_progress_ratio * 100)}
                 </span>
                 <span className="bg-surface-bar border border-border-subtle rounded-full px-2 py-0.5">
                   분류 커버리지 {formatPct(discretionaryVelocity.data.classification_coverage_ratio * 100)}
                 </span>
                 <span className="bg-surface-bar border border-border-subtle rounded-full px-2 py-0.5">
                   confidence {formatPct(discretionaryVelocity.data.confidence * 100)}
                 </span>
               </div>
               {discretionaryVelocity.data.reasons[0] && (
                 <div className="text-caption text-text-faint leading-relaxed">
                   {discretionaryVelocity.data.reasons[0]}
                 </div>
               )}
             </div>
           ) : <EmptyState message="재량 지출 속도 데이터가 없습니다" />}
        </SectionCard>

        <SectionCard
          title="구매 게이트 후보"
          meta={`${purchaseGateCandidates.data?.total ?? 0}건`}
          description="리뷰 후보만 표시하며 최종 구매 판단은 에이전트와 사용자 맥락에 맡깁니다."
        >
          {purchaseGateCandidates.isLoading ? <LoadingState /> :
           purchaseGateCandidates.data && purchaseGateCandidates.data.items.length > 0 ? (
             <div className="flex flex-col divide-y divide-border-subtle">
               {purchaseGateCandidates.data.items.map((item) => {
                 const signals = Object.entries(item.signals).slice(0, 2)
                 const typeLabels = purchaseGateTypeLabels(item)
                 return (
                 <div key={item.candidate_key} className="py-2 first:pt-0 last:pb-0">
                   <div className="flex items-start justify-between gap-3">
                     <div className="min-w-0">
                       <div className="text-caption font-semibold text-text-primary truncate">
                         {item.merchant || `거래 #${item.transaction_id}`}
                       </div>
                       <div className="text-micro text-text-faint mt-0.5">
                         {item.date} · ₩ {formatKRW(item.amount)}
                       </div>
                     </div>
                     <span className={`text-nano px-1.5 py-0.5 rounded shrink-0 ${riskBadgeClass(item.risk_level)}`}>
                       {riskLabel(item.risk_level)}
                     </span>
                   </div>
                   <div className="flex flex-wrap gap-1.5 mt-2">
                     {typeLabels.map((label) => (
                       <span key={label} className="text-nano bg-surface-bar border border-border-subtle text-text-secondary px-1.5 py-0.5 rounded">
                         {label}
                       </span>
                     ))}
                     <span className="text-nano bg-surface-bar border border-border-subtle text-text-secondary px-1.5 py-0.5 rounded">
                       리뷰 후보
                     </span>
                     {signals.map(([key, value]) => (
                       <span key={key} className="text-nano bg-surface-bar border border-border-subtle text-text-secondary px-1.5 py-0.5 rounded">
                         {key}: {String(value)}
                       </span>
                     ))}
                   </div>
                   {item.reasons[0] && <div className="text-micro text-text-faint mt-2">{item.reasons[0]}</div>}
                   <div className="flex flex-wrap gap-1.5 mt-2">
                     <button
                       type="button"
                       disabled={!canWrite || reviewPurchaseGateCandidate.isPending}
                       onClick={() => reviewPurchaseGateCandidate.mutate({
                         candidateKey: item.candidate_key,
                         payload: { review_status: 'snoozed', cooldown_days: 7 },
                       })}
                       className="text-micro text-text-secondary bg-surface-bar border border-border-strong rounded px-2 py-1 disabled:opacity-50"
                     >
                       7일 숨김
                     </button>
                     <button
                       type="button"
                       disabled={!canWrite || reviewPurchaseGateCandidate.isPending}
                       onClick={() => reviewPurchaseGateCandidate.mutate({
                         candidateKey: item.candidate_key,
                         payload: { review_status: 'dismissed' },
                       })}
                       className="text-micro text-text-secondary bg-surface-bar border border-border-strong rounded px-2 py-1 disabled:opacity-50"
                     >
                       닫기
                     </button>
                   </div>
                 </div>
                 )
               })}
             </div>
           ) : <EmptyState message="리뷰할 구매 게이트 후보가 없습니다" />}
        </SectionCard>
      </div>

      {/* 반복 결제 + 이상 지출 */}
      <div className="grid md:grid-cols-2 gap-4">

        <SectionCard title="반복 결제"
          action={<button onClick={() => setShowRecurringAssumption((v) => !v)} className="text-micro text-text-ghost border border-border-strong rounded px-2 py-1">진단 기준</button>}
        >
          {showRecurringAssumption && recurring.data && (
            <div className="text-micro text-text-faint bg-surface-bar border border-border rounded p-2 mb-3 leading-relaxed">
              {recurring.data.assumptions}
            </div>
          )}
          {recurring.isLoading ? <LoadingState /> :
           recurring.data && recurring.data.items.length > 0 ? (
             <>
               <table className="w-full border-collapse text-caption">
                 <thead>
                   <tr>{['거래처', '분류', '주기', '평균금액', '횟수'].map((h) => (
                     <th key={h} className="text-micro text-text-ghost pb-1.5 text-left">{h}</th>
                   ))}</tr>
                 </thead>
                 <tbody>
                   {recurring.data.items.map((item, i) => (
                     <tr key={i}>
                       <td className="py-2 text-text-primary font-medium">{item.merchant}</td>
                       <td className="py-2">
                         <span className="text-nano bg-surface-bar border border-border-subtle text-text-secondary px-1.5 py-0.5 rounded">
                           {recurringKindLabel(item.recurring_payment_kind)}
                         </span>
                         <span className="block text-micro text-text-ghost mt-1">{recurringKindSummary(item)}</span>
                       </td>
                       <td className="py-2"><span className="text-nano bg-accent-dim text-accent border border-accent-muted px-1.5 py-0.5 rounded">{item.interval_type}</span></td>
                       <td className="py-2 text-right font-semibold">₩ {formatKRW(item.avg_amount)}</td>
                       <td className="py-2 text-right text-text-muted">{item.occurrences}회</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               <Pagination page={recurringPage} perPage={10} total={recurring.data.total} onPageChange={setRecurringPage} />
             </>
           ) : <EmptyState />}
        </SectionCard>

        <SectionCard
          title="이상 지출"
          meta={anomalyModeLabel}
          description={anomalyGuidance}
          action={
            <div className="flex items-center gap-2">
              <label htmlFor="anomaly-mode" className="sr-only">이상 지출 기준</label>
              <select
                id="anomaly-mode"
                aria-label="이상 지출 기준"
                value={anomalyMode}
                onChange={(event) => {
                  setAnomalyPage(1)
                  setAnomalyMode(event.target.value as 'closed' | 'partial')
                }}
                className="text-micro text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2 py-1.5"
              >
                <option value="closed">직전 마감월</option>
                <option value="partial">부분 기간</option>
              </select>
              <button onClick={() => setShowAnomalyAssumption((v) => !v)} className="text-micro text-text-ghost border border-border-strong rounded px-2 py-1">
                진단 기준
              </button>
            </div>
          }
        >
          {showAnomalyAssumption && anomalies.data && (
            <div className="text-micro text-text-faint bg-surface-bar border border-border rounded p-2 mb-3 leading-relaxed">
              <div className="text-text-secondary">{anomalyGuidance}</div>
              <div className="mt-1">{anomalies.data.assumptions}</div>
            </div>
          )}
          {anomalies.isLoading ? <LoadingState /> :
           anomalies.data && anomalies.data.items.length > 0 ? (
             <>
               <table className="w-full border-collapse text-caption">
                 <thead>
                   <tr>{['카테고리', '이번 달', '기준선', '증감'].map((h) => (
                     <th key={h} className="text-micro text-text-ghost pb-1.5 text-left">{h}</th>
                   ))}</tr>
                 </thead>
                 <tbody>
                   {anomalies.data.items.map((item, i) => (
                     <tr key={i}>
                       <td className="py-2 text-text-primary font-medium">{item.category}</td>
                       <td className="py-2 text-right">₩ {formatKRWCompact(item.amount)}</td>
                       <td className="py-2 text-right text-text-faint">₩ {formatKRWCompact(item.baseline_avg)}</td>
                       <td className={`py-2 text-right font-semibold ${(item.delta_pct ?? 0) > 0 ? 'text-danger' : 'text-accent'}`}>
                         {item.delta_pct != null ? `${item.delta_pct > 0 ? '+' : item.delta_pct < 0 ? '-' : ''}${formatPct(Math.abs(item.delta_pct))}` : '—'}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               <Pagination page={anomalyPage} perPage={10} total={anomalies.data.total} onPageChange={setAnomalyPage} />
             </>
           ) : <EmptyState />}
        </SectionCard>

      </div>

      {/* 거래처 Top 5 + 카테고리 MoM */}
      <div className="grid md:grid-cols-2 gap-4">

        <SectionCard
          title="분석용 거래처 소비 Top 5"
          meta={`최근 ${merchantMonths}개월`}
          action={
            <>
              <label htmlFor="merchant-period" className="sr-only">거래처 소비 기간</label>
              <select
                id="merchant-period"
                aria-label="거래처 소비 기간"
                value={merchantMonths}
                onChange={(event) => setMerchantMonths(Number(event.target.value))}
                className="text-micro text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2 py-1.5"
              >
                <option value={1}>최근 1개월</option>
                <option value={3}>최근 3개월</option>
                <option value={6}>최근 6개월</option>
                <option value={12}>최근 1년</option>
              </select>
            </>
          }
        >
          {merchants.isLoading ? <LoadingState /> :
           merchants.data && merchants.data.items.length > 0 ? (
             <div className="flex flex-col divide-y divide-border-subtle">
               {merchants.data.items.map((m, i) => (
                 <div key={m.merchant} className="flex items-center gap-2.5 py-2">
                   <span className="text-caption text-text-ghost w-4 shrink-0">#{i + 1}</span>
                   <span className="text-caption text-text-primary font-medium flex-1 truncate">{m.merchant}</span>
                   <span className="text-caption text-text-faint w-7 text-center">{m.count}건</span>
                   <span className="text-caption text-text-muted w-20 text-right">평균 ₩{formatKRWCompact(m.avg_amount)}</span>
                   <span className="text-caption text-danger font-semibold w-20 text-right">₩ {formatKRWCompact(m.amount)}</span>
                 </div>
               ))}
             </div>
           ) : <EmptyState />}
        </SectionCard>

        <SectionCard
          title="카테고리 전월 대비"
          meta={categoryBaseMonth}
          action={
            <>
              <label htmlFor="category-base-month" className="sr-only">카테고리 기준월</label>
              <select
                id="category-base-month"
                aria-label="카테고리 기준월"
                value={categoryBaseMonth}
                onChange={(event) => setCategoryBaseMonth(event.target.value)}
                className="text-micro text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2 py-1.5"
              >
                {allMonths.slice(1).map((month) => <option key={month} value={month}>{month}</option>)}
              </select>
            </>
          }
        >
          {categoryMoM.isLoading ? <LoadingState /> :
           categoryMoM.data && categoryMoM.data.items.length > 0 ? (
             <MoMBarList items={categoryMoM.data.items} />
           ) : <EmptyState />}
        </SectionCard>

      </div>
    </div>
  )
}
