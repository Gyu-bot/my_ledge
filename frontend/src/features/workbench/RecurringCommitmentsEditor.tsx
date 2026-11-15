import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { ConfirmDanger } from '../../ds/ConfirmDanger'
import { Field, Select, TextInput } from '../../ds/Field'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import {
  useCreateRecurringCommitment,
  useDeleteRecurringCommitment,
  useEndRecurringCommitment,
  useRecurringCommitments,
  useUpdateRecurringCommitment,
} from '../../hooks/useNature'
import { useTransactionFilterOptions } from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type {
  AdjustabilityValue,
  CommitmentAmountKind,
  CommitmentCycle,
  CommitmentScope,
  RecurringCommitment,
  RecurringCommitmentCreateRequest,
} from '../../types/nature'
import { formatDateKo } from '../analysis/periods'
import { loadErrorMessage, writeErrorMessage } from '../analysis/text'
import {
  ADJUSTABILITY_HELP,
  ADJUSTABILITY_TEXT,
  AMOUNT_KIND_TEXT,
  CYCLE_TEXT,
  ORIGIN_TEXT,
  SCOPE_TEXT,
  categoryText,
} from '../classification/labels'

interface FormState {
  label: string
  match_scope: CommitmentScope
  merchant: string
  category_major: string
  category_minor: string
  cycle: '' | CommitmentCycle
  total_count: string
  amount_kind: '' | CommitmentAmountKind
  adjustability: '' | AdjustabilityValue
  start_date: string
  end_date: string
  memo: string
}

const EMPTY_FORM: FormState = {
  label: '',
  match_scope: 'merchant',
  merchant: '',
  category_major: '',
  category_minor: '',
  cycle: '',
  total_count: '',
  amount_kind: '',
  adjustability: '',
  start_date: '',
  end_date: '',
  memo: '',
}

function formFrom(item: RecurringCommitment): FormState {
  return {
    label: item.label ?? '',
    match_scope: item.match_scope,
    merchant: item.merchant ?? '',
    category_major: item.category_major,
    category_minor: item.category_minor ?? '',
    cycle: item.cycle ?? '',
    total_count: item.total_count != null ? String(item.total_count) : '',
    amount_kind: item.amount_kind ?? '',
    adjustability: item.adjustability ?? '',
    start_date: item.start_date ?? '',
    end_date: item.end_date ?? '',
    memo: item.memo ?? '',
  }
}

function validate(form: FormState): string | null {
  if (!form.category_major.trim()) return '대분류를 고르세요.'
  if (form.match_scope === 'merchant' && !form.merchant.trim()) return '거래처 단위로 묶으려면 거래처 이름이 필요합니다.'
  if (form.cycle === 'n_times') {
    const count = Number(form.total_count)
    if (!Number.isInteger(count) || count < 1) return '정해진 횟수 약정은 전체 횟수(1 이상)가 필요합니다.'
  }
  if (form.start_date && form.end_date && form.end_date < form.start_date) return '종료일이 시작일보다 앞설 수 없습니다.'
  return null
}

function requestFrom(form: FormState): RecurringCommitmentCreateRequest {
  return {
    label: form.label.trim() || null,
    match_scope: form.match_scope,
    merchant: form.match_scope === 'merchant' ? form.merchant.trim() : null,
    category_major: form.category_major.trim(),
    category_minor: form.category_minor.trim() || null,
    cycle: form.cycle || null,
    total_count: form.cycle === 'n_times' ? Number(form.total_count) : null,
    amount_kind: form.amount_kind || null,
    adjustability: form.adjustability || null,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    memo: form.memo.trim() || null,
  }
}

function CommitmentForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: FormState
  submitLabel: string
  pending: boolean
  onSubmit: (form: FormState) => void
  onCancel: () => void
}) {
  const hasWrite = useWriteAccess()
  const options = useTransactionFilterOptions()
  const [form, setForm] = useState<FormState>(initial)
  const [error, setError] = useState<string | null>(null)
  const majors = options.data?.category_options ?? []
  const minors = options.data?.category_minor_options_by_major[form.category_major] ?? []

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const problem = validate(form)
    setError(problem)
    if (!problem) onSubmit(form)
  }

  return (
    <form onSubmit={submit} aria-label={submitLabel} className="flex flex-col gap-3 rounded-md border border-border bg-bg-inset p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="이름 (선택)">
          <TextInput value={form.label} disabled={!hasWrite} onChange={(event) => set('label', event.target.value)} placeholder="비우면 거래처·카테고리로 표시" />
        </Field>
        <Field label="묶는 기준">
          <Select value={form.match_scope} disabled={!hasWrite} onChange={(event) => set('match_scope', event.target.value as CommitmentScope)}>
            <option value="merchant">{SCOPE_TEXT.merchant} — 이 거래처의 이 카테고리 지출</option>
            <option value="category">{SCOPE_TEXT.category} — 이 카테고리의 모든 지출</option>
          </Select>
        </Field>
        {form.match_scope === 'merchant' ? (
          <Field label="거래처 (분석용 거래처 이름 그대로)">
            <TextInput value={form.merchant} disabled={!hasWrite} onChange={(event) => set('merchant', event.target.value)} />
          </Field>
        ) : null}
        <Field label="대분류">
          <Select value={form.category_major} disabled={!hasWrite} onChange={(event) => setForm((current) => ({ ...current, category_major: event.target.value, category_minor: '' }))}>
            <option value="">고르세요</option>
            {!majors.includes(form.category_major) && form.category_major ? <option value={form.category_major}>{form.category_major}</option> : null}
            {majors.map((major) => <option key={major} value={major}>{major}</option>)}
          </Select>
        </Field>
        <Field label="소분류" hint="소분류까지 같은 거래만 묶입니다. '없음'은 소분류가 없는 거래입니다.">
          <Select value={form.category_minor} disabled={!hasWrite} onChange={(event) => set('category_minor', event.target.value)}>
            <option value="">없음</option>
            {!minors.includes(form.category_minor) && form.category_minor ? <option value={form.category_minor}>{form.category_minor}</option> : null}
            {minors.map((minor) => <option key={minor} value={minor}>{minor}</option>)}
          </Select>
        </Field>
        <Field label="주기">
          <Select value={form.cycle} disabled={!hasWrite} onChange={(event) => set('cycle', event.target.value as FormState['cycle'])}>
            <option value="">아직 정하지 않음</option>
            <option value="monthly">{CYCLE_TEXT.monthly}</option>
            <option value="yearly">{CYCLE_TEXT.yearly}</option>
            <option value="n_times">{CYCLE_TEXT.n_times}</option>
          </Select>
        </Field>
        {form.cycle === 'n_times' ? (
          <Field label="전체 횟수">
            <TextInput type="number" min={1} value={form.total_count} disabled={!hasWrite} onChange={(event) => set('total_count', event.target.value)} />
          </Field>
        ) : null}
        <Field label="금액">
          <Select value={form.amount_kind} disabled={!hasWrite} onChange={(event) => set('amount_kind', event.target.value as FormState['amount_kind'])}>
            <option value="">아직 정하지 않음</option>
            <option value="fixed">{AMOUNT_KIND_TEXT.fixed}</option>
            <option value="variable">{AMOUNT_KIND_TEXT.variable}</option>
          </Select>
        </Field>
        <Field label="조정 가능성">
          <Select value={form.adjustability} disabled={!hasWrite} onChange={(event) => set('adjustability', event.target.value as FormState['adjustability'])}>
            <option value="">아직 정하지 않음 (카테고리 기본값 적용)</option>
            <option value="protected">보호 — {ADJUSTABILITY_HELP.protected}</option>
            <option value="adjustable">조정 가능 — {ADJUSTABILITY_HELP.adjustable}</option>
          </Select>
        </Field>
        <Field label="시작일 (선택)">
          <TextInput type="date" value={form.start_date} disabled={!hasWrite} onChange={(event) => set('start_date', event.target.value)} />
        </Field>
        <Field label="종료일 (선택)">
          <TextInput type="date" value={form.end_date} disabled={!hasWrite} onChange={(event) => set('end_date', event.target.value)} />
        </Field>
        <Field label="메모 (선택)" className="sm:col-span-2">
          <TextInput value={form.memo} disabled={!hasWrite} onChange={(event) => set('memo', event.target.value)} />
        </Field>
      </div>
      {error ? <p role="alert" className="text-caption text-warn">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>취소</Button>
        <Button type="submit" variant="primary" disabled={!hasWrite || pending}>{pending ? '저장 중…' : submitLabel}</Button>
      </div>
    </form>
  )
}

