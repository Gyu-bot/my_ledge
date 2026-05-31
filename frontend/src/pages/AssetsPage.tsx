import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { KpiCard } from '../components/ui/KpiCard'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LineAreaChart } from '../components/charts/LineAreaChart'
import { HorizontalBarList } from '../components/charts/HorizontalBarList'
import {
  useAssetSnapshotCompare,
  useAssetSnapshots,
  useNetWorthHistory,
  useLoanSummary,
  useLiquidityHealth,
  useNetWorthBreakdown,
} from '../hooks/useAssets'
import { useChromeContext } from '../components/layout/chromeContext'
import { formatKRW, formatKRWCompact } from '../lib/utils'
import type {
  AssetSnapshotItemResponse,
  LiquidityTier,
  LoanItem,
  LoanKind,
  LoanRepaymentMethod,
} from '../types/asset'

const LIQUIDITY_LABEL: Record<LiquidityTier, string> = {
  immediate: '즉시 사용',
  near_liquid: '단기 현금화',
  illiquid: '비유동',
}

const REPAYMENT_METHOD_LABEL: Record<LoanRepaymentMethod, string> = {
  principal_interest: '원리금 균등',
  principal_equal: '원금 균등',
  interest_only: '이자만',
  unknown: '미정',
}

const LOAN_KIND_LABEL: Record<LoanKind, string> = {
  unknown: '미지정',
  overdraft: '마이너스 통장',
  equal_principal_interest: '원리금 균등 상환',
  equal_principal: '원금 균등 상환',
  bullet: '일시 원금 상환',
  other: '기타',
}

function assetLabel(asset: AssetSnapshotItemResponse): string {
  return asset.product_name || asset.category || `자산 ${asset.id ?? ''}`.trim()
}

function liquidityLabel(value: LiquidityTier | null | undefined) {
  if (!value) return '미지정'
  return LIQUIDITY_LABEL[value]
}

function repaymentMethodLabel(value: LoanRepaymentMethod | null | undefined) {
  if (!value) return '미지정'
  return REPAYMENT_METHOD_LABEL[value]
}

function loanKindLabel(value: LoanKind | null | undefined) {
  if (!value) return '미지정'
  return LOAN_KIND_LABEL[value]
}

function money(value: string | null | undefined) {
  if (!value) return '—'
  return `₩ ${formatKRW(parseFloat(value))}`
}

function monthlyPaymentSourceLabel(loan: LoanItem): string | null {
  if (loan.monthly_payment_source === 'manual') return '수동 확정'
  if (loan.monthly_payment_source === 'estimated_from_linked_transactions') {
    return loan.loan_kind === 'overdraft'
      ? '연결 거래 추정 · 최근 완료월 평균'
      : '연결 거래 추정 · 완료월 중앙값'
  }
  return null
}

