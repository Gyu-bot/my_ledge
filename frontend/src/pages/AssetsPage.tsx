import { useEffect, useState } from 'react'
import { AlertBanner } from '../components/ui/AlertBanner'
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
  usePatchAssetLiquidity,
  usePatchLoanRepaymentMetadata,
} from '../hooks/useAssets'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { useChromeContext } from '../components/layout/chromeContext'
import { formatKRW, formatKRWCompact } from '../lib/utils'
import type {
  AssetSnapshotItemResponse,
  LiquidityTier,
  LoanItem,
  LoanRepaymentMethod,
} from '../types/asset'

interface AssetLiquidityDraft {
  liquidity_tier: LiquidityTier | ''
  is_cash_equivalent: boolean
}

interface LoanRepaymentDraft {
  monthly_payment: string
  repayment_method: LoanRepaymentMethod
}

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

const LIQUIDITY_OPTIONS = Object.entries(LIQUIDITY_LABEL) as [LiquidityTier, string][]
const REPAYMENT_METHOD_OPTIONS = Object.entries(REPAYMENT_METHOD_LABEL) as [LoanRepaymentMethod, string][]

function assetLabel(asset: AssetSnapshotItemResponse): string {
  return asset.product_name || asset.category || `자산 ${asset.id ?? ''}`.trim()
}

function assetDraftFrom(asset: AssetSnapshotItemResponse): AssetLiquidityDraft {
  return {
    liquidity_tier: asset.liquidity_tier ?? '',
    is_cash_equivalent: !!asset.is_cash_equivalent,
  }
}

function loanDraftFrom(loan: LoanItem): LoanRepaymentDraft {
  return {
    monthly_payment: loan.monthly_payment ?? '',
    repayment_method: loan.repayment_method ?? 'unknown',
  }
}

