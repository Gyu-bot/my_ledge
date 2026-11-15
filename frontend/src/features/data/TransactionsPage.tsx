import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { BulkBar } from '../../ds/BulkBar'
import { Select, TextInput, Toggle } from '../../ds/Field'
import { Pagination } from '../../ds/Pagination'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { formatSignedWon, formatWon } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import {
  useBulkDeletePreview,
  useBulkDeleteTransactions,
  useBulkRestorePreview,
  useBulkRestoreTransactions,
  useBulkUpdateTransactions,
  useTransactionFilterOptions,
  useTransactionList,
} from '../../hooks/useTransactions'
import { useBulkTransactionAdjustability } from '../../hooks/useNature'
import { useAnalyticsSettings } from '../../hooks/useSettings'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { FlowRowKey } from '../../types/metrics'
import type { AdjustabilityValue } from '../../types/nature'
import type { TransactionBulkMutationPreview, TransactionListParams, TransactionResponse } from '../../types/transaction'
import { FLOW_ROW_LABELS } from '../analysis/flowMeasures'
import { loadErrorMessage, writeErrorMessage } from '../analysis/text'
import { ADJUSTABILITY_TEXT } from '../classification/labels'
import { TransactionEditor } from '../transactions/TransactionEditor'

const PAGE_SIZE = 40

/** 주소창에 남는 조회 조건 — 다른 화면에 다녀와도 같은 조건과 쪽으로 돌아온다. */
const FILTER_KEYS = [
  'search',
  'type',
  'source',
  'category_major',
  'payment_method',
  'flow_row',
  'payment_form',
  'adjustability',
  'start_date',
  'end_date',
  'include_deleted',
  'is_edited',
] as const
type FilterKey = (typeof FILTER_KEYS)[number]
type FilterState = Record<FilterKey, string>

const FLOW_ROWS: FlowRowKey[] = [
  'income_undetermined',
  'committed_loan',
  'committed_installment',
  'committed_recurring',
  'ad_hoc_protected',
  'ad_hoc_adjustable',
  'undecided',
  'transfer_undetermined',
  'other_type',
]

function filterFrom(params: URLSearchParams): FilterState {
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? ''])) as FilterState
}

function listParams(filter: FilterState, page: number): TransactionListParams {
  return {
    page,
    per_page: PAGE_SIZE,
    search: filter.search || undefined,
    type: filter.type || undefined,
    source: filter.source || undefined,
    category_major: filter.category_major || undefined,
    payment_method: filter.payment_method || undefined,
    flow_row: (filter.flow_row as FlowRowKey) || undefined,
    payment_form: (filter.payment_form as TransactionListParams['payment_form']) || undefined,
    adjustability: (filter.adjustability as TransactionListParams['adjustability']) || undefined,
    start_date: filter.start_date || undefined,
    end_date: filter.end_date || undefined,
    include_deleted: filter.include_deleted === '1' || undefined,
    is_edited: filter.is_edited === '1' || undefined,
  }
}

interface BulkDraft {
  merchant: string
  category_major_user: string
  adjustability: '' | AdjustabilityValue | 'clear'
}

const DEFAULT_BULK_DRAFT: BulkDraft = { merchant: '', category_major_user: '', adjustability: '' }