function bundleName(item: RecurringCommitment): string {
  return item.label || [item.merchant, categoryText(item.category_major, item.category_minor)].filter(Boolean).join(' · ')
}

function isEnded(item: RecurringCommitment, today: string): boolean {
  return item.end_date != null && item.end_date < today
}

function CommitmentRow({ item, startEditing, editing, onDone }: { item: RecurringCommitment; startEditing: () => void; editing: boolean; onDone: () => void }) {
  const hasWrite = useWriteAccess()
  const update = useUpdateRecurringCommitment()
  const end = useEndRecurringCommitment()
  const remove = useDeleteRecurringCommitment()
  const [endDate, setEndDate] = useState('')
  const [ending, setEnding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save(form: FormState) {
    try {
      await update.mutateAsync({ id: item.id, data: requestFrom(form) })
      toast.success('정기 지급을 고쳤습니다', { description: bundleName(item) })
      onDone()
    } catch (error) {
      toast.error('저장하지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  async function finish() {
    if (!endDate) return
    try {
      await end.mutateAsync({ id: item.id, endDate })
      toast.success(`${formatDateKo(endDate)}까지로 끝냈습니다`, { description: '그 뒤의 거래는 이 묶음에 들어가지 않습니다.' })
      setEnding(false)
    } catch (error) {
      toast.error('끝내지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  async function destroy() {
    try {
      await remove.mutateAsync(item.id)
      toast.success('정기 지급을 지웠습니다', { description: '속했던 거래는 수시 지출로 돌아갑니다.' })
      setConfirmDelete(false)
    } catch (error) {
      toast.error('지우지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  return (
    <li id={`recurring-${item.id}`} className="rounded-md border border-border bg-bg-surface px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="break-all text-label font-semibold text-text-primary">{bundleName(item)}</h3>
            <Badge variant="neutral">{SCOPE_TEXT[item.match_scope]}</Badge>
            {item.origin !== 'user' ? <Badge variant="neutral">{ORIGIN_TEXT[item.origin]}</Badge> : null}
          </div>
          <p className="mt-0.5 text-caption text-text-muted">
            {categoryText(item.category_major, item.category_minor)}
            {' · '}주기 {item.cycle ? CYCLE_TEXT[item.cycle] : '미정'}
            {item.cycle === 'n_times' && item.total_count != null ? ` (${item.total_count}회)` : ''}
            {' · '}{item.amount_kind ? AMOUNT_KIND_TEXT[item.amount_kind] : '금액 미정'}
            {' · '}조정 가능성 {item.adjustability ? ADJUSTABILITY_TEXT[item.adjustability] : '미정'}
          </p>
          <p className="tnum text-caption text-text-muted">
            기간 {item.start_date ? formatDateKo(item.start_date) : '처음부터'} ~ {item.end_date ? formatDateKo(item.end_date) : '끝 없음'}
            {' · '}속한 거래 {item.member_transaction_count}건
            {item.first_member_date ? ` (${item.first_member_date} ~ ${item.last_member_date})` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" disabled={!hasWrite} onClick={startEditing}>고치기</Button>
          <Button size="sm" variant="secondary" disabled={!hasWrite} aria-expanded={ending} onClick={() => setEnding((value) => !value)}>끝내기</Button>
          <Button size="sm" variant="danger" disabled={!hasWrite} onClick={() => setConfirmDelete(true)}>지우기</Button>
        </div>
      </div>
      {ending ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-border-subtle bg-bg-inset px-3 py-2">
          <Field label="마지막 날">
            <TextInput type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </Field>
          <Button variant="primary" disabled={!hasWrite || !endDate || end.isPending} onClick={() => void finish()}>이 날까지로 끝내기</Button>
          <span className="pb-1.5 text-micro text-text-muted">지난 거래는 그대로 묶음에 남고, 이 날 뒤의 거래만 빠집니다.</span>
        </div>
      ) : null}
      {editing ? (
        <div className="mt-2">
          <CommitmentForm initial={formFrom(item)} submitLabel="고친 내용 저장" pending={update.isPending} onSubmit={(form) => void save(form)} onCancel={onDone} />
        </div>
      ) : null}
      <ConfirmDanger
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="정기 지급 지우기"
        description={`'${bundleName(item)}' 묶음을 지웁니다. 속했던 거래 ${item.member_transaction_count}건은 약정이 아닌 수시 지출로 돌아가고, 주기·금액·조정 가능성 기록이 사라집니다. 끝난 약정이라면 지우지 말고 "끝내기"를 쓰세요.`}
        confirmPhrase="지우기"
        confirmLabel="지우기"
        pending={remove.isPending}
        onConfirm={() => void destroy()}
      />
    </li>
  )
}

type ListFilter = 'active' | 'ended' | 'all'

/** 정기 지급 묶음 등록·고치기·끝내기 (2.2 지급 형태 "약정"). 후보를 자동으로 등록하지 않는다. */
export function RecurringCommitmentsEditor({ today }: { today: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const commitments = useRecurringCommitments()
  const create = useCreateRecurringCommitment()
  const [filter, setFilter] = useState<ListFilter>('active')
  const [search, setSearch] = useState('')
  const creating = searchParams.get('new') === '1'
  const editId = Number(searchParams.get('edit')) || null
  const prefill: FormState = {
    ...EMPTY_FORM,
    match_scope: searchParams.get('merchant') ? 'merchant' : searchParams.get('category_major') ? 'category' : 'merchant',
    merchant: searchParams.get('merchant') ?? '',
    category_major: searchParams.get('category_major') ?? '',
    category_minor: searchParams.get('category_minor') ?? '',
  }

  function setParams(updates: Record<string, string | null>) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
      return next
    }, { replace: true })
  }

  async function add(form: FormState) {
    try {
      const created = await create.mutateAsync(requestFrom(form))
      toast.success('정기 지급을 등록했습니다', { description: `속한 거래 ${created.member_transaction_count}건` })
      setParams({ new: null, merchant: null, category_major: null, category_minor: null })
    } catch (error) {
      toast.error('등록하지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  const items = commitments.data?.items ?? []
  const visible = items
    .filter((item) => filter === 'all' || (filter === 'ended' ? isEnded(item, today) : !isEnded(item, today)) || item.id === editId)
    .filter((item) => !search || bundleName(item).includes(search))
    .sort((a, b) => Number(isEnded(a, today)) - Number(isEnded(b, today)) || bundleName(a).localeCompare(bundleName(b), 'ko'))

  return (
    <Card
      title="정기 지급 묶음"
      meta="사람이 등록한 거래처나 카테고리 단위의 정기 지급입니다. 묶음에 속한 지출은 약정 지급으로 집계됩니다. 주기·금액·끝은 묶음의 속성이며 거래마다 묻지 않습니다."
      action={creating ? undefined : <Button variant="primary" onClick={() => setParams({ new: '1' })}>새 정기 지급 등록</Button>}
    >
      {creating ? (
        <div className="mb-3">
          <CommitmentForm
            key={`${prefill.merchant}-${prefill.category_major}-${prefill.category_minor}`}
            initial={prefill}
            submitLabel="정기 지급 등록"
            pending={create.isPending}
            onSubmit={(form) => void add(form)}
            onCancel={() => setParams({ new: null, merchant: null, category_major: null, category_minor: null })}
          />
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl
          ariaLabel="정기 지급 보기"
          options={[{ value: 'active', label: '진행 중' }, { value: 'ended', label: '끝난 것' }, { value: 'all', label: '모두' }] as const}
          value={filter}
          onChange={setFilter}
        />
        <label className="flex items-center gap-2 text-caption text-text-muted">
          찾기
          <TextInput value={search} onChange={(event) => setSearch(event.target.value)} className="w-40" />
        </label>
      </div>
      {commitments.isLoading ? <ListSkeleton rows={4} /> : commitments.error ? (
        <ErrorState message={loadErrorMessage(commitments.error)} onRetry={() => void commitments.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState message={items.length === 0 ? '등록된 정기 지급이 없습니다. 분류 큐의 "정기 지급으로 등록"이나 위 버튼으로 등록합니다.' : '조건에 맞는 정기 지급이 없습니다.'} />
      ) : (
        <ul aria-label="정기 지급 묶음" className="flex flex-col gap-2">
          {visible.map((item) => (
            <CommitmentRow
              key={item.id}
              item={item}
              editing={editId === item.id}
              startEditing={() => setParams({ edit: String(item.id) })}
              onDone={() => setParams({ edit: null })}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}
