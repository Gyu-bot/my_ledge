import { useEffect, useRef, useState } from 'react'
import { AlertBanner } from '../components/ui/AlertBanner'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { Pagination } from '../components/ui/Pagination'
import { useChromeContext } from '../components/layout/chromeContext'
import { useRecurringPayments } from '../hooks/useAnalytics'
import { useBulkUpdateTransactions } from '../hooks/useTransactions'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { formatKRW } from '../lib/utils'
import type { RecurringPaymentItem } from '../types/analytics'

type RecurringKind = RecurringPaymentItem['recurring_payment_kind']
type BulkRecurringKind = '' | 'unclassified' | 'installment' | 'monthly_recurring'

const PAGE_SIZE = 20

function recurringKindLabel(value: RecurringKind) {
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

export function RecurringClassificationPage() {
  const hasWrite = useWriteAccess()
  const { setMetaBadge } = useChromeContext()
  const selectPageCheckboxRef = useRef<HTMLInputElement | null>(null)
  const [page, setPage] = useState(1)
  const [overrides, setOverrides] = useState<Record<string, RecurringKind>>({})
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(new Set())
  const [bulkKind, setBulkKind] = useState<BulkRecurringKind>('')
  const [alert, setAlert] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)
  const recurring = useRecurringPayments(page, PAGE_SIZE)
  const bulkMutation = useBulkUpdateTransactions()

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
            <div className="text-micro text-text-ghost mt-0.5">거래처 그룹 단위로 해당 거래 전체에 같은 반복 결제 성격을 저장합니다.</div>
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
                    {['거래처', '카테고리', '주기', '평균금액', '횟수', '현재 결과', '분류 변경'].map((header) => (
                      <th key={header} className="text-micro text-text-ghost px-2 py-2 text-left font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recurring.data.items.map((item) => {
                    const value = overrides[item.merchant] ?? item.recurring_payment_kind
                    const isSelected = selectedMerchants.has(item.merchant)
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
                        <td className="px-2 py-2 text-text-primary font-medium overflow-hidden text-ellipsis whitespace-nowrap">{item.merchant}</td>
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
