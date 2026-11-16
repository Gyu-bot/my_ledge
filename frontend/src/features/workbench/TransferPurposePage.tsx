import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { ConfirmDanger } from '../../ds/ConfirmDanger'
import { Field, Select, TextInput } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { formatNetWon, formatSignedWon } from '../../ds/format'
import { useTransferPurposeList } from '../../hooks/useMetrics'
import {
  useCreateTransferPurposeRule,
  useDeleteTransferPurposeRule,
  useSetTransferPurpose,
  useTransferPurposeRules,
  useUpdateTransferPurposeRule,
} from '../../hooks/useNature'
import { useTransactionFilterOptions } from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import { PageHeader } from '../../shell/PageHeader'
import type { TransferPurposeItem } from '../../types/metrics'
import type { TransferPurposeRule, TransferPurposeRuleCreateRequest, TransferPurposeValue, TransferRuleScope } from '../../types/nature'
import { formatDateKo } from '../analysis/periods'
import { loadErrorMessage, sharePct, writeErrorMessage } from '../analysis/text'
import { TRANSFER_PURPOSE_TEXT, categoryText } from '../classification/labels'
import { netWorthPairLink, parsePairKey } from '../networth/pairs'

const PURPOSES: TransferPurposeValue[] = ['investment', 'savings', 'internal_move']

/** 목적의 뜻 — 고를 때 옆에 보인다 */
const TRANSFER_PURPOSE_HELP: Record<TransferPurposeValue, string> = {
  investment: '투자 스냅샷에 잡히는 보유분(증권 계좌 등)으로 보내거나 거기서 받은 돈',
  savings: '투자 스냅샷이 아닌 예금·적금으로 보내거나 거기서 받은 돈',
  internal_move: '그 밖에 내 계좌 사이에서 오간 돈. 장부 안의 두 계좌 사이라면 양쪽 거래를 모두 이것으로 정합니다',
}

const SOURCE_TEXT: Record<NonNullable<TransferPurposeItem['purpose_source']>, string> = {
  transaction: '이 거래에서 정함',
  rule_merchant: '거래처 규칙',
  rule_category: '카테고리 규칙',
  none: '정하지 않음',
}

const PAGE = 100
const LIST_LIMIT = 2000

function sameMerchant(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim() !== '' && (a ?? '').trim() === (b ?? '').trim()
}

function ruleTarget(rule: Pick<TransferPurposeRule, 'match_scope' | 'merchant' | 'category_major' | 'category_minor'>): string {
  if (rule.match_scope === 'merchant') return `거래처 '${rule.merchant ?? ''}'`
  return rule.category_minor ? `카테고리 '${categoryText(rule.category_major, rule.category_minor)}'` : `카테고리 '${rule.category_major ?? ''}' (소분류 전체)`
}

// ---------------------------------------------------------------------------
// 거래 한 건
// ---------------------------------------------------------------------------

interface MerchantRulePlan {
  merchant: string
  purpose: TransferPurposeValue
  listed: number
  ownMarked: number
  existing: TransferPurposeRule | undefined
}

