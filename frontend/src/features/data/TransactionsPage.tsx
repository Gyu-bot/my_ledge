import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { BulkBar } from '../../ds/BulkBar'
import { DetailPanel } from '../../ds/DetailPanel'
import { Field, Select, TextInput, Toggle } from '../../ds/Field'
import { Pagination } from '../../ds/Pagination'
import { Provenance } from '../../ds/Provenance'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { EM_DASH, formatSignedWon, formatWon } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import {
  useBulkDeletePreview,
  useBulkDeleteTransactions,
  useBulkRestorePreview,
  useBulkRestoreTransactions,
  useBulkUpdateTransactions,
  useDeleteTransaction,
  useRestoreTransaction,
  useTransactionFilterOptions,
  useTransactionList,
  useUpdateTransaction,
} from '../../hooks/useTransactions'
import { useRecurringPayments } from '../../hooks/useAnalytics'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { RecurringPaymentKind, SpendNecessity, TransactionResponse } from '../../types/transaction'

const PAGE_SIZE = 40

interface FilterState {
  search: string
  type: string
  source: string
  category_major: string
  payment_method: string
  cost_kind: string
  spend_necessity: string
  recurring_payment_kind: string
  start_date: string
  end_date: string
  include_deleted: boolean
  is_edited: boolean
}

const DEFAULT_FILTER: FilterState = {
  search: '', type: '', source: '', category_major: '', payment_method: '',
  cost_kind: '', spend_necessity: '', recurring_payment_kind: '',
  start_date: '', end_date: '', include_deleted: false, is_edited: false,
}

const RECURRING_LABEL: Record<RecurringPaymentKind, string> = {
  installment: '할부', monthly_recurring: '매월 반복', not_recurring: '반복 아님',
}

interface EditDraft {
  merchant: string
  category_major_user: string
  category_minor_user: string
  cost_kind: '' | 'fixed' | 'variable'
  spend_necessity: '' | SpendNecessity
  recurring_payment_kind: '' | RecurringPaymentKind
  memo: string
}

function draftFrom(tx: TransactionResponse): EditDraft {
  return {
    merchant: tx.merchant,
    category_major_user: tx.category_major_user ?? tx.effective_category_major,
    category_minor_user: tx.category_minor_user ?? tx.effective_category_minor ?? '',
    cost_kind: tx.cost_kind ?? '',
    spend_necessity: tx.spend_necessity ?? '',
    recurring_payment_kind: tx.recurring_payment_kind ?? '',
    memo: tx.memo ?? '',
  }
}