export function AssetsPage() {
  const snapshots = useAssetSnapshots()
  const netWorthHistory = useNetWorthHistory()
  const comparison = useAssetSnapshotCompare()
  const loans = useLoanSummary()
  const liquidityHealth = useLiquidityHealth()
  const netWorthBreakdown = useNetWorthBreakdown()
  const { setMetaBadge } = useChromeContext()

  const latest = [...(snapshots.data?.items ?? [])]
    .reverse()
    .find((item) => item.asset_total && item.liability_total && item.net_worth)
  const snapshotDate = latest?.snapshot_date
  const comparisonData = comparison.data
  const comparisonReference = comparisonData?.baseline?.snapshot_date
    ? `${comparisonData.baseline.snapshot_date} 대비`
    : comparisonData?.can_compare
      ? '이전 스냅샷 대비'
      : comparisonData?.comparison_label
  const comparisonMeta = comparisonReference
    ? `${comparisonReference}${comparisonData?.comparison_days != null ? ` · ${comparisonData.comparison_days}일` : ''}`
    : undefined
  const compareBadgeTone = comparisonData?.is_stale
    ? 'text-danger border-danger-muted bg-surface-danger'
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
    return () => setMetaBadge(null)
  }, [compareBadgeTone, comparisonMeta, setMetaBadge, snapshotDate])

  const netWorth = latest ? parseFloat(latest.net_worth) : null
  const assetTotal = latest ? parseFloat(latest.asset_total) : null
  const liabilityTotal = latest ? parseFloat(latest.liability_total) : null
  const cashEquivalentTotal = liquidityHealth.data ? parseFloat(liquidityHealth.data.cash_equivalent_total) : null
  const emergencyMonths = liquidityHealth.data?.emergency_fund_months ?? null
  const monthlyDebtPayment = liquidityHealth.data ? parseFloat(liquidityHealth.data.monthly_debt_payment) : null
  const assetRows = (snapshots.data?.asset_items ?? [])
    .filter((item) => item.side === 'asset' && (!snapshotDate || item.snapshot_date === snapshotDate))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="순자산"
          value={netWorth != null ? `₩ ${formatKRWCompact(netWorth)}` : '—'}
          className="border-t-2 border-t-accent"
        />
        <KpiCard
          label="총자산"
          value={assetTotal != null ? `₩ ${formatKRWCompact(assetTotal)}` : '—'}
        />
        <KpiCard
          label="총부채"
          value={liabilityTotal != null ? `₩ ${formatKRWCompact(liabilityTotal)}` : '—'}
          className="border-t-2 border-t-danger"
        />
        <KpiCard
          label="현금성 자산"
          value={cashEquivalentTotal != null ? `₩ ${formatKRWCompact(cashEquivalentTotal)}` : '—'}
          sub={emergencyMonths != null ? `비상금 ${emergencyMonths.toFixed(1)}개월` : liquidityHealth.data?.confidence ?? ''}
          subVariant={(emergencyMonths ?? 0) >= 3 ? 'up' : 'down'}
        />
      </div>

      <SectionCard title="순자산 추이" badge="스냅샷 기준 시계열">
        {netWorthHistory.isLoading ? <LoadingState /> :
         netWorthHistory.error ? <ErrorState onRetry={() => netWorthHistory.refetch()} /> :
         netWorthHistory.data ? (
           <LineAreaChart data={netWorthHistory.data.items} />
         ) : <EmptyState />}
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard
          title="유동성 Health"
          badge={comparisonMeta ? (
            <span className={`text-micro px-2 py-0.5 rounded-full border ${compareBadgeTone}`}>
              {comparisonMeta}
            </span>
          ) : liquidityHealth.data?.snapshot_date ?? undefined}
          action={(
            <Link
              to="/operations/asset-settings"
              aria-label="자산 설정으로 이동"
              className="text-caption px-3 py-1.5 border border-border-faint text-text-secondary rounded-md"
            >
              자산 설정
            </Link>
          )}
        >
          {liquidityHealth.isLoading || netWorthBreakdown.isLoading ? <LoadingState /> :
           liquidityHealth.error || netWorthBreakdown.error ? <ErrorState onRetry={() => { void liquidityHealth.refetch(); void netWorthBreakdown.refetch() }} /> :
           liquidityHealth.data ? (
             <>
               <div className="grid grid-cols-3 gap-2.5 mb-4">
                 {[
                   { label: '현금성', value: `₩ ${formatKRWCompact(cashEquivalentTotal ?? 0)}`, color: 'text-info-bright' },
                   { label: '비상금', value: emergencyMonths != null ? `${emergencyMonths.toFixed(1)}개월` : '—', color: (emergencyMonths ?? 0) >= 3 ? 'text-accent' : 'text-danger' },
                   { label: '월부채', value: `₩ ${formatKRWCompact(monthlyDebtPayment ?? 0)}`, color: 'text-danger' },
                 ].map((summary) => (
                   <div key={summary.label} className="bg-surface-bar border border-border rounded-lg p-2.5">
                     <div className="text-micro text-text-faint mb-1">{summary.label}</div>
                     <div className={`text-body-sm font-bold ${summary.color}`}>{summary.value}</div>
                   </div>
                 ))}
               </div>
               <div className="text-caption text-text-faint mb-2">순자산 구성</div>
               <HorizontalBarList
                 items={(netWorthBreakdown.data?.items ?? []).map((item) => ({
                   label: item.side === 'asset' ? item.category : `부채 · ${item.category}`,
                   amount: Math.abs(parseFloat(item.amount)),
                 }))}
                 maxAmount={Math.max(assetTotal ?? 0, liabilityTotal ?? 0)}
               />
               <div className="mt-3 text-micro text-text-ghost">
                 투자 상세 성과/배분은 증권사 API 연동 이후 보강합니다.
               </div>
               {assetRows.length ? (
                 <div className="mt-4 border-t border-border-faint pt-3">
                   <div className="text-caption text-text-secondary font-semibold">자산 유동성 분류</div>
                   <div className="mt-0.5 text-micro text-text-ghost">이 화면은 조회 전용입니다. 편집은 자산 설정에서 관리합니다.</div>
                   <div className="mt-3 divide-y divide-border-faint">
                     {assetRows.map((asset) => (
                       <div key={asset.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                         <div className="min-w-36 flex-1">
                           <div className="text-caption text-text-primary font-medium">{assetLabel(asset)}</div>
                           <div className="text-micro text-text-ghost">
                             {[asset.category, asset.amount ? `₩ ${formatKRW(parseFloat(asset.amount))}` : null].filter(Boolean).join(' · ')}
                           </div>
                         </div>
                         <div className="flex flex-wrap items-center gap-2">
                           <span className="text-micro px-2 py-0.5 rounded-full border border-border-subtle bg-surface-bar text-text-secondary">
                             {liquidityLabel(asset.liquidity_tier)}
                           </span>
                           <span className="text-micro px-2 py-0.5 rounded-full border border-border-subtle bg-surface-bar text-text-secondary">
                             {asset.is_cash_equivalent ? '현금성' : '비현금성'}
                           </span>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               ) : null}
             </>
           ) : <EmptyState message="유동성 데이터가 없습니다" />}
        </SectionCard>

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
                 ].map((summary) => (
                   <div key={summary.label} className="bg-surface-bar border border-border rounded-lg p-2.5">
                     <div className="text-micro text-text-faint mb-1">{summary.label}</div>
                     <div className={`text-body-md font-bold ${summary.color}`}>{summary.value}</div>
                   </div>
                 ))}
               </div>
               <table className="w-full text-caption border-collapse">
                 <thead>
                   <tr>
                     {['상품', '잔액', '금리', '월상환', '상환 방식'].map((header) => (
                       <th key={header} className="text-micro text-text-ghost pb-1.5 text-left">{header}</th>
                     ))}
                   </tr>
                 </thead>
                 <tbody>
                   {loans.data.items.slice(0, 4).map((loan, index) => (
                     <tr key={loan.id ?? index}>
                       <td className="py-2">
                         <div className="text-text-primary font-medium">{loan.product_name}</div>
                         <div className="text-micro text-text-faint">{loan.lender}</div>
                         {loan.loan_type ? (
                           <span className="inline-block text-nano px-1.5 py-0.5 mt-0.5 bg-border-subtle text-text-ghost rounded">
                             {loan.loan_type}
                           </span>
                         ) : null}
                         {loan.loan_kind ? (
                           <div className="text-nano text-text-ghost mt-1">
                             대출 성격 · {loanKindLabel(loan.loan_kind)}
                           </div>
                         ) : null}
                       </td>
                       <td className="py-2 text-danger font-semibold text-right">
                         ₩ {formatKRWCompact(parseFloat(loan.balance ?? '0'))}
                       </td>
                       <td className="py-2 text-right">
                         {loan.interest_rate ? (
                           <span className="text-text-muted">{parseFloat(loan.interest_rate).toFixed(2)}%</span>
                         ) : '—'}
                       </td>
                       <td className="py-2 text-right text-text-secondary">
                         <div>{money(loan.monthly_payment)}</div>
                         {monthlyPaymentSourceLabel(loan) ? (
                           <div className="text-nano text-text-ghost mt-0.5">
                             {monthlyPaymentSourceLabel(loan)}
                           </div>
                         ) : null}
                       </td>
                       <td className="py-2 text-right text-text-secondary">
                         <div>{repaymentMethodLabel(loan.repayment_method)}</div>
                         {loan.repayment_method_source === 'derived_from_loan_account' ? (
                           <div className="text-nano text-text-ghost mt-0.5">계좌 성격 기준</div>
                         ) : null}
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
