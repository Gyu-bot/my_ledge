import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { DetailPanel } from '../../ds/DetailPanel'
import { Field, Select, TextInput } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { formatSignedWon } from '../../ds/format'
import {
  useSetTransactionAdjustability,
  useSetTransferPurpose,
  useTransactionNature,
  useTransferPurposeDetail,
} from '../../hooks/useNature'
import {
  useDeleteTransaction,
  useRestoreTransaction,
  useTransactionDetail,
  useTransactionFilterOptions,
  useUpdateTransaction,
} from '../../hooks/useTransactions'
import { useOneOffEventActions } from '../../hooks/useOneOffEvents'
import { oneOffEventLink } from '../one-off/oneOffLabels'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { AdjustabilityValue, TransactionNature, TransferPurposeValue } from '../../types/nature'
import type { TransactionResponse, TransactionUpdateRequest } from '../../types/transaction'
import { loadErrorMessage, writeErrorMessage } from '../analysis/text'
import {
  ADJUSTABILITY_HELP,
  ADJUSTABILITY_SOURCE_TEXT,
  ADJUSTABILITY_TEXT,
  COMMITMENT_KIND_TEXT,
  TRANSFER_PURPOSE_TEXT,
  categoryText,
} from '../classification/labels'

type AdjustabilityChoice = 'inherit' | AdjustabilityValue
type PurposeChoice = 'inherit' | TransferPurposeValue

interface Draft {
  merchant: string
  category_major_user: string
  category_minor_user: string
  memo: string
  adjustability: AdjustabilityChoice
  purpose: PurposeChoice
}

const FORM_ID = 'transaction-editor-form'

function textDraft(tx: TransactionResponse) {
  return {
    merchant: tx.merchant,
    category_major_user: tx.category_major_user ?? tx.effective_category_major,
    category_minor_user: tx.category_minor_user ?? tx.effective_category_minor ?? '',
    memo: tx.memo ?? '',
  }
}

/** 거래 단위 값이 없을 때 적용되는 값 (약정 → 카테고리 기본값 → 미정) */
function inheritedAdjustability(nature: TransactionNature): string {
  const value = nature.levels.commitment ?? nature.levels.category_default
  if (!value) return '미정'
  const from = nature.levels.commitment ? '정기 지급 묶음' : '카테고리 기본값'
  return `${ADJUSTABILITY_TEXT[value]} (${from})`
}

function paymentFormText(nature: TransactionNature): string {
  if (nature.payment_form === 'committed' && nature.commitment_kind) {
    const name = nature.commitment?.label ?? nature.commitment?.merchant ?? null
    return `약정 · ${COMMITMENT_KIND_TEXT[nature.commitment_kind]}${name ? ` (${name})` : ''}`
  }
  if (nature.payment_form === 'ad_hoc') return '수시 지출'
  return '해당 없음'
}

interface EditorBodyProps {
  tx: TransactionResponse
  nature: TransactionNature | undefined
  natureLoading: boolean
  purpose: TransferPurposeValue | 'undecided' | null
  purposeIsOwn: boolean
  draft: Draft
  setDraft: (update: (draft: Draft) => Draft) => void
  hasWrite: boolean
}