function MerchantRuleConfirm({ plan, onDone }: { plan: MerchantRulePlan; onDone: () => void }) {
  const create = useCreateTransferPurposeRule()
  const update = useUpdateTransferPurposeRule()
  const pending = create.isPending || update.isPending
  const changing = plan.listed - plan.ownMarked

  async function apply() {
    try {
      if (plan.existing) await update.mutateAsync({ id: plan.existing.id, data: { purpose: plan.purpose } })
      else await create.mutateAsync({ match_scope: 'merchant', merchant: plan.merchant, purpose: plan.purpose })
      toast.success(`거래처 '${plan.merchant}' 규칙을 '${TRANSFER_PURPOSE_TEXT[plan.purpose]}'(으)로 정했습니다`)
      onDone()
    } catch (error) {
      toast.error('규칙을 저장하지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  return (
    <div role="group" aria-label="같은 거래처 규칙 확인" className="mt-2 rounded-md border border-accent-border bg-bg-raised p-3 text-caption">
      <p className="text-text-primary">
        {plan.existing
          ? `거래처 '${plan.merchant}'에는 이미 '${TRANSFER_PURPOSE_TEXT[plan.existing.purpose]}' 규칙이 있습니다. 그 규칙을 '${TRANSFER_PURPOSE_TEXT[plan.purpose]}'(으)로 바꿉니다.`
          : `거래처 '${plan.merchant}'의 이체를 '${TRANSFER_PURPOSE_TEXT[plan.purpose]}'(으)로 정하는 규칙을 만듭니다.`}
      </p>
      <ul className="mt-1 list-inside list-disc text-text-secondary">
        <li>
          {changing > 0
            ? `지금 목록에서 거래처 이름이 같은 이체 ${plan.listed}건 중 ${changing}건의 목적이 이 규칙을 따릅니다.`
            : `지금 목록에서 거래처 이름이 같은 이체 ${plan.listed}건은 모두 거래에서 직접 정한 값이 있어, 지금 목록에서 바뀌는 이체는 없습니다.`}
        </li>
        {plan.ownMarked > 0 && changing > 0 ? <li>{plan.ownMarked}건은 거래에서 직접 정한 값이 있어 그 값을 그대로 둡니다.</li> : null}
        <li>목록 밖의 같은 거래처 이체와 앞으로 가져올 이체에도 적용됩니다. 규칙은 이 화면 아래에서 고치거나 지울 수 있습니다.</li>
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" disabled={pending} onClick={() => void apply()}>
          {pending ? '저장 중…' : plan.existing ? '규칙 바꾸기' : '규칙 만들기'}
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={onDone}>취소</Button>
      </div>
    </div>
  )
}

function TransferRow({ item, listed, rules }: { item: TransferPurposeItem; listed: TransferPurposeItem[]; rules: TransferPurposeRule[] }) {
  const hasWrite = useWriteAccess()
  const setPurpose = useSetTransferPurpose()
  const [planOpen, setPlanOpen] = useState(false)
  const own = item.transaction_purpose
  const source = item.purpose_source ?? 'none'
  const purposeText = item.purpose ? TRANSFER_PURPOSE_TEXT[item.purpose] : TRANSFER_PURPOSE_TEXT.undecided
  const sameRows = listed.filter((row) => sameMerchant(row.merchant, item.merchant))
  const existing = rules.find((rule) => rule.match_scope === 'merchant' && sameMerchant(rule.merchant, item.merchant))

  async function change(next: '' | TransferPurposeValue) {
    if (next === (own ?? '')) return
    const previous = own
    try {
      await setPurpose.mutateAsync({ id: item.transaction_id, value: next === '' ? null : next })
      toast.success(next === '' ? '이 거래에서 정한 목적을 지웠습니다' : `목적을 '${TRANSFER_PURPOSE_TEXT[next]}'(으)로 정했습니다`, {
        action: {
          label: '되돌리기',
          onClick: () => void setPurpose.mutateAsync({ id: item.transaction_id, value: previous ?? null }),
        },
      })
    } catch (error) {
      toast.error('목적을 저장하지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <span className="tnum w-[5.5rem] shrink-0 pt-0.5 text-micro text-text-muted">{item.date}</span>
        <span className="min-w-0 flex-1 basis-40">
          <span className="block break-words text-label text-text-primary">{item.merchant || '거래처 없음'}</span>
          <span className="block break-words text-micro text-text-muted">
            {[categoryText(item.effective_category_major, item.effective_category_minor), item.description && item.description !== item.merchant ? item.description : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="tnum shrink-0 text-label font-semibold text-text-primary">
          {formatSignedWon(item.amount)}
          <span className="sr-only">{item.amount < 0 ? ' 보냄' : ' 받음'}</span>
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-0 sm:pl-[6.25rem]">
        <span className="text-caption text-text-secondary">지금 목적:</span>
        <Badge variant={item.purpose === 'undecided' || !item.purpose ? 'warn' : 'neutral'}>{purposeText}</Badge>
        <span className="text-micro text-text-muted">({SOURCE_TEXT[source]})</span>
        <Select
          aria-label={`${item.merchant} ${item.date} 이체의 목적`}
          value={own ?? ''}
          disabled={!hasWrite || setPurpose.isPending}
          onChange={(event) => void change(event.target.value as '' | TransferPurposeValue)}
          className="max-w-full"
        >
          <option value="">{own ? '이 거래에서 정한 값 지우기' : '이 거래에서 정하지 않음'}</option>
          {PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{TRANSFER_PURPOSE_TEXT[purpose]}</option>)}
        </Select>
        {own && item.merchant.trim() !== '' ? (
          <Button size="sm" variant="ghost" disabled={!hasWrite} aria-expanded={planOpen} onClick={() => setPlanOpen((open) => !open)}>
            같은 거래처 {sameRows.length}건에 규칙으로
          </Button>
        ) : null}
      </div>
      {planOpen && own ? (
        <MerchantRuleConfirm
          plan={{
            merchant: item.merchant,
            purpose: own,
            listed: sameRows.length,
            ownMarked: sameRows.filter((row) => row.purpose_source === 'transaction').length,
            existing,
          }}
          onDone={() => setPlanOpen(false)}
        />
      ) : null}
    </li>
  )
}

// ---------------------------------------------------------------------------
// 규칙
// ---------------------------------------------------------------------------

interface RuleDraft {
  match_scope: TransferRuleScope
  merchant: string
  category_major: string
  category_minor: string
  purpose: '' | TransferPurposeValue
  label: string
}

const EMPTY_DRAFT: RuleDraft = { match_scope: 'merchant', merchant: '', category_major: '', category_minor: '', purpose: '', label: '' }

function draftFrom(rule: TransferPurposeRule): RuleDraft {
  return {
    match_scope: rule.match_scope,
    merchant: rule.merchant ?? '',
    category_major: rule.category_major ?? '',
    category_minor: rule.category_minor ?? '',
    purpose: rule.purpose,
    label: rule.label ?? '',
  }
}

function RuleForm({
  initial,
  merchants,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: RuleDraft
  merchants: string[]
  submitLabel: string
  pending: boolean
  onSubmit: (request: TransferPurposeRuleCreateRequest) => Promise<boolean>
  onCancel?: () => void
}) {
  const hasWrite = useWriteAccess()
  const options = useTransactionFilterOptions()
  const [draft, setDraft] = useState<RuleDraft>(initial)
  const minors = draft.category_major ? options.data?.category_minor_options_by_major[draft.category_major] ?? [] : []
  const keyMissing = draft.match_scope === 'merchant' ? draft.merchant.trim() === '' : draft.category_major === ''
  const listId = `transfer-rule-merchants-${initial.merchant || 'new'}`

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (keyMissing || draft.purpose === '') return
    const request: TransferPurposeRuleCreateRequest =
      draft.match_scope === 'merchant'
        ? { match_scope: 'merchant', merchant: draft.merchant.trim(), purpose: draft.purpose, label: draft.label.trim() || null }
        : { match_scope: 'category', category_major: draft.category_major, category_minor: draft.category_minor || null, purpose: draft.purpose, label: draft.label.trim() || null }
    const ok = await onSubmit(request)
    if (ok && !onCancel) setDraft(EMPTY_DRAFT)
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[auto_1fr_auto_1fr_auto]">
      <Field label="범위">
        <Select value={draft.match_scope} disabled={!hasWrite} onChange={(event) => setDraft((d) => ({ ...d, match_scope: event.target.value as TransferRuleScope }))}>
          <option value="merchant">거래처</option>
          <option value="category">카테고리</option>
        </Select>
      </Field>
      {draft.match_scope === 'merchant' ? (
        <Field label="거래처 이름">
          <TextInput
            value={draft.merchant}
            disabled={!hasWrite}
            list={listId}
            placeholder="거래처 이름 그대로"
            onChange={(event) => setDraft((d) => ({ ...d, merchant: event.target.value }))}
          />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="대분류">
            <Select value={draft.category_major} disabled={!hasWrite} onChange={(event) => setDraft((d) => ({ ...d, category_major: event.target.value, category_minor: '' }))}>
              <option value="">대분류 고르기</option>
              {(options.data?.category_options ?? []).map((major) => <option key={major} value={major}>{major}</option>)}
            </Select>
          </Field>
          <Field label="소분류">
            <Select value={draft.category_minor} disabled={!hasWrite || draft.category_major === ''} onChange={(event) => setDraft((d) => ({ ...d, category_minor: event.target.value }))}>
              <option value="">소분류 전체</option>
              {minors.map((minor) => <option key={minor} value={minor}>{minor}</option>)}
            </Select>
          </Field>
        </div>
      )}
      <Field label="목적">
        <Select value={draft.purpose} disabled={!hasWrite} onChange={(event) => setDraft((d) => ({ ...d, purpose: event.target.value as '' | TransferPurposeValue }))}>
          <option value="">목적 고르기</option>
          {PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{TRANSFER_PURPOSE_TEXT[purpose]}</option>)}
        </Select>
      </Field>
      <Field label="이름 (선택)">
        <TextInput value={draft.label} disabled={!hasWrite} onChange={(event) => setDraft((d) => ({ ...d, label: event.target.value }))} />
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" variant="primary" disabled={!hasWrite || pending || keyMissing || draft.purpose === ''}>
          {pending ? '저장 중…' : submitLabel}
        </Button>
        {onCancel ? <Button variant="secondary" onClick={onCancel}>취소</Button> : null}
      </div>
      <datalist id={listId}>
        {merchants.map((merchant) => <option key={merchant} value={merchant} />)}
      </datalist>
    </form>
  )
}

function RuleRow({ rule, merchants }: { rule: TransferPurposeRule; merchants: string[] }) {
  const hasWrite = useWriteAccess()
  const update = useUpdateTransferPurposeRule()
  const remove = useDeleteTransferPurposeRule()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save(request: TransferPurposeRuleCreateRequest): Promise<boolean> {
    try {
      await update.mutateAsync({ id: rule.id, data: request })
      toast.success('규칙을 고쳤습니다')
      setEditing(false)
      return true
    } catch (error) {
      toast.error('규칙을 고치지 못했습니다', { description: writeErrorMessage(error) })
      return false
    }
  }

  async function destroy() {
    try {
      await remove.mutateAsync(rule.id)
      toast.success('규칙을 지웠습니다')
      setConfirmDelete(false)
    } catch (error) {
      toast.error('지우지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 basis-48">
          <span className="block break-words text-label text-text-primary">{ruleTarget(rule)}</span>
          <span className="block text-micro text-text-muted">
            {rule.label ? `${rule.label} · ` : ''}지금 이 규칙으로 목적이 정해진 이체 {rule.matched_transfer_count}건
          </span>
        </span>
        <Badge variant="neutral">{TRANSFER_PURPOSE_TEXT[rule.purpose]}</Badge>
        <Button size="sm" variant="secondary" disabled={!hasWrite} aria-expanded={editing} onClick={() => setEditing((open) => !open)}>고치기</Button>
        <Button size="sm" variant="danger" disabled={!hasWrite} onClick={() => setConfirmDelete(true)}>지우기</Button>
      </div>
      {editing ? (
        <div className="mt-2 rounded-md border border-border-subtle p-2.5">
          <RuleForm initial={draftFrom(rule)} merchants={merchants} submitLabel="고친 내용 저장" pending={update.isPending} onSubmit={save} onCancel={() => setEditing(false)} />
        </div>
      ) : null}
      <ConfirmDanger
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="이체 목적 규칙 지우기"
        description={`${ruleTarget(rule)} → '${TRANSFER_PURPOSE_TEXT[rule.purpose]}' 규칙을 지웁니다. 이 규칙으로 목적이 정해진 이체 ${rule.matched_transfer_count}건은 다른 규칙이 없으면 다시 '목적 미정'이 됩니다. 거래에서 직접 정한 목적은 그대로입니다.`}
        confirmPhrase="지우기"
        confirmLabel="지우기"
        pending={remove.isPending}
        onConfirm={() => void destroy()}
      />
    </li>
  )
}

function RulesCard({ merchants }: { merchants: string[] }) {
  const rules = useTransferPurposeRules()
  const create = useCreateTransferPurposeRule()

  async function add(request: TransferPurposeRuleCreateRequest): Promise<boolean> {
    try {
      await create.mutateAsync(request)
      toast.success('규칙을 만들었습니다')
      return true
    } catch (error) {
      const message = error instanceof Error && error.message.startsWith('409')
        ? '같은 거래처(또는 카테고리) 규칙이 이미 있습니다. 아래 목록에서 그 규칙을 고치세요.'
        : writeErrorMessage(error)
      toast.error('규칙을 만들지 못했습니다', { description: message })
      return false
    }
  }

  const items = rules.data?.items ?? []
  return (
    <Card
      title="이체 목적 규칙"
      meta="거래처나 카테고리 단위로 목적을 한 번에 정합니다. 사람이 만든 규칙만 적용되며, 앞으로 가져올 이체에도 적용됩니다. 적용 순서: 이 거래에서 정한 값 → 거래처 규칙 → 카테고리 규칙 → 목적 미정."
    >
      <div className="space-y-3">
        <div className="rounded-md border border-border-subtle p-2.5">
          <h3 className="mb-2 text-label font-semibold text-text-primary">새 규칙</h3>
          <RuleForm initial={EMPTY_DRAFT} merchants={merchants} submitLabel="규칙 만들기" pending={create.isPending} onSubmit={add} />
        </div>
        {rules.isLoading ? (
          <ListSkeleton rows={3} />
        ) : rules.error ? (
          <ErrorState message={loadErrorMessage(rules.error)} onRetry={() => void rules.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState message="아직 만든 규칙이 없습니다." />
        ) : (
          <ul aria-label="이체 목적 규칙 목록" className="divide-y divide-border-subtle rounded-md border border-border">
            {items.map((rule) => <RuleRow key={rule.id} rule={rule} merchants={merchants} />)}
          </ul>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 화면
// ---------------------------------------------------------------------------

/** 작업대 · 이체 목적 정하기 (T061) — 이체를 금액 큰 순으로 보고, 사람이 목적을 정한다. 추정·추천하지 않는다. */
export function TransferPurposePage() {
  const hasWrite = useWriteAccess()
  const [searchParams, setSearchParams] = useSearchParams()
  const start = searchParams.get('start') ?? ''
  const end = searchParams.get('end') ?? ''
  const undecidedOnly = searchParams.get('undecided') === '1'
  const back = parsePairKey(searchParams.get('from'))
  const [shown, setShown] = useState(PAGE)

  const list = useTransferPurposeList({
    start_date: start || undefined,
    end_date: end || undefined,
    purpose: undecidedOnly ? 'undecided' : undefined,
    limit: LIST_LIMIT,
  })
  const rules = useTransferPurposeRules()

  function setParams(changes: Record<string, string | null>) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      return params
    }, { replace: true })
    setShown(PAGE)
  }

  const data = list.data
  const items = (data?.items ?? []).filter((item) => item.effective)
  const merchants = [...new Set(items.map((item) => item.merchant).filter((merchant) => merchant.trim() !== ''))].sort((a, b) => a.localeCompare(b, 'ko'))
  const share = data && data.activity_total > 0 ? data.undecided_activity_total / data.activity_total : null

  return (
    <>
      <PageHeader
        title="작업대 · 이체 목적"
        meta={data ? <span className="tnum">목적 미정 {data.undecided_count}건 · 금액 기준 {sharePct(share)}</span> : null}
      />
      <div className="flex flex-col gap-4">
        {back ? (
          <Link to={netWorthPairLink(back)} className="inline-flex items-center gap-1 self-start text-caption font-medium text-transfer hover:underline">
            <ArrowLeft className="h-3 w-3" />
            재무상태의 {back.start_date} → {back.end_date} 대조로 돌아가기
          </Link>
        ) : null}

        <Card
          title="이체 목적 정하기"
          meta="이체를 금액이 큰 순서로 보여 줍니다. 목적은 사람이 정하며, 화면이 추정하거나 미리 골라 두지 않습니다. 정한 목적은 재무상태의 순자산 대조(투자 평가 변동)와 월 결산의 잔여의 행방에 쓰입니다."
        >
          <div className="space-y-3">
            <dl className="grid gap-1 text-caption sm:grid-cols-3">
              {(['investment', 'savings', 'internal_move'] as const).map((purpose) => (
                <div key={purpose}>
                  <dt className="font-semibold text-text-primary">{TRANSFER_PURPOSE_TEXT[purpose]}</dt>
                  <dd className="text-text-muted">{TRANSFER_PURPOSE_HELP[purpose]}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap items-end gap-3 border-t border-border-subtle pt-3 text-caption">
              <Field label="시작일">
                <TextInput type="date" value={start} onChange={(event) => setParams({ start: event.target.value || null })} aria-label="기간 시작일" />
              </Field>
              <Field label="끝 날">
                <TextInput type="date" value={end} onChange={(event) => setParams({ end: event.target.value || null })} aria-label="기간 끝 날" />
              </Field>
              <label className="flex items-center gap-1.5 pb-1.5 text-text-secondary">
                <input type="checkbox" checked={undecidedOnly} onChange={(event) => setParams({ undecided: event.target.checked ? '1' : null })} />
                목적 미정만 보기
              </label>
              {start || end ? (
                <Button size="sm" variant="ghost" onClick={() => setParams({ start: null, end: null })}>기간 지우기</Button>
              ) : null}
            </div>

            {!hasWrite ? (
              <p className="text-caption text-warn"><Badge variant="warn">읽기 전용</Badge> API 키가 없어 목적과 규칙을 바꿀 수 없습니다.</p>
            ) : null}

            {list.isLoading ? (
              <ListSkeleton rows={6} />
            ) : list.error || !data ? (
              <ErrorState message={loadErrorMessage(list.error)} onRetry={() => void list.refetch()} />
            ) : (
              <>
                <p className="tnum rounded-md border border-border-subtle bg-bg-inset px-3 py-2 text-caption text-text-secondary">
                  {start || end ? `${start ? formatDateKo(start) : '처음'} ~ ${end ? formatDateKo(end) : '거래 기준일'}` : '전체 기간'}의 이체 {data.total_count}건 중 목적 미정{' '}
                  <strong className="font-semibold text-text-primary">{data.undecided_count}건</strong>, 미정 금액{' '}
                  <strong className="font-semibold text-text-primary">{formatNetWon(data.undecided_activity_total)}</strong> / 오간 금액 {formatNetWon(data.activity_total)} ({sharePct(share)}).
                  {' '}오간 금액은 보낸 돈과 받은 돈을 부호 없이 더한 값입니다.
                </p>
                {items.length === 0 ? (
                  <EmptyState message={undecidedOnly ? '이 기간에 목적이 정해지지 않은 이체가 없습니다.' : '이 기간에 이체가 없습니다.'} />
                ) : (
                  <>
                    <ul aria-label="이체 목록" className="divide-y divide-border-subtle rounded-md border border-border">
                      {items.slice(0, shown).map((item) => (
                        <TransferRow key={item.transaction_id} item={item} listed={items} rules={rules.data?.items ?? []} />
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
                      <span>{Math.min(shown, items.length)} / {items.length}건 표시</span>
                      {items.length > shown ? <Button size="sm" variant="secondary" onClick={() => setShown((n) => n + PAGE)}>{PAGE}건 더 보기</Button> : null}
                      {data.items.length >= LIST_LIMIT ? <span>이체가 많아 금액이 큰 {LIST_LIMIT}건까지만 불러왔습니다. 기간을 좁혀 보세요.</span> : null}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </Card>

        <RulesCard merchants={merchants} />
      </div>
    </>
  )
}
