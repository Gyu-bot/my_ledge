import { useEffect, useRef, useState } from 'react'
import { AlertBanner } from '../components/ui/AlertBanner'
import { Pagination } from '../components/ui/Pagination'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { NecessityBadge } from '../components/ui/NecessityBadge'
import {
  useTransactionList, useTransactionFilterOptions,
  useUpdateTransaction, useDeleteTransaction, useRestoreTransaction,
  useBulkUpdateTransactions,
} from '../hooks/useTransactions'
import { useUploadLogs, useUploadFile, useResetData } from '../hooks/useUpload'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { useChromeContext } from '../components/layout/chromeContext'
import type { TransactionResponse } from '../types/transaction'
import type { DataResetScope } from '../types/upload'
import { formatKRW } from '../lib/utils'

interface FilterState {
  search: string
  type: string
  source: string
  category_major: string
  payment_method: string
  start_date: string
  end_date: string
  include_deleted: boolean
  is_edited: boolean | undefined
}

const DEFAULT_FILTER: FilterState = {
  search: '', type: '', source: '', category_major: '',
  payment_method: '', start_date: '', end_date: '',
  include_deleted: false, is_edited: undefined,
}

interface EditDraft {
  merchant?: string
  category_major_user?: string
  category_minor_user?: string
  cost_kind?: 'fixed' | 'variable' | ''
  fixed_cost_necessity?: 'essential' | 'discretionary' | ''
  memo?: string
}

