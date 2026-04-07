import { useEffect } from 'react'
import { KpiCard } from '../components/ui/KpiCard'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LineAreaChart } from '../components/charts/LineAreaChart'
import { HorizontalBarList } from '../components/charts/HorizontalBarList'
import { useAssetSnapshotCompare, useAssetSnapshots, useNetWorthHistory, useInvestmentSummary, useLoanSummary } from '../hooks/useAssets'
import { useChromeContext } from '../components/layout/chromeContext'
import { formatKRWCompact, formatPct } from '../lib/utils'

export function AssetsPage() {
  const snapshots = useAssetSnapshots()
  const netWorthHistory = useNetWorthHistory()
  const comparison = useAssetSnapshotCompare()
  const investments = useInvestmentSummary()
  const loans = useLoanSummary()
  const { setMetaBadge } = useChromeContext()

  const latest = snapshots.data?.items?.[snapshots.data.items.length - 1]
  const snapshotDate = latest?.snapshot_date
  const comparisonData = comparison.data
  const comparisonMeta = comparisonData?.can_compare
    ? `${comparisonData.comparison_label}${comparisonData.comparison_days != null ? ` · ${comparisonData.comparison_days}일` : ''}`
    : comparisonData?.comparison_label
  const compareBadgeTone = comparisonData?.is_stale
    ? 'text-danger border-danger-muted bg-surface-danger'
    : comparisonData?.is_partial
      ? 'text-accent border-border-strong bg-surface-bar'
      : 'text-text-muted border-border bg-surface-bar'

  useEffect(() => {
    if (!snapshotDate) return
    setMetaBadge(
      <div className="flex items-center gap-2">
        <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
          기준일 {snapshotDate}
        </span>
        {comparisonMeta ? (
          <span className={`text-caption px-2.5 py-0.5 rounded-full border ${compareBadgeTone}`}>
            {comparisonMeta}
          </span>
        ) : null}
      </div>,
    )
  }, [compareBadgeTone, comparisonMeta, setMetaBadge, snapshotDate])

  const netWorth = latest ? parseFloat(latest.net_worth) : null
  const assetTotal = latest ? parseFloat(latest.asset_total) : null
  const liabilityTotal = latest ? parseFloat(latest.liability_total) : null
  const netWorthDelta = comparisonData?.delta ? parseFloat(comparisonData.delta.net_worth) : null
  const assetDelta = comparisonData?.delta ? parseFloat(comparisonData.delta.asset_total) : null
  const liabilityDelta = comparisonData?.delta ? parseFloat(comparisonData.delta.liability_total) : null
  const investMarketValue = investments.data ? parseFloat(investments.data.totals.market_value) : null
  const investCostBasis = investments.data ? parseFloat(investments.data.totals.cost_basis) : null
  const investReturnPct = investMarketValue != null && investCostBasis != null && investCostBasis > 0
    ? ((investMarketValue - investCostBasis) / investCostBasis) * 100
    : null

  function formatDeltaSub(label: string, amount: number | null, pct: number | null | undefined) {
    if (amount == null) return label
    const prefix = amount > 0 ? '+' : amount < 0 ? '-' : ''
    const pctText = pct != null ? ` · ${pct > 0 ? '+' : pct < 0 ? '' : ''}${formatPct(pct * 100)}` : ''
    return `${label} · ${prefix}₩ ${formatKRWCompact(amount)}${pctText}`
  }

  function deltaVariant(amount: number | null, invert = false): 'up' | 'down' | 'neutral' {
    if (amount == null || amount === 0) return 'neutral'
    if (invert) return amount < 0 ? 'up' : 'down'
    return amount > 0 ? 'up' : 'down'
  }

  return (
    <div className="flex flex-col gap-4">

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="순자산" value={netWorth != null ? `₩ ${formatKRWCompact(netWorth)}` : '—'}
          className="border-t-2 border-t-accent"
          sub={comparisonMeta ? formatDeltaSub(comparisonMeta, netWorthDelta, comparisonData?.delta?.net_worth_pct) : undefined}
          subVariant={deltaVariant(netWorthDelta)} />
        <KpiCard label="총자산"
          value={assetTotal != null ? `₩ ${formatKRWCompact(assetTotal)}` : '—'}
          sub={comparisonMeta ? formatDeltaSub(comparisonMeta, assetDelta, comparisonData?.delta?.asset_total_pct) : undefined}
          subVariant={deltaVariant(assetDelta)} />
        <KpiCard label="총부채" value={liabilityTotal != null ? `₩ ${formatKRWCompact(liabilityTotal)}` : '—'}
          className="border-t-2 border-t-danger"
          sub={comparisonMeta ? formatDeltaSub(comparisonMeta, liabilityDelta, comparisonData?.delta?.liability_total_pct) : undefined}
          subVariant={deltaVariant(liabilityDelta, true)} />
        <KpiCard label="투자 평가액" value={investMarketValue != null ? `₩ ${formatKRWCompact(investMarketValue)}` : '—'}
          sub={investReturnPct != null ? `원금 대비 ${investReturnPct > 0 ? '+' : ''}${formatPct(investReturnPct)}` : ''}
          subVariant={investReturnPct != null && investReturnPct > 0 ? 'up' : 'down'} />
      </div>

      {/* 순자산 추이 */}
      <SectionCard title="순자산 추이" badge="스냅샷 기준 시계열">
        {netWorthHistory.isLoading ? <LoadingState /> :
         netWorthHistory.error ? <ErrorState onRetry={() => netWorthHistory.refetch()} /> :
         netWorthHistory.data ? (
           <LineAreaChart data={netWorthHistory.data.items} />
         ) : <EmptyState />}
      </SectionCard>

      {/* 투자 + 대출 */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* 투자 요약 */}
        <SectionCard
          title="투자 요약"
          badge={comparisonMeta ? (
            <span className={`text-micro px-2 py-0.5 rounded-full border ${compareBadgeTone}`}>
              {comparisonMeta}
            </span>
          ) : investments.data?.snapshot_date ?? undefined}
        >
          {investments.isLoading ? <LoadingState /> :
           investments.error ? <ErrorState onRetry={() => investments.refetch()} /> :
           investments.data ? (
             <>
               <div className="grid grid-cols-3 gap-2.5 mb-4">
                 {[
                   { label: '총 원금', value: `₩ ${formatKRWCompact(investCostBasis ?? 0)}`, color: 'text-text-primary' },
                   { label: '평가액', value: `₩ ${formatKRWCompact(investMarketValue ?? 0)}`, color: 'text-info-bright' },
                   { label: '수익률', value: formatPct(investReturnPct), color: (investReturnPct ?? 0) > 0 ? 'text-accent' : 'text-danger' },
                 ].map((s) => (
                   <div key={s.label} className="bg-surface-bar border border-border rounded-lg p-2.5">
                     <div className="text-micro text-text-faint mb-1">{s.label}</div>
                     <div className={`text-body-sm font-bold ${s.color}`}>{s.value}</div>
                   </div>
                 ))}
               </div>
               <div className="text-caption text-text-faint mb-2">포트폴리오 비중</div>
               <HorizontalBarList
                 items={investments.data.items.map((item) => ({
                   label: item.broker,
                   amount: parseFloat(item.market_value ?? '0'),
                 }))}
                 maxAmount={investMarketValue ?? undefined}
               />
             </>
           ) : <EmptyState message="투자 데이터가 없습니다" />}
        </SectionCard>

        {/* 대출 요약 */}
        <SectionCard
          title="대출 요약"
          badge={comparisonMeta ? (
            <span className={`text-micro px-2 py-0.5 rounded-full border ${compareBadgeTone}`}>
              {comparisonMeta}
            </span>
          ) : loans.data?.snapshot_date ?? undefined}
        >
          {loans.isLoading ? <LoadingState /> :
           loans.error ? <ErrorState onRetry={() => loans.refetch()} /> :
           loans.data ? (
             <>
               <div className="grid grid-cols-2 gap-2.5 mb-4">
                 {[
                   { label: '총 대출 원금', value: `₩ ${formatKRWCompact(parseFloat(loans.data.totals.principal))}`, color: 'text-text-primary' },
                   { label: '총 잔액', value: `₩ ${formatKRWCompact(parseFloat(loans.data.totals.balance))}`, color: 'text-danger' },
                 ].map((s) => (
                   <div key={s.label} className="bg-surface-bar border border-border rounded-lg p-2.5">
                     <div className="text-micro text-text-faint mb-1">{s.label}</div>
                     <div className={`text-body-md font-bold ${s.color}`}>{s.value}</div>
                   </div>
                 ))}
               </div>
               <table className="w-full text-caption border-collapse">
                 <thead>
                   <tr>
                     {['상품', '잔액', '금리'].map((h) => (
                       <th key={h} className="text-micro text-text-ghost pb-1.5 text-left border-b border-border-subtle">{h}</th>
                     ))}
                   </tr>
                 </thead>
                 <tbody>
                   {loans.data.items.slice(0, 4).map((loan, i) => (
                     <tr key={i} className="border-b border-border-faint last:border-0">
                       <td className="py-2">
                         <div className="text-text-primary font-medium">{loan.product_name}</div>
                         <div className="text-micro text-text-faint">{loan.lender}</div>
                         {loan.loan_type && (
                           <span className="inline-block text-nano px-1.5 py-0.5 mt-0.5 bg-border-subtle text-text-ghost rounded">{loan.loan_type}</span>
                         )}
                       </td>
                       <td className="py-2 text-danger font-semibold text-right">
                         ₩ {formatKRWCompact(parseFloat(loan.balance ?? '0'))}
                       </td>
                       <td className="py-2 text-right">
                         {loan.interest_rate ? (
                           <span className="text-text-muted">{parseFloat(loan.interest_rate).toFixed(2)}%</span>
                         ) : '—'}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </>
           ) : <EmptyState message="대출 데이터가 없습니다" />}
        </SectionCard>

      </div>
    </div>
  )
}
