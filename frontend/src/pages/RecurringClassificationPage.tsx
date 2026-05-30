import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertBanner } from '../components/ui/AlertBanner'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { Pagination } from '../components/ui/Pagination'
import { useChromeContext } from '../components/layout/chromeContext'
import { useRecurringPayments } from '../hooks/useAnalytics'
import {
  useApplyRecurringDryRun,
  useBulkUpdateTransactions,
  useRecurringCategoryRulesDryRun,
} from '../hooks/useTransactions'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { formatKRW, formatPct } from '../lib/utils'
import type { RecurringPaymentItem } from '../types/analytics'
import type { RecurringDryRunApplyScope, RecurringDryRunItem } from '../types/transaction'

type RecurringKind = RecurringPaymentItem['recurring_payment_kind']
type BulkRecurringKind = '' | 'unclassified' | 'installment' | 'monthly_recurring' | 'not_recurring'

const PAGE_SIZE = 20

function recurringKindLabel(value: RecurringKind) {
  if (value === 'installment') return '할부'
  if (value === 'monthly_recurring') return '매월 반복'
  if (value === 'not_recurring') return '반복 아님'
  return '미분류'
}

function recurringKindSummary(item: RecurringPaymentItem) {
  return [
    item.installment_count > 0 ? `할부 ${item.installment_count}` : null,
    item.monthly_recurring_count > 0 ? `매월 ${item.monthly_recurring_count}` : null,
    item.not_recurring_count > 0 ? `반복 아님 ${item.not_recurring_count}` : null,
    `미분류 ${item.unclassified_count}`,
  ].filter(Boolean).join(' · ')
}

function defaultDryRunScope(item: RecurringDryRunItem): RecurringDryRunApplyScope {
  if (item.apply_scope_options.includes('all_matching')) return 'all_matching'
  return item.apply_scope_options[0] ?? 'future_only'
}

function orderedDryRunScopes(item: RecurringDryRunItem): RecurringDryRunApplyScope[] {
  return [...item.apply_scope_options].sort((left, right) => {
    if (left === 'all_matching') return -1
    if (right === 'all_matching') return 1
    return left.localeCompare(right)
  })
}

function installmentManagementHref(merchant: string, avgAmount: number) {
  const params = new URLSearchParams({
    search: merchant,
    linked: 'unlinked',
    prefill_merchant: merchant,
    prefill_amount: String(Math.max(1, Math.round(avgAmount))),
  })
  return `/operations/installments?${params.toString()}`
}

function dryRunAverageAmount(item: RecurringDryRunItem) {
  if (item.matched_transactions.length === 0) return 0
  const total = item.matched_transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
  return total / item.matched_transactions.length
}