function RowsView() {
  const hasWrite = useWriteAccess()
  const filterOptions = useTransactionFilterOptions()
  const [searchParams, setSearchParams] = useSearchParams()
  const transactionIdParam = Number(searchParams.get('transaction_id'))
  const linkedId = Number.isSafeInteger(transactionIdParam) && transactionIdParam > 0 ? transactionIdParam : null
  const applied = filterFrom(searchParams)
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const [filterDraft, setFilterDraft] = useState<FilterState>(applied)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [bulkDraft, setBulkDraft] = useState<BulkDraft>(DEFAULT_BULK_DRAFT)
  const [bulkProgress, setBulkProgress] = useState<string | null>(null)

  const list = useTransactionList(listParams(applied, page))
  const bulkUpdate = useBulkUpdateTransactions()
  const bulkAdjustability = useBulkTransactionAdjustability()
  const bulkDeletePreview = useBulkDeletePreview()
  const bulkDelete = useBulkDeleteTransactions()
  const bulkRestorePreview = useBulkRestorePreview()
  const bulkRestore = useBulkRestoreTransactions()
  const settings = useAnalyticsSettings()
  const bulkSettings = settings.data?.effective.bulk_operations

  const rows = list.data?.items ?? []
  const openId = editingId ?? linkedId

  function writeParams(update: (next: URLSearchParams) => void) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      update(next)
      return next
    }, { replace: true })
  }

  function closeEditor() {
    setEditingId(null)
    if (linkedId !== null) writeParams((next) => next.delete('transaction_id'))
  }

  function applyFilter() {
    writeParams((next) => {
      for (const key of FILTER_KEYS) {
        if (filterDraft[key]) next.set(key, filterDraft[key])
        else next.delete(key)
      }
      next.delete('page')
    })
    setSelected(new Set())
  }

  function resetFilter() {
    setFilterDraft(filterFrom(new URLSearchParams()))
    writeParams((next) => {
      for (const key of FILTER_KEYS) next.delete(key)
      next.delete('page')
    })
    setSelected(new Set())
  }

  function setPage(next: number) {
    writeParams((params) => {
      if (next === 1) params.delete('page')
      else params.set('page', String(next))
    })
  }

  function toggleRow(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const includeDeleted = applied.include_deleted === '1'
  const selectableIds = rows.filter((tx) => !tx.is_deleted || includeDeleted).map((tx) => tx.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  async function applyBulk() {
    const ids = [...selected]
    if (ids.length === 0) return
    const data: Parameters<typeof bulkUpdate.mutateAsync>[0] = { ids }
    if (bulkDraft.merchant.trim()) data.merchant = bulkDraft.merchant.trim()
    if (bulkDraft.category_major_user) data.category_major_user = bulkDraft.category_major_user
    try {
      if (data.merchant || data.category_major_user) {
        const result = await bulkUpdate.mutateAsync(data)
        toast.success(`${result.updated}건 거래처·카테고리를 고쳤습니다`)
      }
      if (bulkDraft.adjustability) {
        const expenseIds = rows.filter((tx) => selected.has(tx.id) && tx.type === '지출').map((tx) => tx.id)
        const skipped = ids.length - expenseIds.length
        const value = bulkDraft.adjustability === 'clear' ? null : bulkDraft.adjustability
        const result = await bulkAdjustability.mutateAsync({
          ids: expenseIds,
          value,
          onProgress: ({ done, total }) => setBulkProgress(`${done} / ${total}건 저장 중…`),
        })
        toast.success(
          value ? `${result.applied.length}건을 '${ADJUSTABILITY_TEXT[value]}'(으)로 정했습니다` : `${result.applied.length}건의 거래 단위 값을 지웠습니다`,
          { description: [skipped > 0 ? `지출이 아닌 ${skipped}건은 조정 가능성을 묻지 않아 건너뛰었습니다.` : '', result.failed.length > 0 ? `${result.failed.length}건은 저장하지 못했습니다.` : ''].filter(Boolean).join(' ') || undefined },
        )
      }
      setSelected(new Set())
      setBulkDraft(DEFAULT_BULK_DRAFT)
    } catch (error) {
      toast.error('일괄 수정 실패', { description: writeErrorMessage(error) })
    } finally {
      setBulkProgress(null)
    }
  }

  function shouldPreviewBulk() {
    return bulkSettings?.require_preview !== false
  }

  function shouldConfirmBulk(ids: number[]) {
    if (!bulkSettings) return true
    return bulkSettings.require_confirmation || ids.length > bulkSettings.max_bulk_rows_without_extra_confirmation
  }

  function bulkPreviewMessage(actionLabel: string, ids: number[], preview: TransactionBulkMutationPreview | null) {
    if (!preview) return `${ids.length}건 ${actionLabel}할까요?`
    const merchants = preview.representative_merchants.join(', ') || '없음'
    return `${preview.count}건 ${actionLabel} · ${preview.period_start ?? '—'}~${preview.period_end ?? '—'} · ${formatWon(preview.expense_total)}\n대표: ${merchants}\n\n${actionLabel}할까요?`
  }

  async function bulkDeleteFlow() {
    const ids = [...selected]
    if (ids.length === 0) return
    try {
      const preview = shouldPreviewBulk() ? await bulkDeletePreview.mutateAsync({ ids }) : null
      if (shouldConfirmBulk(ids) && !window.confirm(bulkPreviewMessage('삭제', ids, preview))) return
      const result = await bulkDelete.mutateAsync({ ids })
      setSelected(new Set())
      toast.success(
        `${result.updated}건 삭제 완료`,
        bulkSettings?.show_undo_after_delete === false
          ? undefined
          : { action: { label: '방금 삭제 복원', onClick: () => void undoDelete(ids) } },
      )
    } catch (error) {
      toast.error('일괄 삭제 실패', { description: writeErrorMessage(error) })
    }
  }

  async function undoDelete(ids: number[]) {
    try {
      const result = await bulkRestore.mutateAsync({ ids })
      toast.success(`${result.updated}건 복원 완료`)
    } catch (error) {
      toast.error('복원 실패', { description: writeErrorMessage(error) })
    }
  }

  async function bulkRestoreFlow() {
    const ids = [...selected]
    if (ids.length === 0) return
    try {
      const preview = shouldPreviewBulk() ? await bulkRestorePreview.mutateAsync({ ids }) : null
      if (shouldConfirmBulk(ids) && !window.confirm(bulkPreviewMessage('복원', ids, preview))) return
      const result = await bulkRestore.mutateAsync({ ids })
      setSelected(new Set())
      toast.success(`${result.updated}건 복원 완료`)
    } catch (error) {
      toast.error('복원 실패', { description: writeErrorMessage(error) })
    }
  }

  const inputCls = 'rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-caption text-text-secondary'
  const setDraft = (key: FilterKey, value: string) => setFilterDraft((current) => ({ ...current, [key]: value }))
  const lineFilterActive = Boolean(applied.flow_row || applied.payment_form || applied.adjustability)

  return (
    <>
      <Card
        title="조회 조건"
        meta="적용한 조건은 주소에 남아, 다른 화면에 다녀와도 그대로입니다."
        action={<div className="flex gap-2"><Button variant="primary" onClick={applyFilter}>적용</Button><Button variant="ghost" onClick={resetFilter}>초기화</Button></div>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputCls} w-40`} aria-label="거래처·설명·메모 찾기" placeholder="거래처·설명·메모" value={filterDraft.search} onChange={(e) => setDraft('search', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyFilter() }} />
          <Select className={inputCls} value={filterDraft.type} onChange={(e) => setDraft('type', e.target.value)} aria-label="거래 유형"><option value="">유형 전체</option><option>지출</option><option>수입</option><option>이체</option></Select>
          <Select className={inputCls} value={filterDraft.source} onChange={(e) => setDraft('source', e.target.value)} aria-label="입력 출처"><option value="">출처 전체</option><option value="import">가져오기</option><option value="manual">직접 추가</option></Select>
          <Select className={inputCls} value={filterDraft.category_major} onChange={(e) => setDraft('category_major', e.target.value)} aria-label="대분류"><option value="">대분류 전체</option>{filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          <Select className={inputCls} value={filterDraft.payment_method} onChange={(e) => setDraft('payment_method', e.target.value)} aria-label="결제수단"><option value="">결제수단 전체</option>{filterOptions.data?.payment_method_options.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
          <Select className={inputCls} value={filterDraft.payment_form} onChange={(e) => setDraft('payment_form', e.target.value)} aria-label="지급 형태"><option value="">지급 형태 전체</option><option value="committed">약정</option><option value="ad_hoc">수시</option></Select>
          <Select className={inputCls} value={filterDraft.adjustability} onChange={(e) => setDraft('adjustability', e.target.value)} aria-label="조정 가능성"><option value="">조정 가능성 전체</option><option value="protected">보호</option><option value="adjustable">조정 가능</option><option value="undecided">미정</option></Select>
          <Select className={inputCls} value={filterDraft.flow_row} onChange={(e) => setDraft('flow_row', e.target.value)} aria-label="월 흐름표 줄"><option value="">흐름표 줄 전체</option>{FLOW_ROWS.map((row) => <option key={row} value={row}>{FLOW_ROW_LABELS[row]}</option>)}</Select>
          <input type="date" className={inputCls} value={filterDraft.start_date} onChange={(e) => setDraft('start_date', e.target.value)} aria-label="시작일" />
          <input type="date" className={inputCls} value={filterDraft.end_date} onChange={(e) => setDraft('end_date', e.target.value)} aria-label="종료일" />
          <Toggle label="삭제 포함" checked={filterDraft.include_deleted === '1'} onChange={(v) => setDraft('include_deleted', v ? '1' : '')} />
          <Toggle label="고친 것만" checked={filterDraft.is_edited === '1'} onChange={(v) => setDraft('is_edited', v ? '1' : '')} />
        </div>
        {lineFilterActive ? <p className="mt-2 text-micro text-text-muted">지급 형태·조정 가능성·흐름표 줄로 거르면 분석에 들어가는 원화 거래만 나옵니다(삭제·대체된 거래 제외).</p> : null}
      </Card>

      <Card title="거래 목록" meta={`${rows.length} / ${list.data?.total ?? 0}건 · 거래처를 누르거나 Enter로 고치기 패널이 열립니다`} bodyClassName="p-0">
        {list.isLoading ? <div className="p-4"><ListSkeleton rows={8} /></div> :
         list.error ? <ErrorState message={loadErrorMessage(list.error)} onRetry={() => void list.refetch()} /> :
         rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-label">
              <thead className="bg-bg-inset">
                <tr>
                  <th className="px-3 py-2">
                    <input type="checkbox" aria-label="페이지 전체 선택" checked={allSelected} disabled={selectableIds.length === 0}
                      onChange={() => setSelected((current) => { const next = new Set(current); if (allSelected) selectableIds.forEach((id) => next.delete(id)); else selectableIds.forEach((id) => next.add(id)); return next })}
                      className="h-3 w-3 accent-[var(--ds-accent-fg)]" />
                  </th>
                  {['날짜', '거래처', '카테고리', '유형', '상태', '금액'].map((h) => <th key={h} className="px-3 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((tx: TransactionResponse) => (
                  <tr
                    key={tx.id}
                    onClick={() => setEditingId(tx.id)}
                    className={`cursor-pointer transition-colors duration-fast hover:bg-bg-inset ${tx.is_deleted ? 'opacity-40 line-through' : selected.has(tx.id) ? 'bg-bg-selected' : ''}`}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      {(!tx.is_deleted || includeDeleted) && <input type="checkbox" aria-label={`${tx.merchant} 선택`} checked={selected.has(tx.id)} onChange={() => toggleRow(tx.id)} className="h-3 w-3 accent-[var(--ds-accent-fg)]" />}
                    </td>
                    <td className="tnum px-3 py-2 text-text-faint">{tx.date.slice(5)}</td>
                    <td className="max-w-[180px] px-3 py-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingId(tx.id) }}
                        aria-label={`${tx.merchant} ${tx.date} 거래 고치기`}
                        className="block max-w-full truncate rounded-sm text-left text-text-primary hover:underline"
                      >
                        {tx.merchant}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-text-muted">{tx.effective_category_major}{tx.effective_category_minor ? ` / ${tx.effective_category_minor}` : ''}</td>
                    <td className="px-3 py-2 text-caption text-text-muted">{tx.type}</td>
                    <td className="px-3 py-2"><Badge variant={tx.is_deleted ? 'expense' : tx.is_edited ? 'accent' : 'neutral'}>{tx.is_deleted ? '삭제됨' : tx.is_edited ? '고침' : '원본'}</Badge></td>
                    <td className={`tnum px-3 py-2 text-right font-semibold ${tx.amount < 0 ? 'text-expense' : 'text-income'}`}>{formatSignedWon(tx.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} perPage={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </div>
        ) : <EmptyState className="py-10" message="조건에 맞는 거래가 없습니다" />}
      </Card>

      <BulkBar
        count={selected.size}
        onClear={() => { setSelected(new Set()); setBulkDraft(DEFAULT_BULK_DRAFT) }}
        preview={bulkProgress ? <span role="status" className="text-caption text-text-muted">{bulkProgress}</span> : undefined}
      >
        <TextInput
          className="w-36 text-caption"
          aria-label="일괄 거래처"
          placeholder="거래처 유지"
          value={bulkDraft.merchant}
          onChange={(e) => setBulkDraft((d) => ({ ...d, merchant: e.target.value }))}
        />
        <Select className="text-caption" value={bulkDraft.category_major_user} onChange={(e) => setBulkDraft((d) => ({ ...d, category_major_user: e.target.value }))} aria-label="일괄 대분류"><option value="">대분류 유지</option>{filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        <Select className="text-caption" value={bulkDraft.adjustability} onChange={(e) => setBulkDraft((d) => ({ ...d, adjustability: e.target.value as BulkDraft['adjustability'] }))} aria-label="일괄 조정 가능성">
          <option value="">조정 가능성 유지</option>
          <option value="protected">보호</option>
          <option value="adjustable">조정 가능</option>
          <option value="clear">거래 단위 값 지우기</option>
        </Select>
        <Button variant="primary" disabled={!hasWrite || bulkUpdate.isPending || bulkAdjustability.isPending} onClick={() => void applyBulk()}>일괄 적용</Button>
        <Button variant="danger" disabled={!hasWrite} onClick={() => void bulkDeleteFlow()}>삭제</Button>
        <Button variant="secondary" disabled={!hasWrite} onClick={() => void bulkRestoreFlow()}>복원</Button>
      </BulkBar>

      {openId !== null ? <TransactionEditor transactionId={openId} onClose={closeEditor} allowDelete /> : null}
    </>
  )
}

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  // 예전 "그룹 보기"(거래마다 반복 여부 입력)는 정기 지급 묶음으로 바뀌었다(2.2).
  if (searchParams.get('view') === 'groups') return <Navigate to="/data/nature?tab=recurring" replace />

  return (
    <>
      <PageHeader
        title="작업대 · 거래"
        meta={<Link to="/data/inbox" className="text-caption text-transfer hover:underline">분류 큐로</Link>}
      />
      <div className="flex flex-col gap-4">
        <RowsView />
      </div>
    </>
  )
}