function RowsView() {
  const hasWrite = useWriteAccess()
  const filterOptions = useTransactionFilterOptions()
  const [filterDraft, setFilterDraft] = useState<FilterState>(DEFAULT_FILTER)
  const [applied, setApplied] = useState<FilterState>(DEFAULT_FILTER)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detailId, setDetailId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [bulkDraft, setBulkDraft] = useState<{ cost_kind: string; spend_necessity: string; category_major_user: string }>({ cost_kind: '', spend_necessity: '', category_major_user: '' })

  const params = {
    page, per_page: PAGE_SIZE,
    search: applied.search || undefined,
    type: applied.type || undefined,
    source: applied.source || undefined,
    category_major: applied.category_major || undefined,
    payment_method: applied.payment_method || undefined,
    cost_kind: (applied.cost_kind as 'fixed' | 'variable') || undefined,
    spend_necessity: (applied.spend_necessity as SpendNecessity) || undefined,
    recurring_payment_kind: (applied.recurring_payment_kind as RecurringPaymentKind) || undefined,
    start_date: applied.start_date || undefined,
    end_date: applied.end_date || undefined,
    include_deleted: applied.include_deleted || undefined,
    is_edited: applied.is_edited || undefined,
  }
  const list = useTransactionList(params)
  const update = useUpdateTransaction()
  const del = useDeleteTransaction()
  const restore = useRestoreTransaction()
  const bulkUpdate = useBulkUpdateTransactions()
  const bulkDeletePreview = useBulkDeletePreview()
  const bulkDelete = useBulkDeleteTransactions()
  const bulkRestorePreview = useBulkRestorePreview()
  const bulkRestore = useBulkRestoreTransactions()

  const rows = list.data?.items ?? []
  const detailTx = rows.find((tx) => tx.id === detailId) ?? null
  const minorOptions = useMemo(() => {
    const byMajor = filterOptions.data?.category_minor_options_by_major ?? {}
    return (major: string) => byMajor[major] ?? filterOptions.data?.category_minor_options ?? []
  }, [filterOptions.data])

  function openDetail(tx: TransactionResponse) {
    setDetailId(tx.id)
    setEditDraft(draftFrom(tx))
  }

  function applyFilter() { setApplied(filterDraft); setPage(1); setSelected(new Set()) }
  function resetFilter() { setFilterDraft(DEFAULT_FILTER); setApplied(DEFAULT_FILTER); setPage(1); setSelected(new Set()) }

  function toggleRow(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectableIds = rows.filter((tx) => !tx.is_deleted || applied.include_deleted).map((tx) => tx.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  async function saveEdit() {
    if (!detailTx || !editDraft) return
    try {
      await update.mutateAsync({
        id: detailTx.id,
        data: {
          merchant: editDraft.merchant || null,
          category_major_user: editDraft.category_major_user || null,
          category_minor_user: editDraft.category_minor_user || null,
          cost_kind: editDraft.cost_kind || null,
          spend_necessity: editDraft.spend_necessity || null,
          recurring_payment_kind: editDraft.recurring_payment_kind || null,
          memo: editDraft.memo || null,
        },
      })
      toast.success('수정 완료')
      setDetailId(null)
    } catch (error) {
      toast.error('수정 실패', { description: String(error) })
    }
  }

  async function applyBulk() {
    const ids = [...selected]
    if (ids.length === 0) return
    const data: Parameters<typeof bulkUpdate.mutateAsync>[0] = { ids }
    if (bulkDraft.cost_kind) data.cost_kind = bulkDraft.cost_kind as 'fixed' | 'variable'
    if (bulkDraft.spend_necessity) data.spend_necessity = bulkDraft.spend_necessity as SpendNecessity
    if (bulkDraft.category_major_user) data.category_major_user = bulkDraft.category_major_user
    try {
      const result = await bulkUpdate.mutateAsync(data)
      toast.success(`${result.updated}건 일괄 수정 완료`)
      setSelected(new Set())
      setBulkDraft({ cost_kind: '', spend_necessity: '', category_major_user: '' })
    } catch (error) {
      toast.error('일괄 수정 실패', { description: String(error) })
    }
  }

  async function bulkDeleteFlow() {
    const ids = [...selected]
    if (ids.length === 0) return
    try {
      const preview = await bulkDeletePreview.mutateAsync({ ids })
      const ok = window.confirm(
        `${preview.count}건 삭제 · ${preview.period_start ?? '—'}~${preview.period_end ?? '—'} · ₩${formatWon(preview.expense_total)}\n대표: ${preview.representative_merchants.join(', ') || '없음'}\n\n삭제할까요?`,
      )
      if (!ok) return
      const result = await bulkDelete.mutateAsync({ ids })
      setSelected(new Set())
      toast.success(`${result.updated}건 삭제 완료`, {
        action: { label: '방금 삭제 복원', onClick: () => void undoDelete(ids) },
      })
    } catch (error) {
      toast.error('일괄 삭제 실패', { description: String(error) })
    }
  }

  async function undoDelete(ids: number[]) {
    try {
      const result = await bulkRestore.mutateAsync({ ids })
      toast.success(`${result.updated}건 복원 완료`)
    } catch (error) {
      toast.error('복원 실패', { description: String(error) })
    }
  }

  async function bulkRestoreFlow() {
    const ids = [...selected]
    if (ids.length === 0) return
    try {
      await bulkRestorePreview.mutateAsync({ ids })
      const result = await bulkRestore.mutateAsync({ ids })
      setSelected(new Set())
      toast.success(`${result.updated}건 복원 완료`)
    } catch (error) {
      toast.error('복원 실패', { description: String(error) })
    }
  }

  const inputCls = 'rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-caption text-text-secondary'

  return (
    <>
      <Card title="필터" meta="조회 범위를 고정한 뒤 수정 대상을 좁힙니다" action={<div className="flex gap-2"><Button variant="primary" onClick={applyFilter}>적용</Button><Button variant="ghost" onClick={resetFilter}>초기화</Button></div>}>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputCls} w-40`} placeholder="🔍 거래처·설명·메모" value={filterDraft.search} onChange={(e) => setFilterDraft((f) => ({ ...f, search: e.target.value }))} />
          <Select className={inputCls} value={filterDraft.type} onChange={(e) => setFilterDraft((f) => ({ ...f, type: e.target.value }))} aria-label="거래 유형"><option value="">유형 전체</option><option>지출</option><option>수입</option><option>이체</option></Select>
          <Select className={inputCls} value={filterDraft.source} onChange={(e) => setFilterDraft((f) => ({ ...f, source: e.target.value }))} aria-label="입력 출처"><option value="">출처 전체</option><option value="import">import</option><option value="manual">manual</option></Select>
          <Select className={inputCls} value={filterDraft.category_major} onChange={(e) => setFilterDraft((f) => ({ ...f, category_major: e.target.value }))} aria-label="대분류"><option value="">대분류 전체</option>{filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          <Select className={inputCls} value={filterDraft.payment_method} onChange={(e) => setFilterDraft((f) => ({ ...f, payment_method: e.target.value }))} aria-label="결제수단"><option value="">결제수단 전체</option>{filterOptions.data?.payment_method_options.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
          <Select className={inputCls} value={filterDraft.cost_kind} onChange={(e) => setFilterDraft((f) => ({ ...f, cost_kind: e.target.value }))} aria-label="고정/변동"><option value="">고정/변동 전체</option><option value="fixed">고정비</option><option value="variable">변동비</option></Select>
          <Select className={inputCls} value={filterDraft.spend_necessity} onChange={(e) => setFilterDraft((f) => ({ ...f, spend_necessity: e.target.value }))} aria-label="필수/재량"><option value="">필수/재량 전체</option><option value="essential">필수</option><option value="discretionary">재량</option></Select>
          <Select className={inputCls} value={filterDraft.recurring_payment_kind} onChange={(e) => setFilterDraft((f) => ({ ...f, recurring_payment_kind: e.target.value }))} aria-label="반복분류"><option value="">반복 전체</option><option value="installment">할부</option><option value="monthly_recurring">매월 반복</option><option value="not_recurring">반복 아님</option></Select>
          <input type="date" className={inputCls} value={filterDraft.start_date} onChange={(e) => setFilterDraft((f) => ({ ...f, start_date: e.target.value }))} aria-label="시작일" />
          <input type="date" className={inputCls} value={filterDraft.end_date} onChange={(e) => setFilterDraft((f) => ({ ...f, end_date: e.target.value }))} aria-label="종료일" />
          <Toggle label="삭제 포함" checked={filterDraft.include_deleted} onChange={(v) => setFilterDraft((f) => ({ ...f, include_deleted: v }))} />
          <Toggle label="수정만" checked={filterDraft.is_edited} onChange={(v) => setFilterDraft((f) => ({ ...f, is_edited: v }))} />
        </div>
      </Card>

      <Card title="거래 목록" meta={`${list.data?.items.length ?? 0} / ${list.data?.total ?? 0}건 · 행을 클릭하면 편집 패널이 열립니다`} bodyClassName="p-0">
        {list.isLoading ? <div className="p-4"><ListSkeleton rows={8} /></div> :
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
                  {['날짜', '거래처', '카테고리', '성격', '반복', '상태', '금액'].map((h) => <th key={h} className="px-3 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => openDetail(tx)}
                    className={`cursor-pointer transition-colors duration-fast hover:bg-bg-inset ${tx.is_deleted ? 'opacity-40 line-through' : selected.has(tx.id) ? 'bg-bg-selected' : ''}`}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      {(!tx.is_deleted || applied.include_deleted) && <input type="checkbox" aria-label={`${tx.merchant} 선택`} checked={selected.has(tx.id)} onChange={() => toggleRow(tx.id)} className="h-3 w-3 accent-[var(--ds-accent-fg)]" />}
                    </td>
                    <td className="tnum px-3 py-2 text-text-faint">{tx.date.slice(5)}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-text-primary">{tx.merchant}</td>
                    <td className="px-3 py-2 text-text-muted">{tx.effective_category_major}{tx.effective_category_minor ? ` / ${tx.effective_category_minor}` : ''}</td>
                    <td className="px-3 py-2 text-caption text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        {tx.cost_kind === 'fixed' ? '고정' : tx.cost_kind === 'variable' ? '변동' : EM_DASH}
                        {tx.spend_necessity ? ` · ${tx.spend_necessity === 'essential' ? '필수' : '재량'}` : ''}
                        {tx.cost_classification_source === 'auto' ? <Provenance title="자동 분류" note="규칙으로 자동 분류된 값입니다. 수동 수정은 덮어쓰지 않습니다." trigger={<span className="h-1.5 w-1.5 rounded-full bg-transfer" />} triggerLabel="자동 분류 출처" /> : null}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-caption text-text-muted">{tx.recurring_payment_kind ? RECURRING_LABEL[tx.recurring_payment_kind] : EM_DASH}</td>
                    <td className="px-3 py-2"><Badge variant={tx.is_deleted ? 'expense' : tx.is_edited ? 'accent' : 'neutral'}>{tx.is_deleted ? '삭제됨' : tx.is_edited ? '수정됨' : '원본'}</Badge></td>
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
        onClear={() => { setSelected(new Set()); setBulkDraft({ cost_kind: '', spend_necessity: '', category_major_user: '' }) }}
      >
        <Select className="text-caption" value={bulkDraft.category_major_user} onChange={(e) => setBulkDraft((d) => ({ ...d, category_major_user: e.target.value }))} aria-label="일괄 대분류"><option value="">대분류 유지</option>{filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        <Select className="text-caption" value={bulkDraft.cost_kind} onChange={(e) => setBulkDraft((d) => ({ ...d, cost_kind: e.target.value }))} aria-label="일괄 고정/변동"><option value="">고정/변동 유지</option><option value="fixed">고정비</option><option value="variable">변동비</option></Select>
        <Select className="text-caption" value={bulkDraft.spend_necessity} onChange={(e) => setBulkDraft((d) => ({ ...d, spend_necessity: e.target.value }))} aria-label="일괄 필수/재량"><option value="">필수/재량 유지</option><option value="essential">필수</option><option value="discretionary">재량</option></Select>
        <Button variant="primary" disabled={!hasWrite || bulkUpdate.isPending} onClick={() => void applyBulk()}>일괄 적용</Button>
        <Button variant="danger" disabled={!hasWrite} onClick={() => void bulkDeleteFlow()}>삭제</Button>
        <Button variant="secondary" disabled={!hasWrite} onClick={() => void bulkRestoreFlow()}>복원</Button>
      </BulkBar>

      <DetailPanel
        open={detailTx != null && editDraft != null}
        onClose={() => setDetailId(null)}
        title={detailTx?.merchant ?? ''}
        subtitle={detailTx ? <span className="tnum">{detailTx.date} · {formatSignedWon(detailTx.amount)}</span> : undefined}
        footer={
          detailTx && (
            <div className="flex justify-between gap-2">
              {detailTx.is_deleted ? (
                <Button variant="secondary" disabled={!hasWrite} onClick={async () => { try { await restore.mutateAsync(detailTx.id); toast.success('복원 완료'); setDetailId(null) } catch (e) { toast.error('복원 실패', { description: String(e) }) } }}>복원</Button>
              ) : (
                <Button variant="danger" disabled={!hasWrite} onClick={async () => { try { await del.mutateAsync(detailTx.id); toast.success('삭제 완료', { action: { label: '복원', onClick: () => void restore.mutateAsync(detailTx.id) } }); setDetailId(null) } catch (e) { toast.error('삭제 실패', { description: String(e) }) } }}>삭제</Button>
              )}
              <Button variant="primary" disabled={!hasWrite || update.isPending} onClick={() => void saveEdit()}>저장</Button>
            </div>
          )
        }
      >
        {detailTx && editDraft && (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-border-subtle bg-bg-inset px-3 py-2 text-caption text-text-muted">
              <div>원본 설명: <span className="text-text-secondary">{detailTx.description}</span></div>
              <div className="mt-1">출처: {detailTx.source === 'manual' ? '수동 추가' : 'import'}{detailTx.cost_classification_source === 'auto' ? ' → 자동 분류' : detailTx.is_edited ? ' → 수동 수정' : ''}</div>
            </div>
            <Field label="분석용 거래처"><TextInput value={editDraft.merchant} disabled={!hasWrite} onChange={(e) => setEditDraft((d) => d && { ...d, merchant: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="대분류"><Select value={editDraft.category_major_user} disabled={!hasWrite} onChange={(e) => setEditDraft((d) => d && { ...d, category_major_user: e.target.value, category_minor_user: '' })}><option value="">—</option>{filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
              <Field label="소분류"><Select value={editDraft.category_minor_user} disabled={!hasWrite} onChange={(e) => setEditDraft((d) => d && { ...d, category_minor_user: e.target.value })}><option value="">—</option>{minorOptions(editDraft.category_major_user).map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
              <Field label="고정/변동"><Select value={editDraft.cost_kind} disabled={!hasWrite} onChange={(e) => setEditDraft((d) => d && { ...d, cost_kind: e.target.value as EditDraft['cost_kind'] })}><option value="">—</option><option value="fixed">고정비</option><option value="variable">변동비</option></Select></Field>
              <Field label="필수/재량"><Select value={editDraft.spend_necessity} disabled={!hasWrite} onChange={(e) => setEditDraft((d) => d && { ...d, spend_necessity: e.target.value as EditDraft['spend_necessity'] })}><option value="">—</option><option value="essential">필수</option><option value="discretionary">재량</option></Select></Field>
            </div>
            <Field label="반복분류"><Select value={editDraft.recurring_payment_kind} disabled={!hasWrite} onChange={(e) => setEditDraft((d) => d && { ...d, recurring_payment_kind: e.target.value as EditDraft['recurring_payment_kind'] })}><option value="">—</option><option value="installment">할부</option><option value="monthly_recurring">매월 반복</option><option value="not_recurring">반복 아님</option></Select></Field>
            <Field label="메모"><TextInput value={editDraft.memo} disabled={!hasWrite} onChange={(e) => setEditDraft((d) => d && { ...d, memo: e.target.value })} /></Field>
          </div>
        )}
      </DetailPanel>
    </>
  )
}

function GroupsView() {
  const hasWrite = useWriteAccess()
  const [page, setPage] = useState(1)
  const recurring = useRecurringPayments(page, 20)
  const bulkUpdate = useBulkUpdateTransactions()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkKind, setBulkKind] = useState<'' | RecurringPaymentKind>('')
  const items = recurring.data?.items ?? []

  async function classify(merchant: string, ids: number[], value: string) {
    const kind = (value || null) as RecurringPaymentKind | null
    try {
      const result = await bulkUpdate.mutateAsync({ ids, recurring_payment_kind: kind })
      toast.success(`${merchant} 분류 저장`, { description: `${result.updated}건 반영` })
    } catch (error) {
      toast.error('분류 저장 실패', { description: String(error) })
    }
  }

  async function applyBulk() {
    if (bulkKind === '' || selected.size === 0) return
    const ids = items.filter((item) => selected.has(item.merchant)).flatMap((item) => item.transaction_ids)
    try {
      const result = await bulkUpdate.mutateAsync({ ids, recurring_payment_kind: bulkKind || null })
      toast.success(`${selected.size}개 그룹 분류 저장`, { description: `${result.updated}건 반영` })
      setSelected(new Set())
      setBulkKind('')
    } catch (error) {
      toast.error('분류 저장 실패', { description: String(error) })
    }
  }

  return (
    <>
      <Card title="반복 결제 후보" meta="거래처 그룹 단위로 같은 반복 성격을 저장합니다" bodyClassName="p-0">
        {recurring.isLoading ? <div className="p-4"><ListSkeleton rows={6} /></div> :
         items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-label">
              <thead className="bg-bg-inset">
                <tr>
                  <th className="px-3 py-2" />
                  {['거래처', '카테고리', '주기', '평균', '횟수', '분류 변경'].map((h) => <th key={h} className="px-3 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((item) => {
                  const isSelected = selected.has(item.merchant)
                  return (
                    <tr key={`${item.merchant}:${item.category}`} className={isSelected ? 'bg-bg-selected' : ''}>
                      <td className="px-3 py-2"><input type="checkbox" aria-label={`${item.merchant} 선택`} disabled={!hasWrite} checked={isSelected} onChange={() => setSelected((c) => { const n = new Set(c); if (n.has(item.merchant)) n.delete(item.merchant); else n.add(item.merchant); return n })} className="h-3 w-3 accent-[var(--ds-accent-fg)]" /></td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-text-primary">{item.merchant}</td>
                      <td className="px-3 py-2 text-text-muted">{item.category}</td>
                      <td className="px-3 py-2 text-caption text-text-muted">{item.interval_type}</td>
                      <td className="tnum px-3 py-2 text-right text-text-secondary">{formatWon(item.avg_amount)}</td>
                      <td className="tnum px-3 py-2 text-right text-text-muted">{item.occurrences}회</td>
                      <td className="px-3 py-2">
                        <Select
                          className="w-full"
                          aria-label={`${item.merchant} 반복결제 분류`}
                          disabled={!hasWrite || bulkUpdate.isPending}
                          value={item.recurring_payment_kind ?? ''}
                          onChange={(event) => void classify(item.merchant, item.transaction_ids, event.target.value)}
                        >
                          <option value="">미분류</option>
                          <option value="installment">할부</option>
                          <option value="monthly_recurring">매월 반복</option>
                          <option value="not_recurring">반복 아님</option>
                        </Select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={page} perPage={20} total={recurring.data?.total ?? 0} onPageChange={setPage} />
          </div>
        ) : <EmptyState className="py-10" message="반복 결제 후보가 없습니다" />}
      </Card>

      <BulkBar count={selected.size} onClear={() => { setSelected(new Set()); setBulkKind('') }}>
        <Select className="text-caption" aria-label="선택 그룹 분류" value={bulkKind} onChange={(e) => setBulkKind(e.target.value as typeof bulkKind)}>
          <option value="">— 분류 선택 —</option>
          <option value="installment">할부</option>
          <option value="monthly_recurring">매월 반복</option>
          <option value="not_recurring">반복 아님</option>
        </Select>
        <Button variant="primary" disabled={!hasWrite || bulkKind === '' || bulkUpdate.isPending} onClick={() => void applyBulk()}>선택 그룹 적용</Button>
      </BulkBar>
    </>
  )
}

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'groups' ? 'groups' : 'rows'

  return (
    <>
      <PageHeader
        title="데이터 · 거래"
        controls={
          <SegmentedControl
            ariaLabel="거래 보기"
            options={[{ value: 'rows', label: '행 보기' }, { value: 'groups', label: '그룹 보기' }] as const}
            value={view}
            onChange={(next) => setSearchParams((current) => { const params = new URLSearchParams(current); if (next === 'groups') params.set('view', 'groups'); else params.delete('view'); return params }, { replace: true })}
          />
        }
        meta={<Link to="/data/inbox" className="text-caption text-transfer hover:underline">인박스로</Link>}
      />
      <div className="flex flex-col gap-4">
        {view === 'rows' ? <RowsView /> : <GroupsView />}
      </div>
    </>
  )
}