function EditorBody({ tx, nature, natureLoading, purpose, purposeIsOwn, draft, setDraft, hasWrite }: EditorBodyProps) {
  const filterOptions = useTransactionFilterOptions()
  const majors = filterOptions.data?.category_options ?? []
  const minors = filterOptions.data?.category_minor_options_by_major?.[draft.category_major_user] ?? []
  const locked = nature?.levels.fixed != null
  const isExpense = tx.type === '지출'
  const isTransfer = tx.type === '이체'

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-border-subtle bg-bg-inset px-3 py-2 text-caption text-text-muted">
        <div>결제수단: <span className="text-text-secondary">{tx.payment_method || '기록 없음'}</span></div>
        <div>원본 설명: <span className="text-text-secondary">{tx.description}</span></div>
        <div>유형: <span className="text-text-secondary">{tx.type}</span> · 출처: {tx.source === 'manual' ? '직접 추가' : '가져오기'}{tx.is_edited ? ' → 고친 적 있음' : ''}</div>
        {tx.is_deleted ? <div className="mt-1 text-warn">삭제된 거래입니다. 분석에는 들어가지 않습니다.</div> : null}
      </div>

      <Field label="분석용 거래처">
        <TextInput autoFocus value={draft.merchant} disabled={!hasWrite} onChange={(event) => setDraft((d) => ({ ...d, merchant: event.target.value }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="대분류">
          <Select value={draft.category_major_user} disabled={!hasWrite} onChange={(event) => setDraft((d) => ({ ...d, category_major_user: event.target.value, category_minor_user: '' }))}>
            {!majors.includes(draft.category_major_user) && draft.category_major_user ? <option value={draft.category_major_user}>{draft.category_major_user}</option> : null}
            {majors.map((major) => <option key={major} value={major}>{major}</option>)}
          </Select>
        </Field>
        <Field label="소분류">
          <Select value={draft.category_minor_user} disabled={!hasWrite} onChange={(event) => setDraft((d) => ({ ...d, category_minor_user: event.target.value }))}>
            <option value="">없음</option>
            {!minors.includes(draft.category_minor_user) && draft.category_minor_user ? <option value={draft.category_minor_user}>{draft.category_minor_user}</option> : null}
            {minors.map((minor) => <option key={minor} value={minor}>{minor}</option>)}
          </Select>
        </Field>
      </div>

      {isExpense ? (
        <fieldset className="rounded-md border border-border px-3 py-2.5" disabled={!hasWrite || locked || !nature?.effective}>
          <legend className="px-1 text-micro text-text-muted">조정 가능성 — 지금 이 지출을 줄일 수 있는가</legend>
          {natureLoading ? <ListSkeleton rows={2} /> : nature ? (
            <div className="flex flex-col gap-1.5 text-caption text-text-secondary">
              <p className="text-micro text-text-muted">
                지급 형태: <span className="text-text-secondary">{paymentFormText(nature)}</span>
                {' · '}지금 값: <span className="font-semibold text-text-primary">{nature.adjustability ? ADJUSTABILITY_TEXT[nature.adjustability] : '—'}</span>
                {nature.adjustability_source ? ` (${ADJUSTABILITY_SOURCE_TEXT[nature.adjustability_source]})` : ''}
              </p>
              {locked ? (
                <p className="text-micro text-text-muted">대출·할부에 연결된 거래는 끝날 때까지 보호로 고정됩니다. 바꾸려면 연결을 먼저 풀어야 합니다.</p>
              ) : (
                <>
                  <label className="flex items-start gap-2">
                    <input type="radio" name="tx-adjustability" className="mt-0.5" checked={draft.adjustability === 'inherit'} onChange={() => setDraft((d) => ({ ...d, adjustability: 'inherit' }))} />
                    <span>이 거래에서 따로 정하지 않음 <span className="text-text-muted">— 적용되는 값: {inheritedAdjustability(nature)}</span></span>
                  </label>
                  {(['protected', 'adjustable'] as const).map((value) => (
                    <label key={value} className="flex items-start gap-2">
                      <input type="radio" name="tx-adjustability" className="mt-0.5" checked={draft.adjustability === value} onChange={() => setDraft((d) => ({ ...d, adjustability: value }))} />
                      <span>{ADJUSTABILITY_TEXT[value]} <span className="text-text-muted">— {ADJUSTABILITY_HELP[value]}</span></span>
                    </label>
                  ))}
                </>
              )}
            </div>
          ) : <p className="text-caption text-text-muted">조정 가능성을 읽지 못했습니다.</p>}
        </fieldset>
      ) : null}

      {isTransfer ? (
        <Field
          label="이체 목적"
          hint={purpose && !purposeIsOwn ? `지금 값: ${TRANSFER_PURPOSE_TEXT[purpose]} (규칙에서 정함)` : '수입·지출에는 들어가지 않고 잔여의 행방에서 따로 봅니다.'}
        >
          <Select value={draft.purpose} disabled={!hasWrite} onChange={(event) => setDraft((d) => ({ ...d, purpose: event.target.value as PurposeChoice }))}>
            <option value="inherit">이 거래에서 따로 정하지 않음</option>
            {(['investment', 'savings', 'internal_move'] as const).map((value) => <option key={value} value={value}>{TRANSFER_PURPOSE_TEXT[value]}</option>)}
          </Select>
        </Field>
      ) : null}

      <Field label="메모">
        <TextInput value={draft.memo} disabled={!hasWrite} onChange={(event) => setDraft((d) => ({ ...d, memo: event.target.value }))} />
      </Field>
      <p className="text-micro text-text-faint">Enter 또는 Ctrl+Enter로 저장, Esc로 닫기</p>
    </div>
  )
}

interface TransactionEditorProps {
  transactionId: number | null
  onClose: () => void
  /** 거래 화면처럼 삭제·복원 버튼을 함께 둘 때 */
  allowDelete?: boolean
}

/**
 * 거래 한 건 고치기 — 분석 화면에서도 그 자리에서 열린다(화면을 떠나지 않으므로
 * 필터와 위치가 그대로 남는다). 거래처·카테고리·메모와 조정 가능성(지출) 또는 이체 목적(이체).
 * 예전 고정/변동·필수/재량·반복 입력은 쓰지 않는다(2.2).
 */
export function TransactionEditor({ transactionId, onClose, allowDelete = false }: TransactionEditorProps) {
  const detail = useTransactionDetail(transactionId)
  const tx = detail.data && detail.data.id === transactionId ? detail.data : undefined
  return (
    <DetailPanel
      open={transactionId !== null}
      onClose={onClose}
      title={tx ? tx.merchant : '거래 고치기'}
      subtitle={tx ? <span className="tnum">{tx.date} {tx.time || ''} · {formatSignedWon(tx.amount)} · {categoryText(tx.effective_category_major, tx.effective_category_minor)}</span> : undefined}
    >
      {detail.isLoading || (!tx && !detail.error) ? (
        <ListSkeleton rows={5} />
      ) : detail.error || !tx ? (
        <ErrorState message={loadErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
      ) : (
        <LoadedEditor key={tx.id} tx={tx} onClose={onClose} allowDelete={allowDelete} />
      )}
    </DetailPanel>
  )
}

function LoadedEditor({ tx, onClose, allowDelete }: { tx: TransactionResponse; onClose: () => void; allowDelete: boolean }) {
  const hasWrite = useWriteAccess()
  const isExpense = tx.type === '지출'
  const isTransfer = tx.type === '이체'
  const nature = useTransactionNature(tx.id, isExpense)
  const purposeDetail = useTransferPurposeDetail(tx.id, isTransfer)
  const update = useUpdateTransaction()
  const setAdjustability = useSetTransactionAdjustability()
  const setPurpose = useSetTransferPurpose()
  const del = useDeleteTransaction()
  const restore = useRestoreTransaction()

  const original = useMemo(() => textDraft(tx), [tx])
  const ownAdjustability: AdjustabilityChoice = nature.data?.levels.transaction ?? 'inherit'
  const ownPurpose: PurposeChoice =
    purposeDetail.data?.purpose_source === 'transaction' && purposeDetail.data.purpose && purposeDetail.data.purpose !== 'undecided'
      ? purposeDetail.data.purpose
      : 'inherit'
  const [draft, setDraftState] = useState<Draft>({ ...original, adjustability: 'inherit', purpose: 'inherit' })
  const [touched, setTouched] = useState<{ adjustability: boolean; purpose: boolean }>({ adjustability: false, purpose: false })
  // 서버 값이 늦게 오면 사람이 건드리기 전까지는 서버 값을 보여 준다.
  const shown: Draft = {
    ...draft,
    adjustability: touched.adjustability ? draft.adjustability : ownAdjustability,
    purpose: touched.purpose ? draft.purpose : ownPurpose,
  }

  function setDraft(updater: (current: Draft) => Draft) {
    const next = updater(shown)
    setTouched((t) => ({
      adjustability: t.adjustability || next.adjustability !== shown.adjustability,
      purpose: t.purpose || next.purpose !== shown.purpose,
    }))
    setDraftState(next)
  }

  const textChanges: TransactionUpdateRequest = {}
  if (shown.merchant !== original.merchant) textChanges.merchant = shown.merchant || null
  if (shown.category_major_user !== original.category_major_user) textChanges.category_major_user = shown.category_major_user || null
  if (shown.category_minor_user !== original.category_minor_user) textChanges.category_minor_user = shown.category_minor_user || null
  if (shown.memo !== original.memo) textChanges.memo = shown.memo || null
  const adjustabilityChanged = isExpense && nature.data != null && nature.data.levels.fixed == null && shown.adjustability !== ownAdjustability
  const purposeChanged = isTransfer && purposeDetail.data != null && shown.purpose !== ownPurpose
  const dirty = Object.keys(textChanges).length > 0 || adjustabilityChanged || purposeChanged
  const pending = update.isPending || setAdjustability.isPending || setPurpose.isPending

  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (!hasWrite || !dirty || pending) return
    try {
      if (Object.keys(textChanges).length > 0) await update.mutateAsync({ id: tx.id, data: textChanges })
      if (adjustabilityChanged) {
        await setAdjustability.mutateAsync({ id: tx.id, value: shown.adjustability === 'inherit' ? null : shown.adjustability })
      }
      if (purposeChanged) await setPurpose.mutateAsync({ id: tx.id, value: shown.purpose === 'inherit' ? null : shown.purpose })
      toast.success('거래를 고쳤습니다', { description: tx.merchant })
      onClose()
    } catch (error) {
      toast.error('저장하지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void save()
    }
  }

  async function remove() {
    try {
      await del.mutateAsync(tx.id)
      toast.success('거래를 지웠습니다', { action: { label: '되살리기', onClick: () => void restore.mutateAsync(tx.id) } })
      onClose()
    } catch (error) {
      toast.error('지우지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  async function undelete() {
    try {
      await restore.mutateAsync(tx.id)
      toast.success('거래를 되살렸습니다')
      onClose()
    } catch (error) {
      toast.error('되살리지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  return (
    <form id={FORM_ID} aria-label="거래 고치기" onSubmit={(event) => void save(event)} onKeyDown={onKeyDown}>
      <EditorBody
        tx={tx}
        nature={nature.data}
        natureLoading={nature.isLoading}
        purpose={purposeDetail.data?.purpose ?? null}
        purposeIsOwn={purposeDetail.data?.purpose_source === 'transaction'}
        draft={shown}
        setDraft={setDraft}
        hasWrite={hasWrite}
      />
      {tx.one_off_event_id != null ? (
        <OneOffMembership id={tx.one_off_event_id} name={tx.one_off_event_name ?? '일회성 묶음'} transactionId={tx.id} hasWrite={hasWrite} />
      ) : null}
      {!hasWrite ? <p className="mt-3 text-caption text-warn"><Badge variant="warn">읽기 전용</Badge> API 키가 없어 고칠 수 없습니다.</p> : null}
      <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border-subtle pt-3">
        {allowDelete ? (
          tx.is_deleted ? (
            <Button variant="secondary" disabled={!hasWrite || restore.isPending} onClick={() => void undelete()}>되살리기</Button>
          ) : (
            <Button variant="danger" disabled={!hasWrite || del.isPending} onClick={() => void remove()}>지우기</Button>
          )
        ) : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>닫기</Button>
          <Button type="submit" variant="primary" disabled={!hasWrite || !dirty || pending}>{pending ? '저장 중…' : '저장'}</Button>
        </div>
      </div>
    </form>
  )
}

function OneOffMembership({ id, name, transactionId, hasWrite }: { id: number; name: string; transactionId: number; hasWrite: boolean }) {
  const { editMembers } = useOneOffEventActions()

  async function detach() {
    try {
      await editMembers.mutateAsync({ eventId: id, method: 'DELETE', transactionIds: [transactionId] })
      toast.success('묶음에서 거래를 뺐습니다')
    } catch (error) {
      toast.error('소속 해제 실패', { description: writeErrorMessage(error) })
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle p-2">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="accent">일회성</Badge>
        <Link to={oneOffEventLink(id)} className="break-words text-caption text-transfer hover:underline">{name}</Link>
      </div>
      <Button size="sm" variant="ghost" disabled={!hasWrite || editMembers.isPending} onClick={() => void detach()}>묶음에서 빼기</Button>
    </div>
  )
}
