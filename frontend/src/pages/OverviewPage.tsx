import { useEffect } from 'react'
import { KpiCard } from '../components/ui/KpiCard'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { DualBarChart } from '../components/charts/DualBarChart'
import { HorizontalBarList } from '../components/charts/HorizontalBarList'
import { useMonthlyCashflow, useIncomeStability, useRecurringPayments, useSpendingAnomalies } from '../hooks/useAnalytics'
import { useAssetSnapshots } from '../hooks/useAssets'
import { useTransactionList, useCategoryBreakdown } from '../hooks/useTransactions'
import { formatKRW, formatKRWCompact, formatPct, formatDate } from '../lib/utils'
import { useChromeContext } from '../components/layout/AppLayout'

export function OverviewPage() {
  const cashflow = useMonthlyCashflow(6)
  const snapshots = useAssetSnapshots()
  const incomeStability = useIncomeStability()
  const recurringPayments = useRecurringPayments(1, 1)
  const spendingAnomalies = useSpendingAnomalies(1, 1)
  const recentTx = useTransactionList({ page: 1, per_page: 5, type: 'all' })
  const categoryBreakdown = useCategoryBreakdown()
  const { setMetaBadge } = useChromeContext()

  const latestSnapshot = snapshots.data?.items?.[snapshots.data.items.length - 1]
  const snapshotDate = latestSnapshot?.snapshot_date
  const currentMonth = cashflow.data?.items?.[cashflow.data.items.length - 1]
  const netWorth = latestSnapshot ? parseFloat(latestSnapshot.net_worth) : null
  const monthExpense = currentMonth?.expense ?? null
  const monthIncome = currentMonth?.income ?? null
  const savingsRate = currentMonth?.savings_rate ?? null
  const anomalyCount = spendingAnomalies.data?.total ?? null
  const recurringCount = recurringPayments.data?.total ?? null
  const incomeCV = incomeStability.data?.coefficient_of_variation ?? null
  const incomeLabel = incomeCV == null ? '—' : incomeCV < 0.1 ? '안정' : incomeCV < 0.25 ? '보통' : '불안정'

  useEffect(() => {
    if (snapshotDate) {
      setMetaBadge(
        <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
          기준일 {snapshotDate}
        </span>
      )
    }
    return () => setMetaBadge(null)
  }, [snapshotDate])

  return (
    <div className="flex flex-col gap-4">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="순자산"
          value={netWorth != null ? `₩ ${formatKRWCompact(netWorth)}` : '—'}
          sub={snapshotDate ? `기준일 ${formatDate(snapshotDate)}` : ''}
          className="border-t-2 border-t-accent"
        />
        <KpiCard
          label="이번 달 지출"
          value={monthExpense != null ? `₩ ${formatKRWCompact(Math.abs(monthExpense))}` : '—'}
          subVariant="down"
        />
        <KpiCard
          label="이번 달 수입"
          value={monthIncome != null ? `₩ ${formatKRWCompact(monthIncome)}` : '—'}
        />
        <KpiCard
          label="저축률"
          value={formatPct(savingsRate != null ? savingsRate * 100 : null)}
          subVariant={savingsRate != null && savingsRate > 0.3 ? 'up' : 'neutral'}
          sub={savingsRate != null && savingsRate > 0.5 ? '목표 50% 초과' : ''}
          className="border-t-2 border-t-accent"
        />
      </div>

      {/* 현금흐름 + 주의 신호 */}
      <div className="grid md:grid-cols-[2fr_1fr] gap-4">
        <SectionCard title="월간 현금흐름" badge="최근 6개월">
          {cashflow.isLoading ? <LoadingState /> :
           cashflow.error ? <ErrorState onRetry={() => cashflow.refetch()} /> :
           cashflow.data && cashflow.data.items.length > 0 ? (
             <>
               <DualBarChart data={cashflow.data.items} />
               <div className="flex gap-3 mt-2">
                 <span className="flex items-center gap-1 text-micro text-text-muted"><span className="w-2 h-2 rounded-sm bg-accent" />수입</span>
                 <span className="flex items-center gap-1 text-micro text-text-muted"><span className="w-2 h-2 rounded-sm bg-danger" />지출</span>
               </div>
             </>
           ) : <EmptyState message="현금흐름 데이터가 없습니다" />}
        </SectionCard>

        <SectionCard title="주의 신호">
          <div className="flex flex-col gap-2">
            {[
              { label: '이상 지출 카테고리', value: anomalyCount, warn: (anomalyCount ?? 0) > 0 },
              { label: '반복 결제 감지', value: recurringCount, warn: false },
              { label: '수입 안정성', value: incomeLabel, warn: false },
            ].map((signal) => (
              <div key={signal.label} className="flex items-center justify-between px-3 py-2.5 bg-surface-bar border border-border rounded-lg">
                <span className="text-label text-text-secondary">{signal.label}</span>
                <span className={`text-body-sm font-semibold ${signal.warn ? 'text-warn' : 'text-accent'}`}>
                  {signal.value == null ? '—' : typeof signal.value === 'number' ? `${signal.value}건` : signal.value}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* 카테고리 Top 5 + 최근 거래 */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="카테고리 Top 5" badge="이번 달">
          {categoryBreakdown.isLoading ? <LoadingState /> :
           categoryBreakdown.data && categoryBreakdown.data.items.length > 0 ? (
             <HorizontalBarList
               items={categoryBreakdown.data.items.slice(0, 5).map((i) => ({
                 label: i.category,
                 amount: i.amount,
               }))}
             />
           ) : <EmptyState message="카테고리 데이터가 없습니다" />}
        </SectionCard>

        <SectionCard title="최근 거래" badge="read-only">
          {recentTx.isLoading ? <LoadingState /> :
           recentTx.data && recentTx.data.items.length > 0 ? (
             <div className="flex flex-col divide-y divide-border-subtle">
               {recentTx.data.items.map((tx) => (
                 <div key={tx.id} className="flex items-center gap-3 py-2">
                   <div className="flex-1 min-w-0">
                     <div className="text-label text-text-primary truncate">{tx.merchant}</div>
                     <div className="text-caption text-text-faint">{tx.effective_category_major}</div>
                   </div>
                   <div className="text-micro text-text-ghost shrink-0">{formatDate(tx.date)}</div>
                   <div className={`text-label font-semibold shrink-0 ${tx.amount < 0 ? 'text-danger' : 'text-accent'}`}>
                     {tx.amount < 0 ? '-' : '+'}₩{formatKRW(tx.amount)}
                   </div>
                 </div>
               ))}
             </div>
           ) : <EmptyState message="거래 내역이 없습니다" />}
        </SectionCard>
      </div>
    </div>
  )
}