export function RecurringClassificationPage() {
  const hasWrite = useWriteAccess()
  const { setMetaBadge } = useChromeContext()
  const selectPageCheckboxRef = useRef<HTMLInputElement | null>(null)
  const [page, setPage] = useState(1)
  const [overrides, setOverrides] = useState<Record<string, RecurringKind>>({})
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(new Set())
  const [bulkKind, setBulkKind] = useState<BulkRecurringKind>('')
  const [dryRunScopes, setDryRunScopes] = useState<Record<string, RecurringDryRunApplyScope>>({})
  const [alert, setAlert] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)
  const recurring = useRecurringPayments(page, PAGE_SIZE)
  const recurringDryRun = useRecurringCategoryRulesDryRun()
  const bulkMutation = useBulkUpdateTransactions()
  const applyDryRunMutation = useApplyRecurringDryRun()

  useEffect(() => {
    const total = recurring.data?.total ?? 0
    const showing = recurring.data?.items?.length ?? 0
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {showing} / {total}건
      </span>,
    )
    return () => setMetaBadge(null)
  }, [recurring.data, setMetaBadge])

  const visibleItems = recurring.data?.items ?? []
  const visibleMerchants = visibleItems.map((item) => item.merchant)
  const allVisibleSelected = visibleMerchants.length > 0
    && visibleMerchants.every((merchant) => selectedMerchants.has(merchant))
  const someVisibleSelected = visibleMerchants.some((merchant) => selectedMerchants.has(merchant))

  useEffect(() => {
    setSelectedMerchants(new Set())
    setBulkKind('')
  }, [page])

  useEffect(() => {
    if (selectPageCheckboxRef.current) {
      selectPageCheckboxRef.current.indeterminate = someVisibleSelected && !allVisibleSelected
    }
  }, [allVisibleSelected, someVisibleSelected])

  async function classify(item: RecurringPaymentItem, value: string) {
    const recurringPaymentKind = (value || null) as RecurringKind
    setOverrides((current) => ({ ...current, [item.merchant]: recurringPaymentKind }))
    try {
      const result = await bulkMutation.mutateAsync({
        ids: item.transaction_ids,
        recurring_payment_kind: recurringPaymentKind,
      })
      setAlert({ variant: 'success', title: `${item.merchant} 분류 저장 완료`, description: `${result.updated}건 반영` })
    } catch (e) {
      setOverrides((current) => {
        const next = { ...current }
        delete next[item.merchant]
        return next
      })
      setAlert({ variant: 'error', title: '반복 결제 분류 저장 실패', description: String(e) })
    }
  }

  function toggleSelectVisible() {
    if (!hasWrite || visibleMerchants.length === 0) return
    setSelectedMerchants((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleMerchants.forEach((merchant) => next.delete(merchant))
      } else {
        visibleMerchants.forEach((merchant) => next.add(merchant))
      }
      return next
    })
  }

  function toggleSelect(item: RecurringPaymentItem) {
    if (!hasWrite || item.transaction_ids.length === 0) return
    setSelectedMerchants((current) => {
      const next = new Set(current)
      if (next.has(item.merchant)) next.delete(item.merchant)
      else next.add(item.merchant)
      return next
    })
  }

  async function applyBulkClassification() {
    const selectedItems = visibleItems.filter((item) => selectedMerchants.has(item.merchant))
    if (selectedItems.length === 0 || bulkKind === '') return
    const recurringPaymentKind = bulkKind === 'unclassified' ? null : bulkKind
    const ids = selectedItems.flatMap((item) => item.transaction_ids)
    const previousOverrides = { ...overrides }
    setOverrides((current) => {
      const next = { ...current }
      selectedItems.forEach((item) => { next[item.merchant] = recurringPaymentKind })
      return next
    })

    try {
      const result = await bulkMutation.mutateAsync({
        ids,
        recurring_payment_kind: recurringPaymentKind,
      })
      setSelectedMerchants(new Set())
      setBulkKind('')
      setAlert({
        variant: 'success',
        title: `${selectedItems.length}개 그룹 분류 저장 완료`,
        description: `${result.updated}건 반영`,
      })
    } catch (e) {
      setOverrides(previousOverrides)
      setAlert({ variant: 'error', title: '선택 그룹 분류 저장 실패', description: String(e) })
    }
  }

  async function applyDryRun(item: RecurringDryRunItem) {
    const applyScope = dryRunScopes[item.merchant] ?? defaultDryRunScope(item)
    try {
      const result = await applyDryRunMutation.mutateAsync({
        merchant: item.merchant,
        proposed_kind: item.proposed_kind,
        apply_scope: applyScope,
      })
      setAlert({
        variant: 'success',
        title: `${item.merchant} dry-run 적용 완료`,
        description: `${result.updated}건 반영`,
      })
    } catch (e) {
      setAlert({ variant: 'error', title: 'dry-run 승인 적용 실패', description: String(e) })
    }
  }

  const inputCls = 'text-caption text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5 disabled:opacity-50'
  const selectedCount = selectedMerchants.size

  return (
    <div className="flex flex-col gap-3">
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
          description="API 키가 없어 반복 결제 분류 저장이 비활성화됩니다."
        />
      )}

      <div className="bg-surface-card border border-border-subtle rounded-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border-faint">
          <div>
            <span className="text-label font-semibold text-text-secondary">dry-run 승인 후보</span>
            <div className="text-micro text-text-ghost mt-0.5">반복 카테고리 규칙이 미분류 반복 거래에 제안하는 변경을 그룹 단위로 검토합니다.</div>
          </div>
          <span className="text-micro text-text-muted bg-surface-bar border border-border-subtle px-2 py-0.5 rounded-full">
            {recurringDryRun.data?.items.length ?? 0}개 후보
          </span>
        </div>

        {recurringDryRun.isLoading ? <LoadingState /> :
          recurringDryRun.data && recurringDryRun.data.items.length > 0 ? (
            <div className="divide-y divide-border-faint">
              {recurringDryRun.data.items.map((item) => {
                const selectedScope = dryRunScopes[item.merchant] ?? defaultDryRunScope(item)
                const scopeOptions = orderedDryRunScopes(item)
                const installmentHref = item.proposed_kind === 'installment'
                  ? installmentManagementHref(item.merchant, dryRunAverageAmount(item))
                  : null
                return (
                  <div key={item.merchant} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-caption font-semibold text-text-primary">{item.merchant}</span>
                          <span className="text-nano bg-accent-dim text-accent border border-accent-muted px-1.5 py-0.5 rounded">
                            {recurringKindLabel(item.proposed_kind)}
                          </span>
                          <span className="text-micro text-text-ghost">
                            confidence {formatPct(item.confidence * 100)}
                          </span>
                        </div>
                        <div className="text-micro text-text-muted mt-1">{item.reason}</div>
                        <div className="text-micro text-text-ghost mt-1">카테고리 힌트 {item.category_hint}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {installmentHref ? (
                          <Link
                            to={installmentHref}
                            aria-label={`${item.merchant} 할부 관리 이동`}
                            className="text-caption px-3 py-1.5 border border-border-faint text-text-secondary rounded-md"
                          >
                            할부 관리
                          </Link>
                        ) : null}
                        <label className="flex items-center gap-1.5">
                          <span className="text-caption text-text-faint">적용 범위</span>
                          <select
                            aria-label={`${item.merchant} dry-run 적용 범위`}
                            className={`${inputCls} py-1`}
                            value={selectedScope}
                            disabled={!hasWrite || applyDryRunMutation.isPending}
                            onChange={(event) => {
                              setDryRunScopes((current) => ({
                                ...current,
                                [item.merchant]: event.target.value as RecurringDryRunApplyScope,
                              }))
                            }}
                          >
                            {scopeOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => void applyDryRun(item)}
                          disabled={!hasWrite || applyDryRunMutation.isPending || item.matched_transactions.length === 0}
                          className="text-caption px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md disabled:opacity-40"
                        >
                          {item.merchant} dry-run 승인 적용
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.matched_transactions.map((tx) => (
                        <span
                          key={tx.id}
                          className="text-micro text-text-muted bg-surface-bar border border-border-subtle px-2 py-0.5 rounded"
                        >
                          {tx.date} · ₩ {formatKRW(tx.amount)}
                        </span>
                      ))}
                    </div>
                    <div className="text-micro text-text-ghost mt-2">
                      {scopeOptions.join(' / ')}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <EmptyState message="dry-run 승인 후보가 없습니다" />}
      </div>

      {selectedCount > 0 && (
        <div className="px-4 py-3 bg-surface-section border border-border-subtle rounded-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-caption text-info-default font-semibold">{selectedCount}개 그룹 선택됨</div>
              <div className="text-micro text-text-ghost mt-0.5">현재 페이지에서 선택한 반복 결제 그룹에 같은 분류를 적용합니다.</div>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedMerchants(new Set()); setBulkKind('') }}
              className="text-caption px-3 py-1.5 border border-border-faint text-text-ghost rounded-md"
            >
              선택 해제
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5">
              <span className="text-caption text-text-faint">반복결제 분류</span>
              <select
                aria-label="선택 그룹 반복결제 분류"
                className={`${inputCls} py-1`}
                value={bulkKind}
                disabled={!hasWrite || bulkMutation.isPending}
                onChange={(event) => setBulkKind(event.target.value as BulkRecurringKind)}
              >
                <option value="">— 선택 —</option>
                <option value="unclassified">미분류</option>
                <option value="installment">할부</option>
                <option value="monthly_recurring">매월 반복</option>
                <option value="not_recurring">반복 아님</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void applyBulkClassification()}
              disabled={!hasWrite || bulkMutation.isPending || bulkKind === ''}
              className="text-caption px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md disabled:opacity-40"
            >
              선택 그룹 분류 적용
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface-card border border-border-subtle rounded-card px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-caption text-text-secondary font-semibold">반복 결제 분류</div>
            <div className="text-micro text-text-ghost mt-0.5">
              반복 결제 후보를 할부와 매월 신규 반복 결제로 구분합니다. 인사이트 화면에는 저장된 결과만 표시됩니다.
            </div>
          </div>
          <span className="text-micro text-text-muted bg-surface-bar border border-border-subtle px-2 py-0.5 rounded-full">
            {recurring.data?.total ?? 0}개 그룹
          </span>
        </div>
      </div>

      <div className="bg-surface-card border border-border-subtle rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-faint">
          <div>
            <span className="text-label font-semibold text-text-secondary">반복 결제 후보 목록</span>
            <div className="text-micro text-text-ghost mt-0.5">분석용 거래처 그룹 단위로 해당 거래 전체에 같은 반복 결제 성격을 저장합니다.</div>
          </div>
          <span className="text-micro text-text-muted bg-surface-bar border border-border-subtle px-2 py-0.5 rounded-full">
            {page} / {Math.max(1, Math.ceil((recurring.data?.total ?? 0) / PAGE_SIZE))} 페이지
          </span>
        </div>

        {recurring.isLoading ? <LoadingState /> :
          recurring.data && recurring.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-caption" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 32 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 132 }} />
                  <col style={{ width: 132 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="text-micro text-text-ghost px-2 py-2 text-left font-medium">
                      <input
                        ref={selectPageCheckboxRef}
                        type="checkbox"
                        aria-label="현재 페이지 전체 선택"
                        checked={allVisibleSelected}
                        disabled={!hasWrite || visibleMerchants.length === 0}
                        onChange={toggleSelectVisible}
                        className="w-3 h-3 accent-accent disabled:opacity-40"
                      />
                    </th>
                    {['분석용 거래처', '카테고리', '주기', '평균금액', '횟수', '현재 결과', '분류 변경'].map((header) => (
                      <th key={header} className="text-micro text-text-ghost px-2 py-2 text-left font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recurring.data.items.map((item) => {
                    const value = overrides[item.merchant] ?? item.recurring_payment_kind
                    const isSelected = selectedMerchants.has(item.merchant)
                    const installmentHref = value === 'installment'
                      ? installmentManagementHref(item.merchant, item.avg_amount)
                      : null
                    return (
                      <tr key={`${item.merchant}:${item.category}`} className={isSelected ? 'bg-surface-selected' : ''}>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            aria-label={`${item.merchant} 선택`}
                            checked={isSelected}
                            disabled={!hasWrite || item.transaction_ids.length === 0}
                            onChange={() => toggleSelect(item)}
                            className="w-3 h-3 accent-accent disabled:opacity-40"
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <div className="text-text-primary font-medium overflow-hidden text-ellipsis whitespace-nowrap">{item.merchant}</div>
                          {installmentHref ? (
                            <Link
                              to={installmentHref}
                              aria-label={`${item.merchant} 할부 관리 이동`}
                              className="mt-1 inline-flex text-micro text-info-default underline underline-offset-2"
                            >
                              할부 관리
                            </Link>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-text-faint overflow-hidden text-ellipsis whitespace-nowrap">{item.category}</td>
                        <td className="px-2 py-2">
                          <span className="text-nano bg-accent-dim text-accent border border-accent-muted px-1.5 py-0.5 rounded">
                            {item.interval_type}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">₩ {formatKRW(item.avg_amount)}</td>
                        <td className="px-2 py-2 text-right text-text-muted">{item.occurrences}회</td>
                        <td className="px-2 py-2">
                          <span className="text-nano bg-surface-bar border border-border-subtle text-text-secondary px-1.5 py-0.5 rounded">
                            {recurringKindLabel(value)}
                          </span>
                          <span className="block text-micro text-text-ghost mt-1 truncate">{recurringKindSummary(item)}</span>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            aria-label={`${item.merchant} 반복결제 분류`}
                            className={`${inputCls} w-full py-1`}
                            value={value ?? ''}
                            disabled={!hasWrite || bulkMutation.isPending || item.transaction_ids.length === 0}
                            onChange={(event) => void classify(item, event.target.value)}
                          >
                            <option value="">미분류</option>
                            <option value="installment">할부</option>
                            <option value="monthly_recurring">매월 반복</option>
                            <option value="not_recurring">반복 아님</option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <Pagination page={page} perPage={PAGE_SIZE} total={recurring.data.total} onPageChange={setPage} />
            </div>
          ) : <EmptyState message="반복 결제 후보가 없습니다" />}
      </div>
    </div>
  )
}