export function AssetsPage() {
  const hasWrite = useWriteAccess()
  const snapshots = useAssetSnapshots()
  const netWorthHistory = useNetWorthHistory()
  const comparison = useAssetSnapshotCompare()
  const loans = useLoanSummary()
  const liquidityHealth = useLiquidityHealth()
  const netWorthBreakdown = useNetWorthBreakdown()
  const patchAssetLiquidity = usePatchAssetLiquidity()
  const patchLoanRepaymentMetadata = usePatchLoanRepaymentMetadata()
  const { setMetaBadge } = useChromeContext()
  const [assetDrafts, setAssetDrafts] = useState<Record<number, AssetLiquidityDraft>>({})
  const [loanDrafts, setLoanDrafts] = useState<Record<number, LoanRepaymentDraft>>({})
  const [alert, setAlert] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)

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
  }, [compareBadgeTone, comparisonMeta, setMetaBadge, snapshotDate])

  const netWorth = latest ? parseFloat(latest.net_worth) : null
  const assetTotal = latest ? parseFloat(latest.asset_total) : null
  const liabilityTotal = latest ? parseFloat(latest.liability_total) : null
  const cashEquivalentTotal = liquidityHealth.data ? parseFloat(liquidityHealth.data.cash_equivalent_total) : null
  const emergencyMonths = liquidityHealth.data?.emergency_fund_months ?? null
  const monthlyDebtPayment = liquidityHealth.data ? parseFloat(liquidityHealth.data.monthly_debt_payment) : null
  const assetRows = (snapshots.data?.asset_items ?? [])
    .filter((item) => typeof item.id === 'number' && item.side === 'asset')
  const isReadOnly = !hasWrite

  const saveAssetLiquidity = async (asset: AssetSnapshotItemResponse) => {
    if (typeof asset.id !== 'number') return
    const draft = assetDrafts[asset.id] ?? assetDraftFrom(asset)
    try {
      await patchAssetLiquidity.mutateAsync({
        id: asset.id,
        data: {
          liquidity_tier: draft.liquidity_tier || null,
          is_cash_equivalent: draft.is_cash_equivalent,
        },
      })
      setAlert({ variant: 'success', title: '자산 유동성 저장 완료', description: assetLabel(asset) })
    } catch (e) {
      setAlert({ variant: 'error', title: '자산 유동성 저장 실패', description: String(e) })
    }
  }

  const saveLoanRepaymentMetadata = async (loan: LoanItem) => {
    if (typeof loan.id !== 'number') return
    const draft = loanDrafts[loan.id] ?? loanDraftFrom(loan)
    try {
      await patchLoanRepaymentMetadata.mutateAsync({
        id: loan.id,
        data: {
          monthly_payment: draft.monthly_payment.trim() || null,
          repayment_method: draft.repayment_method,
        },
      })
      setAlert({ variant: 'success', title: '대출 상환 메타 저장 완료', description: loan.product_name })
    } catch (e) {
      setAlert({ variant: 'error', title: '대출 상환 메타 저장 실패', description: String(e) })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {alert && (
        <AlertBanner
          variant={alert.variant}
          title={alert.title}
          description={alert.description}
          onDismiss={() => setAlert(null)}
        />
      )}

      {!hasWrite && (
        <AlertBanner
          variant="warn"
          title="읽기 전용 모드"
          description="API 키가 없어 자산 유동성 및 대출 상환 메타 저장이 비활성화됩니다."
        />
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="순자산" value={netWorth != null ? `₩ ${formatKRWCompact(netWorth)}` : '—'}
          className="border-t-2 border-t-accent"
          />
        <KpiCard label="총자산"
          value={assetTotal != null ? `₩ ${formatKRWCompact(assetTotal)}` : '—'}
          />
        <KpiCard label="총부채" value={liabilityTotal != null ? `₩ ${formatKRWCompact(liabilityTotal)}` : '—'}
          className="border-t-2 border-t-danger"
          />
        <KpiCard label="현금성 자산" value={cashEquivalentTotal != null ? `₩ ${formatKRWCompact(cashEquivalentTotal)}` : '—'}
          sub={emergencyMonths != null ? `비상금 ${emergencyMonths.toFixed(1)}개월` : liquidityHealth.data?.confidence ?? ''}
          subVariant={(emergencyMonths ?? 0) >= 3 ? 'up' : 'down'} />
      </div>

      {/* 순자산 추이 */}
      <SectionCard title="순자산 추이" badge="스냅샷 기준 시계열">
        {netWorthHistory.isLoading ? <LoadingState /> :
         netWorthHistory.error ? <ErrorState onRetry={() => netWorthHistory.refetch()} /> :
         netWorthHistory.data ? (
           <LineAreaChart data={netWorthHistory.data.items} />
         ) : <EmptyState />}
      </SectionCard>

      {/* 유동성 + 대출 */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* 유동성 요약 */}
        <SectionCard
          title="유동성 Health"
          badge={comparisonMeta ? (
            <span className={`text-micro px-2 py-0.5 rounded-full border ${compareBadgeTone}`}>
              {comparisonMeta}
            </span>
          ) : liquidityHealth.data?.snapshot_date ?? undefined}
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
                 ].map((s) => (
                   <div key={s.label} className="bg-surface-bar border border-border rounded-lg p-2.5">
                     <div className="text-micro text-text-faint mb-1">{s.label}</div>
                     <div className={`text-body-sm font-bold ${s.color}`}>{s.value}</div>
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
                   <div className="flex items-center justify-between gap-2 mb-2">
                     <div className="text-caption text-text-secondary font-semibold">자산 유동성 분류</div>
                     {isReadOnly ? (
                       <span className="text-micro text-warn border border-warn-muted bg-warn-dim px-2 py-0.5 rounded-full">read-only</span>
                     ) : null}
                   </div>
                   <div className="divide-y divide-border-faint">
                     {assetRows.map((asset) => {
                       const id = asset.id as number
                       const label = assetLabel(asset)
                       const draft = assetDrafts[id] ?? assetDraftFrom(asset)
                       return (
                         <div key={id} className="py-2.5 flex flex-wrap items-end gap-2">
                           <div className="min-w-36 flex-1">
                             <div className="text-caption text-text-primary font-medium">{label}</div>
                             <div className="text-micro text-text-ghost">
                               {[asset.category, asset.amount ? `₩ ${formatKRW(parseFloat(asset.amount))}` : null].filter(Boolean).join(' · ')}
                             </div>
                           </div>
                           <label className="flex flex-col gap-1">
                             <span className="text-micro text-text-faint">유동성</span>
                             <select
                               aria-label={`${label} 유동성 등급`}
                               className="text-caption text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5 disabled:opacity-40"
                               value={draft.liquidity_tier}
                               disabled={isReadOnly || patchAssetLiquidity.isPending}
                               onChange={(e) => setAssetDrafts((prev) => ({
                                 ...prev,
                                 [id]: { ...draft, liquidity_tier: e.target.value as LiquidityTier | '' },
                               }))}
                             >
                               <option value="">미지정</option>
                               {LIQUIDITY_OPTIONS.map(([value, optionLabel]) => (
                                 <option key={value} value={value}>{optionLabel}</option>
                               ))}
                             </select>
                           </label>
                           <label className="flex items-center gap-1.5 text-caption text-text-faint pb-1.5">
                             <input
                               type="checkbox"
                               aria-label={`${label} 현금성 자산`}
                               className="w-3.5 h-3.5 accent-accent"
                               checked={draft.is_cash_equivalent}
                               disabled={isReadOnly || patchAssetLiquidity.isPending}
                               onChange={(e) => setAssetDrafts((prev) => ({
                                 ...prev,
                                 [id]: { ...draft, is_cash_equivalent: e.target.checked },
                               }))}
                             />
                             현금성
                           </label>
                           <button
                             aria-label={`${label} 유동성 저장`}
                             onClick={() => { void saveAssetLiquidity(asset) }}
                             disabled={isReadOnly || patchAssetLiquidity.isPending}
                             className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
                           >
                             저장
                           </button>
                         </div>
                       )
                     })}
                   </div>
                 </div>
               ) : null}
             </>
           ) : <EmptyState message="유동성 데이터가 없습니다" />}
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
                     {['상품', '잔액', '금리', '월상환', '상환 방식', ''].map((h) => (
                       <th key={h} className="text-micro text-text-ghost pb-1.5 text-left">{h}</th>
                     ))}
                   </tr>
                 </thead>
                 <tbody>
                   {loans.data.items.slice(0, 4).map((loan, i) => (
                     <tr key={loan.id ?? i}>
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
                       <td className="py-2 text-right">
                         {typeof loan.id === 'number' ? (
                           <input
                             type="number"
                             min="0"
                             aria-label={`${loan.product_name} 월상환액`}
                             className="w-24 text-caption text-right text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2 py-1 disabled:opacity-40"
                             value={(loanDrafts[loan.id] ?? loanDraftFrom(loan)).monthly_payment}
                             disabled={isReadOnly || patchLoanRepaymentMetadata.isPending}
                             onChange={(e) => setLoanDrafts((prev) => ({
                               ...prev,
                               [loan.id as number]: {
                                 ...(prev[loan.id as number] ?? loanDraftFrom(loan)),
                                 monthly_payment: e.target.value,
                               },
                             }))}
                           />
                         ) : '—'}
                       </td>
                       <td className="py-2 text-right">
                         {typeof loan.id === 'number' ? (
                           <select
                             aria-label={`${loan.product_name} 상환 방식`}
                             className="text-caption text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2 py-1 disabled:opacity-40"
                             value={(loanDrafts[loan.id] ?? loanDraftFrom(loan)).repayment_method}
                             disabled={isReadOnly || patchLoanRepaymentMetadata.isPending}
                             onChange={(e) => setLoanDrafts((prev) => ({
                               ...prev,
                               [loan.id as number]: {
                                 ...(prev[loan.id as number] ?? loanDraftFrom(loan)),
                                 repayment_method: e.target.value as LoanRepaymentMethod,
                               },
                             }))}
                           >
                             {REPAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                               <option key={value} value={value}>{label}</option>
                             ))}
                           </select>
                         ) : '—'}
                       </td>
                       <td className="py-2 text-right">
                         <button
                           aria-label={`${loan.product_name} 상환 메타 저장`}
                           onClick={() => { void saveLoanRepaymentMetadata(loan) }}
                           disabled={isReadOnly || typeof loan.id !== 'number' || patchLoanRepaymentMetadata.isPending}
                           className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
                         >
                           저장
                         </button>
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
