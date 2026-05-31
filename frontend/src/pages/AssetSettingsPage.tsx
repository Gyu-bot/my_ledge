import { useEffect, useState } from 'react'
import { AlertBanner } from '../components/ui/AlertBanner'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { SectionCard } from '../components/ui/SectionCard'
import { useChromeContext } from '../components/layout/chromeContext'
import {
  useAssetSnapshots,
  useLoanSummary,
  usePatchAssetLiquidity,
  usePatchLoanRepaymentMetadata,
} from '../hooks/useAssets'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { formatKRW } from '../lib/utils'
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
    monthly_payment: loan.monthly_payment_source === 'manual'
      ? (loan.monthly_payment ?? '')
      : '',
    repayment_method: loan.repayment_method ?? 'unknown',
  }
}

function monthlyPaymentSourceLabel(loan: LoanItem): string {
  if (loan.monthly_payment_source === 'manual') return '수동 확정'
  if (loan.monthly_payment_source === 'estimated_from_linked_transactions') {
    return loan.loan_kind === 'overdraft'
      ? '연결 거래 추정 · 최근 완료월 평균'
      : '연결 거래 추정 · 완료월 중앙값'
  }
  return loan.monthly_payment ? '출처 미확인' : '연결 거래 부족'
}

function linkedTransactionPaymentBasis(loan: LoanItem): string {
  return loan.loan_kind === 'overdraft' ? '최근 완료월 평균' : '완료월 중앙값'
}

function linkedTransactionPaymentValue(loan: LoanItem): string {
  if (loan.monthly_payment_source !== 'estimated_from_linked_transactions' || !loan.monthly_payment) {
    return '확인 필요'
  }
  return `₩ ${formatKRW(parseFloat(loan.monthly_payment))}`
}