export function WorkbenchPage() {
  const PAGE_SIZE = 40
  const hasWrite = useWriteAccess()
  const { setMetaBadge } = useChromeContext()
  const selectPageCheckboxRef = useRef<HTMLInputElement | null>(null)

  // Filter
  const [filterDraft, setFilterDraft] = useState<FilterState>(DEFAULT_FILTER)
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [page, setPage] = useState(1)

  // Selection + Editing
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({})

  // Bulk edit draft
  const [bulkDraft, setBulkDraft] = useState<EditDraft>({})

  // Accordions
  const [uploadOpen, setUploadOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dangerOpen, setDangerOpen] = useState(false)

  // Upload form
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [snapshotDate, setSnapshotDate] = useState('')

  // Reset
  const [resetScope, setResetScope] = useState<DataResetScope>('transactions_only')
  const [resetConfirm, setResetConfirm] = useState('')

  // Alert
  const [alert, setAlert] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)

  // Queries
  const filterParams = {
    page, per_page: PAGE_SIZE,
    search: appliedFilter.search || undefined,
    type: appliedFilter.type || undefined,
    source: appliedFilter.source || undefined,
    category_major: appliedFilter.category_major || undefined,
    payment_method: appliedFilter.payment_method || undefined,
    start_date: appliedFilter.start_date || undefined,
    end_date: appliedFilter.end_date || undefined,
    include_deleted: appliedFilter.include_deleted || undefined,
    is_edited: appliedFilter.is_edited,
  }

  const txList = useTransactionList(filterParams)
  const filterOptions = useTransactionFilterOptions()
  const uploadLogs = useUploadLogs(10)

  const updateMutation = useUpdateTransaction()
  const deleteMutation = useDeleteTransaction()
  const restoreMutation = useRestoreTransaction()
  const bulkMutation = useBulkUpdateTransactions()
  const uploadMutation = useUploadFile()
  const resetMutation = useResetData()

  useEffect(() => {
    const total = txList.data?.total ?? 0
    const showing = txList.data?.items?.length ?? 0
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {showing} / {total}건
      </span>
    )
    return () => setMetaBadge(null)
  }, [setMetaBadge, txList.data])

  function applyFilter() { setAppliedFilter(filterDraft); setPage(1); setSelectedIds(new Set()) }
  function resetFilter() { setFilterDraft(DEFAULT_FILTER); setAppliedFilter(DEFAULT_FILTER); setPage(1); setSelectedIds(new Set()) }

  function toggleSelect(tx: TransactionResponse) {
    if (tx.is_deleted) return
    if (editingId !== null) return  // 편집 중이면 선택 불가
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(tx.id)) { next.delete(tx.id) } else { next.add(tx.id) }
      return next
    })
  }

  function startEdit(tx: TransactionResponse) {
    setSelectedIds(new Set())  // bulk 해제
    setEditingId(tx.id)
    setEditDraft({
      merchant: tx.merchant,
      category_major_user: tx.category_major_user ?? tx.effective_category_major,
      category_minor_user: tx.category_minor_user ?? tx.effective_category_minor ?? '',
      cost_kind: tx.cost_kind ?? '',
      fixed_cost_necessity: tx.fixed_cost_necessity ?? '',
      memo: tx.memo ?? '',
    })
  }

  async function saveEdit(id: number) {
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          merchant: editDraft.merchant || null,
          category_major_user: editDraft.category_major_user || null,
          category_minor_user: editDraft.category_minor_user || null,
          cost_kind: (editDraft.cost_kind as 'fixed' | 'variable') || null,
          fixed_cost_necessity: (editDraft.fixed_cost_necessity as 'essential' | 'discretionary') || null,
          memo: editDraft.memo || null,
        },
      })
      setEditingId(null)
      setAlert({ variant: 'success', title: '수정 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '수정 실패', description: String(e) })
    }
  }

  async function deleteRow(id: number) {
    try {
      await deleteMutation.mutateAsync(id)
      setAlert({ variant: 'success', title: '삭제 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '삭제 실패', description: String(e) })
    }
  }

  async function restoreRow(id: number) {
    try {
      await restoreMutation.mutateAsync(id)
      setAlert({ variant: 'success', title: '복원 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '복원 실패', description: String(e) })
    }
  }

  async function applyBulk() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const result = await bulkMutation.mutateAsync({
        ids,
        merchant: bulkDraft.merchant || null,
        category_major_user: bulkDraft.category_major_user || null,
        category_minor_user: bulkDraft.category_minor_user || null,
        cost_kind: (bulkDraft.cost_kind as 'fixed' | 'variable') || null,
        fixed_cost_necessity: (bulkDraft.fixed_cost_necessity as 'essential' | 'discretionary') || null,
        memo: bulkDraft.memo || null,
      })
      setSelectedIds(new Set())
      setBulkDraft({})
      setAlert({ variant: 'success', title: `${result.updated}건 일괄 수정 완료` })
    } catch (e) {
      setAlert({ variant: 'error', title: '일괄 수정 실패', description: String(e) })
    }
  }

  async function handleUpload() {
    if (!uploadFile || !snapshotDate) return
    try {
      const result = await uploadMutation.mutateAsync({ file: uploadFile, snapshotDate })
      setAlert({
        variant: result.status === 'failed' ? 'error' : 'success',
        title: result.status === 'failed' ? '업로드 실패' : '업로드 완료',
        description: result.status !== 'failed'
          ? `신규 ${result.transactions.new}건, 스킵 ${result.transactions.skipped}건 · ${uploadFile.name}`
          : result.error_message ?? undefined,
      })
      setUploadFile(null)
      setSnapshotDate('')
      setUploadOpen(false)
    } catch (e) {
      setAlert({ variant: 'error', title: '업로드 실패', description: String(e) })
    }
  }

  const RESET_LABEL: Record<DataResetScope, string> = {
    transactions_only: '거래만 초기화',
    transactions_and_snapshots: '거래 + 스냅샷 초기화',
  }
  const isReadOnly = !hasWrite
  const hasSelection = selectedIds.size > 0
  const visibleSelectableIds = txList.data?.items
    .filter((tx) => !tx.is_deleted)
    .map((tx) => tx.id) ?? []
  const allVisibleSelected = visibleSelectableIds.length > 0
    && visibleSelectableIds.every((id) => selectedIds.has(id))
  const someVisibleSelected = visibleSelectableIds.some((id) => selectedIds.has(id))

  useEffect(() => {
    if (selectPageCheckboxRef.current) {
      selectPageCheckboxRef.current.indeterminate = someVisibleSelected && !allVisibleSelected
    }
  }, [allVisibleSelected, someVisibleSelected])

  async function handleReset() {
    if (resetConfirm !== RESET_LABEL[resetScope]) return
    try {
      await resetMutation.mutateAsync(resetScope)
      setAlert({ variant: 'success', title: '초기화 완료' })
      setResetConfirm('')
      setDangerOpen(false)
    } catch (e) {
      setAlert({ variant: 'error', title: '초기화 실패', description: String(e) })
    }
  }

  const inputCls = 'text-caption text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5'
  const editInputCls = 'text-caption text-text-primary bg-border-subtle border border-border-strong rounded px-1.5 py-1 w-full'
  const fallbackMinorOptionsByMajor: Record<string, string[]> = {}
  const fallbackMinorOptions: string[] = []
  const seenFallbackMinorOptions = new Set<string>()

  for (const tx of txList.data?.items ?? []) {
    const major = tx.effective_category_major
    const minor = tx.effective_category_minor
    if (!major || !minor) continue

    if (!fallbackMinorOptionsByMajor[major]) fallbackMinorOptionsByMajor[major] = []
    if (!fallbackMinorOptionsByMajor[major].includes(minor)) {
      fallbackMinorOptionsByMajor[major].push(minor)
    }
    if (!seenFallbackMinorOptions.has(minor)) {
      seenFallbackMinorOptions.add(minor)
      fallbackMinorOptions.push(minor)
    }
  }

  const categoryMinorOptionsByMajor = Object.keys(filterOptions.data?.category_minor_options_by_major ?? {}).length > 0
    ? (filterOptions.data?.category_minor_options_by_major ?? {})
    : fallbackMinorOptionsByMajor
  const allCategoryMinorOptions = (filterOptions.data?.category_minor_options?.length ?? 0) > 0
    ? (filterOptions.data?.category_minor_options ?? [])
    : fallbackMinorOptions

  function getMinorOptions(major: string | undefined) {
    if (!major) return allCategoryMinorOptions
    return categoryMinorOptionsByMajor[major] ?? []
  }

  function toggleSelectVisible() {
    if (editingId !== null || visibleSelectableIds.length === 0) return

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleSelectableIds.forEach((id) => next.delete(id))
      } else {
        visibleSelectableIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Alert */}
      {alert && (
        <AlertBanner
          variant={alert.variant}
          title={alert.title}
          description={alert.description}
          onDismiss={() => setAlert(null)}
        />
      )}

      {/* Read-only warning */}
      {!hasWrite && (
        <AlertBanner
          variant="warn"
          title="읽기 전용 모드"
          description="API 키가 없어 업로드·수정·삭제·초기화가 비활성화됩니다."
        />
      )}

      {/* 필터 바 */}
      <div className="bg-surface-card border border-border-subtle rounded-card px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-caption text-text-secondary font-semibold">필터</div>
            <div className="text-micro text-text-ghost mt-0.5">조회 범위를 먼저 고정한 뒤 수정 대상만 좁혀서 작업합니다.</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={applyFilter} className="text-caption px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md">적용</button>
            <button onClick={resetFilter} className="text-caption px-3 py-1.5 border border-border-faint text-text-ghost rounded-md">초기화</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} w-36`}
            placeholder="🔍  거래처·설명 포함 검색"
            value={filterDraft.search}
            onChange={(e) => setFilterDraft((f) => ({ ...f, search: e.target.value }))}
          />
          <select className={inputCls} value={filterDraft.type} onChange={(e) => setFilterDraft((f) => ({ ...f, type: e.target.value }))}>
            <option value="">거래 유형 전체</option>
            <option>지출</option><option>수입</option><option>이체</option>
          </select>
          <select className={inputCls} value={filterDraft.source} onChange={(e) => setFilterDraft((f) => ({ ...f, source: e.target.value }))}>
            <option value="">입력 출처 전체</option>
            <option value="import">import</option><option value="manual">manual</option>
          </select>
          <select className={inputCls} value={filterDraft.category_major} onChange={(e) => setFilterDraft((f) => ({ ...f, category_major: e.target.value }))}>
            <option value="">대분류 전체</option>
            {filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={inputCls} value={filterDraft.payment_method} onChange={(e) => setFilterDraft((f) => ({ ...f, payment_method: e.target.value }))}>
            <option value="">결제수단 전체</option>
            {filterOptions.data?.payment_method_options.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="w-px h-5 bg-border-faint" />
          <input type="date" className={inputCls} value={filterDraft.start_date} onChange={(e) => setFilterDraft((f) => ({ ...f, start_date: e.target.value }))} />
          <input type="date" className={inputCls} value={filterDraft.end_date} onChange={(e) => setFilterDraft((f) => ({ ...f, end_date: e.target.value }))} />
          <div className="w-px h-5 bg-border-faint" />
          <label className="flex items-center gap-1.5 text-caption text-text-faint cursor-pointer">
            <input type="checkbox" checked={filterDraft.include_deleted} onChange={(e) => setFilterDraft((f) => ({ ...f, include_deleted: e.target.checked }))} className="w-3 h-3 accent-accent" />
            삭제 포함
          </label>
          <label className="flex items-center gap-1.5 text-caption cursor-pointer text-accent">
            <input type="checkbox" checked={!!filterDraft.is_edited} onChange={(e) => setFilterDraft((f) => ({ ...f, is_edited: e.target.checked ? true : undefined }))} className="w-3 h-3 accent-accent" />
            수정만
          </label>
        </div>
      </div>

      {/* Bulk edit panel */}
      {hasSelection && (
        <div className="px-4 py-3 bg-surface-section border border-border-subtle rounded-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-caption text-info-default font-semibold">{selectedIds.size}건 선택됨</div>
              <div className="text-micro text-text-ghost mt-0.5">
                선택한 행에 같은 값을 일괄 적용합니다.
                {isReadOnly ? ' 읽기 전용 모드에서는 적용되지 않습니다.' : ''}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={applyBulk} disabled={isReadOnly} className="text-caption px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md disabled:opacity-40">일괄 적용</button>
              <button onClick={() => { setSelectedIds(new Set()); setBulkDraft({}) }} className="text-caption px-3 py-1.5 border border-border-faint text-text-ghost rounded-md">선택 해제</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
          {(['거래처', '대분류', '소분류', '고정/변동', '필수여부', '메모'] as const).map((label) => {
            const key: keyof EditDraft = label === '거래처' ? 'merchant' : label === '대분류' ? 'category_major_user' : label === '소분류' ? 'category_minor_user' : label === '고정/변동' ? 'cost_kind' : label === '필수여부' ? 'fixed_cost_necessity' : 'memo'
            if (label === '대분류') return (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-caption text-text-faint">{label}</span>
                <select
                  className={`${inputCls} py-1`}
                  value={bulkDraft.category_major_user ?? ''}
                  onChange={(e) => setBulkDraft((b) => ({
                    ...b,
                    category_major_user: e.target.value,
                    category_minor_user: '',
                  }))}
                >
                  <option value="">— 선택 —</option>
                  {filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )
            if (label === '소분류') return (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-caption text-text-faint">{label}</span>
                <select
                  className={`${inputCls} py-1`}
                  value={bulkDraft.category_minor_user ?? ''}
                  onChange={(e) => setBulkDraft((b) => ({ ...b, category_minor_user: e.target.value }))}
                >
                  <option value="">— 선택 —</option>
                  {getMinorOptions(bulkDraft.category_major_user).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )
            if (label === '고정/변동') return (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-caption text-text-faint">{label}</span>
                <select className={`${inputCls} py-1`} value={bulkDraft.cost_kind ?? ''} onChange={(e) => setBulkDraft((b) => ({ ...b, cost_kind: e.target.value as '' | 'fixed' | 'variable' }))}>
                  <option value="">— 선택 —</option><option value="fixed">고정비</option><option value="variable">변동비</option>
                </select>
              </div>
            )
            if (label === '필수여부') return (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-caption text-text-faint">{label}</span>
                <select className={`${inputCls} py-1`} value={bulkDraft.fixed_cost_necessity ?? ''} onChange={(e) => setBulkDraft((b) => ({ ...b, fixed_cost_necessity: e.target.value as '' | 'essential' | 'discretionary' }))}>
                  <option value="">— 선택 —</option><option value="essential">필수</option><option value="discretionary">비필수</option>
                </select>
              </div>
            )
            return (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-caption text-text-faint">{label}</span>
                <input className={`${inputCls} w-20 py-1`} value={(bulkDraft[key] as string) ?? ''} onChange={(e) => setBulkDraft((b) => ({ ...b, [key]: e.target.value }))} />
              </div>
            )
          })}
          </div>
        </div>
      )}

      {/* 거래 테이블 */}
      <div className="bg-surface-card border border-border-subtle rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-faint">
          <div>
            <span className="text-label font-semibold text-text-secondary">거래 목록</span>
            <div className="text-micro text-text-ghost mt-0.5">
              수정 중에는 행 선택이 잠기고, 삭제된 행은 복원만 가능합니다.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isReadOnly ? (
              <span className="text-micro text-warn border border-warn-muted bg-warn-dim px-2 py-0.5 rounded-full">read-only</span>
            ) : null}
            <span className="text-micro text-text-muted bg-surface-bar border border-border-subtle px-2 py-0.5 rounded-full">
              {page} / {Math.ceil((txList.data?.total ?? 0) / PAGE_SIZE)} 페이지 · {txList.data?.total ?? 0}건
            </span>
          </div>
        </div>

        {txList.isLoading ? <LoadingState /> :
         txList.data && txList.data.items.length > 0 ? (
           <div className="overflow-x-auto">
             <table className="w-full border-collapse text-caption" style={{ tableLayout: 'fixed' }}>
               <colgroup>
                 <col style={{ width: 28 }} /><col style={{ width: 52 }} />
                 <col style={{ width: 128 }} /><col style={{ width: 100 }} />
                 <col style={{ width: 80 }} /><col style={{ width: 76 }} />
                 <col style={{ width: 56 }} />
                 <col style={{ width: 58 }} /><col style={{ width: 72 }} />
                 <col style={{ width: 60 }} /><col style={{ width: 80 }} />
                 <col style={{ width: 60 }} />
               </colgroup>
               <thead>
                 <tr>
                   <th className="text-micro text-text-ghost px-2 py-2 text-left font-medium">
                     <input
                       ref={selectPageCheckboxRef}
                       type="checkbox"
                       aria-label="현재 페이지 전체 선택"
                       checked={allVisibleSelected}
                       disabled={editingId !== null || visibleSelectableIds.length === 0}
                       onChange={toggleSelectVisible}
                       className="w-3 h-3 accent-accent disabled:opacity-40"
                     />
                   </th>
                   {['날짜', '설명', '거래처', '대분류', '소분류', '고정/변동', '필수여부', '메모', '상태', '금액', '동작'].map((h) => (
                     <th key={h} className="text-micro text-text-ghost px-2 py-2 text-left font-medium">{h}</th>
                   ))}
                 </tr>
               </thead>
               <tbody>
                 {txList.data.items.map((tx) => {
                   const isEditing = editingId === tx.id
                   const isSelected = selectedIds.has(tx.id)
                   const rowClass = tx.is_deleted
                     ? 'opacity-40 line-through'
                     : isSelected ? 'bg-surface-selected'
                     : isEditing ? 'bg-surface-edited'
                     : tx.is_edited ? 'bg-surface-edited'
                     : ''
                   return (
                    <tr key={tx.id} className={rowClass}>
                       <td className="px-2 py-2">
                         {!tx.is_deleted && !isEditing && (
                           <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(tx)} className="w-3 h-3 accent-accent" />
                         )}
                       </td>
                       <td className="px-2 py-2 text-text-ghost">{tx.date.slice(5)}</td>
                       {/* 설명: read-only, muted italic */}
                       <td className="px-2 py-2 text-micro text-text-ghost italic overflow-hidden text-ellipsis whitespace-nowrap">{tx.description}</td>
                       {/* 거래처: same size, editable */}
                       <td className="px-2 py-2">
                         {isEditing
                           ? <input className={editInputCls} value={editDraft.merchant ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, merchant: e.target.value }))} />
                           : <span className="text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap block">{tx.merchant}</span>
                         }
                       </td>
                       <td className="px-2 py-2">
                         {isEditing
                           ? <select className={editInputCls} value={editDraft.category_major_user ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, category_major_user: e.target.value, category_minor_user: '' }))}>
                               <option value="">—</option>
                               {filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}
                             </select>
                           : <span className="text-text-faint">{tx.effective_category_major}</span>
                         }
                       </td>
                       <td className="px-2 py-2">
                         {isEditing
                           ? <select className={editInputCls} value={editDraft.category_minor_user ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, category_minor_user: e.target.value }))}>
                               <option value="">—</option>
                               {getMinorOptions(editDraft.category_major_user).map((c) => <option key={c} value={c}>{c}</option>)}
                             </select>
                           : <span className="text-text-faint">{tx.effective_category_minor ?? '—'}</span>
                         }
                       </td>
                       <td className="px-2 py-2">
                         {isEditing
                           ? <select className={editInputCls} value={editDraft.cost_kind ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, cost_kind: e.target.value as '' | 'fixed' | 'variable' }))}>
                               <option value="">—</option><option value="fixed">고정비</option><option value="variable">변동비</option>
                             </select>
                           : <span className="text-micro text-text-ghost">{tx.cost_kind === 'fixed' ? '고정비' : tx.cost_kind === 'variable' ? '변동비' : '—'}</span>
                         }
                       </td>
                       <td className="px-2 py-2">
                         {isEditing
                           ? <select className={editInputCls} value={editDraft.fixed_cost_necessity ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, fixed_cost_necessity: e.target.value as '' | 'essential' | 'discretionary' }))}>
                               <option value="">—</option><option value="essential">필수</option><option value="discretionary">비필수</option>
                             </select>
                           : <NecessityBadge value={tx.fixed_cost_necessity} />
                         }
                       </td>
                       <td className="px-2 py-2">
                         {isEditing
                           ? <input className={editInputCls} value={editDraft.memo ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, memo: e.target.value }))} placeholder="메모" />
                           : <span className="text-text-ghost truncate block">{tx.memo ?? '—'}</span>
                         }
                       </td>
                       <td className="px-2 py-2">
                         <StatusBadge status={tx.is_deleted ? 'deleted' : tx.is_edited ? 'edited' : 'original'} />
                       </td>
                       <td className={`px-2 py-2 text-right font-semibold ${tx.amount < 0 ? 'text-danger' : 'text-accent'}`}>
                         {tx.amount < 0 ? '-' : '+'}₩{formatKRW(Math.abs(tx.amount))}
                       </td>
                       <td className="px-2 py-2 text-center">
                         {tx.is_deleted ? (
                           <button onClick={() => restoreRow(tx.id)} disabled={!hasWrite}
                             className="text-nano px-1.5 py-0.5 border border-border-strong text-text-ghost rounded disabled:opacity-40">복원</button>
                         ) : isEditing ? (
                           <div className="flex gap-0.5">
                             <button onClick={() => saveEdit(tx.id)} className="w-5 h-5 rounded border border-accent-muted text-accent text-caption flex items-center justify-center">✓</button>
                             <button onClick={() => setEditingId(null)} className="w-5 h-5 rounded border border-border-strong text-text-ghost text-caption flex items-center justify-center">✕</button>
                           </div>
                         ) : (
                           <div className="flex gap-0.5">
                             <button onClick={() => startEdit(tx)} disabled={!hasWrite || selectedIds.size > 0}
                               className="w-5 h-5 rounded border border-border-strong text-text-ghost text-caption flex items-center justify-center disabled:opacity-30">✎</button>
                             <button onClick={() => deleteRow(tx.id)} disabled={!hasWrite}
                               className="w-5 h-5 rounded border border-danger-muted text-danger-dim text-caption flex items-center justify-center disabled:opacity-30">🗑</button>
                           </div>
                         )}
                       </td>
                     </tr>
                   )
                 })}
               </tbody>
             </table>
             <Pagination page={page} perPage={PAGE_SIZE} total={txList.data.total} onPageChange={setPage} />
           </div>
         ) : <EmptyState message="조건에 맞는 거래가 없습니다" />}
      </div>

      {/* 업로드 아코디언 */}
      <div className="border border-border-subtle rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-surface-card cursor-pointer hover:bg-border-subtle"
          onClick={() => setUploadOpen((o) => !o)}>
          <div>
            <div className="text-label font-semibold text-text-secondary">업로드</div>
            <div className="text-caption text-text-ghost mt-0.5">BankSalad 엑셀 파일 업로드</div>
          </div>
          <span className="text-nano text-text-ghost">{uploadOpen ? '▲' : '▼'}</span>
        </div>
        {uploadOpen && (
          <div className="bg-surface-section border-t border-border-faint p-4 flex flex-col gap-3">
            <label className="flex flex-col items-center justify-center border border-dashed border-border-strong rounded-lg py-5 cursor-pointer hover:bg-border-subtle text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f) }}>
              <span className="text-label text-text-muted mb-1">{uploadFile ? uploadFile.name : '파일을 드래그하거나 클릭해서 선택'}</span>
              <span className="text-micro text-text-ghost">.xlsx · 최대 20MB</span>
              <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && setUploadFile(e.target.files[0])} />
            </label>
            <div className="flex items-end gap-3">
              <div>
                <div className="text-micro text-text-faint mb-1">스냅샷 기준일</div>
                <input type="date" className={`${inputCls}`} value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
              </div>
              <button
                onClick={handleUpload}
                disabled={!hasWrite || !uploadFile || !snapshotDate || uploadMutation.isPending}
                className="text-caption px-4 py-1.5 bg-accent-dim border border-accent text-accent rounded-md disabled:opacity-40"
              >
                {uploadMutation.isPending ? '업로드 중...' : '업로드 실행'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 업로드 이력 아코디언 */}
      <div className="border border-border-subtle rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-surface-card cursor-pointer hover:bg-border-subtle"
          onClick={() => setHistoryOpen((o) => !o)}>
          <div>
            <div className="text-label font-semibold text-text-secondary">최근 업로드 이력</div>
            <div className="text-caption text-text-ghost mt-0.5">최근 10건</div>
          </div>
          <span className="text-nano text-text-ghost">{historyOpen ? '▲' : '▼'}</span>
        </div>
        {historyOpen && (
          <div className="bg-surface-section border-t border-border-faint overflow-x-auto">
            {uploadLogs.isLoading ? <LoadingState /> :
             uploadLogs.data && uploadLogs.data.items.length > 0 ? (
               <table className="w-full border-collapse text-caption">
               <thead>
                 <tr>{['파일명', '상태', '신규', '스킵', '기준일', '업로드 시각'].map((h) => (
                    <th key={h} className="text-micro text-text-ghost px-4 py-2 text-left">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {uploadLogs.data.items.map((log) => (
                    <tr key={log.id}>
                       <td className="px-4 py-2 text-text-primary">{log.filename ?? '—'}</td>
                       <td className="px-4 py-2">
                         <span className={`text-nano px-1.5 py-0.5 rounded ${log.status === 'success' || log.status === 'partial' ? 'bg-accent-dim text-accent' : 'bg-danger-dim text-danger'}`}>
                           {log.status}
                         </span>
                       </td>
                       <td className="px-4 py-2 text-accent">+{log.tx_new ?? 0}</td>
                       <td className="px-4 py-2 text-text-faint">{log.tx_skipped ?? 0}</td>
                       <td className="px-4 py-2 text-text-muted">{log.snapshot_date ?? '—'}</td>
                       <td className="px-4 py-2 text-text-ghost text-right">{log.uploaded_at.slice(0, 16).replace('T', ' ')}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             ) : <EmptyState message="업로드 이력이 없습니다" />}
          </div>
        )}
      </div>

      {/* Danger Zone 아코디언 */}
      <div className="border border-danger-muted rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-surface-danger cursor-pointer"
          onClick={() => setDangerOpen((o) => !o)}>
          <div>
            <div className="text-label font-semibold text-danger">Danger Zone</div>
            <div className="text-caption text-danger-muted mt-0.5">데이터 초기화 — 되돌릴 수 없습니다</div>
          </div>
          <span className="text-nano text-danger-muted">{dangerOpen ? '▲' : '▼'}</span>
        </div>
        {dangerOpen && (
          <div className="bg-surface-danger-muted border-t border-danger-muted p-4 flex flex-col gap-3">
            <div className="text-caption text-text-faint">
              초기화 범위를 선택하세요. 업로드 이력은 삭제되지 않으며, reset 이후에도 최근 import history로 계속 남습니다.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['transactions_only', 'transactions_and_snapshots'] as DataResetScope[]).map((scope) => (
                <button
                  key={scope}
                  onClick={() => setResetScope(scope)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-caption ${resetScope === scope ? 'border-danger text-danger bg-surface-danger-strong' : 'border-border-strong text-text-ghost'}`}
                >
                  <div className="font-semibold mb-0.5">{RESET_LABEL[scope]}</div>
                  <div className="text-micro opacity-70">
                    {scope === 'transactions_only' ? '거래 내역만 삭제, 자산 스냅샷 유지' : '모든 데이터 삭제'}
                  </div>
                </button>
              ))}
            </div>
            <div className="text-micro text-text-faint">
              "{RESET_LABEL[resetScope]}" 를 입력하여 확인
            </div>
            <input
              className="w-full bg-surface-input border border-border-strong rounded-lg px-3 py-2 text-caption text-text-secondary"
              placeholder="확인 문구를 입력하세요"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
            />
            <button
              onClick={handleReset}
              disabled={!hasWrite || resetConfirm !== RESET_LABEL[resetScope] || resetMutation.isPending}
              className="w-full py-2 bg-danger-dim border border-danger-muted text-danger rounded-lg text-caption font-semibold disabled:opacity-40"
            >
              {resetMutation.isPending ? '초기화 중...' : '초기화 실행'}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
