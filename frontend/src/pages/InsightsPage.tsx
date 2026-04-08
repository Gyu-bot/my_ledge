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
} from '../hooks/useAnalytics'
import { useChromeContext } from '../components/layout/chromeContext'
import { formatKRW, formatKRWCompact, formatPct } from '../lib/utils'

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
  const recurring = useRecurringPayments(recurringPage, 10)
  const anomalies = useSpendingAnomalies(anomalyPage, 10)
  const merchants = useMerchantSpend({ months: merchantMonths, limit: 5 })
  const categoryMoM = useCategoryMoM({
    start_month: allMonths[Math.max(0, allMonths.indexOf(categoryBaseMonth) - 1)],
    end_month: categoryBaseMonth,
  })
  const { setMetaBadge } = useChromeContext()

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
                   <tr>{['거래처', '주기', '평균금액', '횟수'].map((h) => (
                     <th key={h} className="text-micro text-text-ghost pb-1.5 text-left">{h}</th>
                   ))}</tr>
                 </thead>
                 <tbody>
                   {recurring.data.items.map((item, i) => (
                     <tr key={i}>
                       <td className="py-2 text-text-primary font-medium">{item.merchant}</td>
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

        <SectionCard title="이상 지출"
          action={<button onClick={() => setShowAnomalyAssumption((v) => !v)} className="text-micro text-text-ghost border border-border-strong rounded px-2 py-1">진단 기준</button>}
        >
          {showAnomalyAssumption && anomalies.data && (
            <div className="text-micro text-text-faint bg-surface-bar border border-border rounded p-2 mb-3 leading-relaxed">
              {anomalies.data.assumptions}
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
          title="거래처 소비 Top 5"
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