export function AssetSettingsPage() {
  const hasWrite = useWriteAccess()
  const snapshots = useAssetSnapshots()
  const loans = useLoanSummary()
  const patchAssetLiquidity = usePatchAssetLiquidity()
  const patchLoanRepaymentMetadata = usePatchLoanRepaymentMetadata()
  const { setMetaBadge } = useChromeContext()
  const [assetDrafts, setAssetDrafts] = useState<Record<number, AssetLiquidityDraft>>({})
  const [loanDrafts, setLoanDrafts] = useState<Record<number, LoanRepaymentDraft>>({})
  const [alert, setAlert] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)

  const latest = [...(snapshots.data?.items ?? [])]
    .reverse()
    .find((item) => item.asset_total && item.liability_total && item.net_worth)
  const snapshotDate = latest?.snapshot_date ?? loans.data?.snapshot_date ?? null
  const assetRows = (snapshots.data?.asset_items ?? [])
    .filter((item) => item.side === 'asset' && (!latest?.snapshot_date || item.snapshot_date === latest.snapshot_date))

  useEffect(() => {
    if (!snapshotDate) return
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        기준일 {snapshotDate}
      </span>,
    )
    return () => setMetaBadge(null)
  }, [setMetaBadge, snapshotDate])

  useEffect(() => {
    if (!assetRows.length) return
    setAssetDrafts((current) => {
      const next = { ...current }
      let changed = false
      for (const asset of assetRows) {
        if (!next[asset.id]) {
          next[asset.id] = assetDraftFrom(asset)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [assetRows])

  useEffect(() => {
    const loanItems = loans.data?.items ?? []
    if (!loanItems.length) return
    setLoanDrafts((current) => {
      const next = { ...current }
      let changed = false
      for (const loan of loanItems) {
        if (typeof loan.id === 'number' && !next[loan.id]) {
          next[loan.id] = loanDraftFrom(loan)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [loans.data])

  async function saveAssetLiquidity(asset: AssetSnapshotItemResponse) {
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
    } catch (error) {
      setAlert({ variant: 'error', title: '자산 유동성 저장 실패', description: String(error) })
    }
  }

  async function saveLoanRepaymentMetadata(loan: LoanItem) {
    if (typeof loan.id !== 'number') return
    const draft = loanDrafts[loan.id] ?? loanDraftFrom(loan)
    const monthlyPayment = draft.monthly_payment.trim()
    const data = {
      repayment_method: draft.repayment_method,
      ...(monthlyPayment || loan.monthly_payment_source === 'manual'
        ? { monthly_payment: monthlyPayment || null }
        : {}),
    }
    try {
      await patchLoanRepaymentMetadata.mutateAsync({
        id: loan.id,
        data,
      })
      setAlert({ variant: 'success', title: '대출 상환 메타 저장 완료', description: loan.product_name })
    } catch (error) {
      setAlert({ variant: 'error', title: '대출 상환 메타 저장 실패', description: String(error) })
    }
  }

  if (snapshots.isLoading || loans.isLoading) return <LoadingState />
  if (snapshots.error || loans.error) {
    return (
      <ErrorState
        onRetry={() => {
          void snapshots.refetch()
          void loans.refetch()
        }}
      />
    )
  }

  const inputCls = 'text-caption text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5 disabled:opacity-40'

  return (
    <div className="flex flex-col gap-4">
      {alert ? (
        <AlertBanner
          variant={alert.variant}
          title={alert.title}
          description={alert.description}
          onDismiss={() => setAlert(null)}
        />
      ) : null}

      {!hasWrite ? (
        <AlertBanner
          variant="warn"
          title="읽기 전용 모드"
          description="API 키가 없어 자산 유동성 및 대출 상환 메타 저장이 비활성화됩니다."
        />
      ) : null}

      <SectionCard
        title="자산 설정"
        description="조회 화면에서 분리한 유동성/현금성 분류와 대출 상환 메타데이터를 최신 스냅샷 기준으로 편집합니다."
      >
        <div className="text-micro text-text-ghost">
          분석 화면의 자산 현황은 이제 조회 전용이며, 이 화면에서만 설정값을 수정합니다.
        </div>
      </SectionCard>

      <SectionCard
        title="자산 유동성 설정"
        meta={`${assetRows.length}개 자산`}
        description="최신 자산 row의 유동성 등급과 현금성 여부를 관리합니다."
      >
        {assetRows.length ? (
          <div className="divide-y divide-border-faint">
            {assetRows.map((asset) => {
              const draft = assetDrafts[asset.id] ?? assetDraftFrom(asset)
              return (
                <div key={asset.id} className="py-3 flex flex-wrap items-end gap-3">
                  <div className="min-w-44 flex-1">
                    <div className="text-caption text-text-primary font-medium">{assetLabel(asset)}</div>
                    <div className="text-micro text-text-ghost">
                      {[asset.category, `₩ ${formatKRW(parseFloat(asset.amount))}`].join(' · ')}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-micro text-text-faint">유동성 등급</span>
                    <select
                      aria-label={`${assetLabel(asset)} 유동성 등급`}
                      className={inputCls}
                      value={draft.liquidity_tier}
                      disabled={!hasWrite || patchAssetLiquidity.isPending}
                      onChange={(event) => setAssetDrafts((current) => ({
                        ...current,
                        [asset.id]: {
                          ...draft,
                          liquidity_tier: event.target.value as LiquidityTier | '',
                        },
                      }))}
                    >
                      <option value="">미지정</option>
                      {LIQUIDITY_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-caption text-text-faint pb-1.5">
                    <input
                      type="checkbox"
                      aria-label={`${assetLabel(asset)} 현금성 자산`}
                      className="w-3.5 h-3.5 accent-accent"
                      checked={draft.is_cash_equivalent}
                      disabled={!hasWrite || patchAssetLiquidity.isPending}
                      onChange={(event) => setAssetDrafts((current) => ({
                        ...current,
                        [asset.id]: {
                          ...draft,
                          is_cash_equivalent: event.target.checked,
                        },
                      }))}
                    />
                    현금성
                  </label>
                  <button
                    type="button"
                    aria-label={`${assetLabel(asset)} 유동성 저장`}
                    onClick={() => { void saveAssetLiquidity(asset) }}
                    disabled={!hasWrite || patchAssetLiquidity.isPending}
                    className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
                  >
                    저장
                  </button>
                </div>
              )
            })}
          </div>
        ) : <EmptyState message="최신 자산 설정 대상이 없습니다" />}
      </SectionCard>

      <SectionCard
        title="대출 상환 설정"
        meta={`${loans.data?.items.length ?? 0}개 대출`}
        description="연결 거래 기준 월상환액을 기본으로 보고, 필요할 때만 수동 확정합니다."
      >
        {loans.data?.items.length ? (
          <div className="divide-y divide-border-faint">
            {loans.data.items.map((loan, index) => {
              const loanId = loan.id
              const draft = typeof loanId === 'number'
                ? (loanDrafts[loanId] ?? loanDraftFrom(loan))
                : loanDraftFrom(loan)
              const linkedPaymentBasis = linkedTransactionPaymentBasis(loan)
              return (
                <div key={loanId ?? index} className="py-3 flex flex-wrap items-end gap-3">
                  <div className="min-w-44 flex-1">
                    <div className="text-caption text-text-primary font-medium">{loan.product_name}</div>
                    <div className="text-micro text-text-ghost">
                      {[loan.lender, loan.loan_type].filter(Boolean).join(' · ')}
                    </div>
                    <div className="text-micro text-text-muted mt-1">
                      {monthlyPaymentSourceLabel(loan)}
                    </div>
                  </div>
                  <div className="min-w-44 rounded-md border border-border-subtle bg-surface-bar px-3 py-2">
                    <div className="text-micro text-text-faint">연결 거래 기준 월상환액</div>
                    <div className="mt-1 text-caption font-semibold text-text-primary">
                      {linkedTransactionPaymentValue(loan)}
                    </div>
                    <div className="mt-0.5 text-micro text-text-muted">
                      {loan.monthly_payment_source === 'estimated_from_linked_transactions'
                        ? linkedPaymentBasis
                        : '연결 거래 추정값 없음'}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-micro text-text-faint">수동 월상환액</span>
                    <input
                      aria-label={`${loan.product_name} 월상환액`}
                      type="number"
                      min={0}
                      placeholder={loan.monthly_payment ?? undefined}
                      className={inputCls}
                      value={draft.monthly_payment}
                      disabled={!hasWrite || patchLoanRepaymentMetadata.isPending || typeof loanId !== 'number'}
                      onChange={(event) => {
                        if (typeof loanId !== 'number') return
                        setLoanDrafts((current) => ({
                          ...current,
                          [loanId]: {
                            ...draft,
                            monthly_payment: event.target.value,
                          },
                        }))
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-micro text-text-faint">상환 방식</span>
                    <select
                      aria-label={`${loan.product_name} 상환 방식`}
                      className={inputCls}
                      value={draft.repayment_method}
                      disabled={!hasWrite || patchLoanRepaymentMetadata.isPending || typeof loanId !== 'number'}
                      onChange={(event) => {
                        if (typeof loanId !== 'number') return
                        setLoanDrafts((current) => ({
                          ...current,
                          [loanId]: {
                            ...draft,
                            repayment_method: event.target.value as LoanRepaymentMethod,
                          },
                        }))
                      }}
                    >
                      {REPAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`${loan.product_name} 상환 메타 저장`}
                    onClick={() => { void saveLoanRepaymentMetadata(loan) }}
                    disabled={!hasWrite || patchLoanRepaymentMetadata.isPending || typeof loanId !== 'number'}
                    className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
                  >
                    수동 확정
                  </button>
                </div>
              )
            })}
          </div>
        ) : <EmptyState message="최신 대출 설정 대상이 없습니다" />}
      </SectionCard>
    </div>
  )
}
