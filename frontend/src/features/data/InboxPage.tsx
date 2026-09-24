import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Field, Select, TextInput } from '../../ds/Field'
import { CoverageGauge } from '../../ds/CoverageGauge'
import { Pagination } from '../../ds/Pagination'
import { Provenance } from '../../ds/Provenance'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { formatPct, formatSignedWon } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import { useCanonicalViewsDashboard } from '../../hooks/useCanonicalViews'
import { useDiscretionaryVelocity } from '../../hooks/useAnalytics'
import {
  useApplyRecurringDryRun,
  useBulkLinkTransactionsToLoan,
  useLoanAccounts,
  useLoanTransactionMappings,
  useReviewLoanTransactionCandidate,
  useRecurringCategoryRulesDryRun,
  useUpdateTransaction,
} from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { LoanAccountCandidate, LoanRepaymentType, RecurringDryRunApplyScope, RecurringDryRunItem, RecurringPaymentKind, SpendNecessity, TransactionUpdateRequest } from '../../types/transaction'
import type { CanonicalUnclassifiedWorkQueueItem } from '../../types/canonicalViews'

type Tab = 'all' | 'unclassified' | 'dryrun' | 'loan'

const RECURRING_LABEL: Record<RecurringPaymentKind, string> = {
  installment: '할부',
  monthly_recurring: '매월 반복',
  not_recurring: '반복 아님',
}

function accountValue(account: LoanAccountCandidate) {
  return account.loan_account_id !== null ? `id:${account.loan_account_id}` : `pair:${account.lender}:${account.product_name}`
}

function UnclassifiedCard({ item }: { item: CanonicalUnclassifiedWorkQueueItem }) {
  const hasWrite = useWriteAccess()
  const update = useUpdateTransaction()
  const [costKind, setCostKind] = useState<'' | 'fixed' | 'variable'>(item.cost_kind ?? '')
  const [necessity, setNecessity] = useState<'' | SpendNecessity>(item.spend_necessity ?? item.fixed_cost_necessity ?? '')
  const [recurring, setRecurring] = useState<'' | RecurringPaymentKind>(item.recurring_payment_kind ?? '')

  const changes: TransactionUpdateRequest = {
    ...(costKind && costKind !== (item.cost_kind ?? '') ? { cost_kind: costKind } : {}),
    ...(necessity !== (item.spend_necessity ?? item.fixed_cost_necessity ?? '') ? { spend_necessity: necessity || null } : {}),
    ...(recurring !== (item.recurring_payment_kind ?? '') ? { recurring_payment_kind: recurring || null } : {}),
  }
  const canSave = Object.keys(changes).length > 0

  async function save() {
    if (!canSave) return
    try {
      await update.mutateAsync({ id: item.transaction_id, data: changes })
      toast.success('분류 저장 완료', { description: item.merchant })
    } catch (error) {
      toast.error('저장 실패', { description: String(error) })
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-inset px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral">미분류</Badge>
            <span className="truncate text-label font-semibold text-text-primary">{item.merchant}</span>
          </div>
          <div className="tnum mt-1 flex items-center gap-1.5 text-caption text-text-muted">
            {item.date} · {formatSignedWon(item.amount)} · {item.effective_category_major}
            <Provenance title="우선순위 사유" note={item.priority_reason} />
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-end gap-2">
        <Field label="고정/변동">
          <Select disabled={!hasWrite} value={costKind} onChange={(event) => setCostKind(event.target.value as typeof costKind)}>
            <option value="" disabled={item.cost_kind != null}>미지정</option><option value="fixed">고정</option><option value="variable">변동</option>
          </Select>
        </Field>
        <Field label="필수/재량">
          <Select disabled={!hasWrite} value={necessity} onChange={(event) => setNecessity(event.target.value as typeof necessity)}>
            <option value="">—</option><option value="essential">필수</option><option value="discretionary">재량</option>
          </Select>
        </Field>
        <Field label="반복">
          <Select disabled={!hasWrite} value={recurring} onChange={(event) => setRecurring(event.target.value as typeof recurring)}>
            <option value="">—</option>
            {(Object.entries(RECURRING_LABEL) as [RecurringPaymentKind, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <Button variant="primary" disabled={!hasWrite || !canSave || update.isPending} onClick={() => void save()}>저장</Button>
        <Link to={`/data/transactions?transaction_id=${item.transaction_id}`} className="pb-1.5 text-caption text-transfer hover:underline">거래에서 열기</Link>
      </div>
    </div>
  )
}

function DryRunCard({ item, onRefresh }: { item: RecurringDryRunItem; onRefresh: () => void }) {
  const hasWrite = useWriteAccess()
  const apply = useApplyRecurringDryRun()
  const scopeOptions = item.apply_scope_options.filter((option) => option === 'all_matching' || option === 'reviewed_only')
  const [scope, setScope] = useState<RecurringDryRunApplyScope>(item.default_apply_scope ?? 'all_matching')
  const [reviewed, setReviewed] = useState<Set<number>>(new Set())
  const [stale, setStale] = useState(false)
  const ids = scope === 'reviewed_only' ? [...reviewed] : item.matched_transactions.map((tx) => tx.id)

  async function approve() {
    if (!item.preview_token || ids.length === 0 || stale) return
    try {
      const result = await apply.mutateAsync({ merchant: item.merchant, proposed_kind: item.proposed_kind, apply_scope: scope, preview_token: item.preview_token, transaction_ids: ids })
      toast.success(`${item.merchant} 분류 반영`, { description: `미리보기 중 ${result.updated}건 반영` })
    } catch (error) {
      if (String(error).includes('409')) {
        setStale(true)
        toast.error('미리보기 내용이 변경되었습니다', { description: '새로 조회한 거래를 확인한 뒤 다시 승인해 주세요.' })
        onRefresh()
      } else toast.error('승인 적용 실패', { description: String(error) })
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-inset px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="accent">승인 대기</Badge>
        <span className="text-label font-semibold text-text-primary">{item.merchant}</span>
        <span className="text-caption text-text-muted">제안: {RECURRING_LABEL[item.proposed_kind]}</span>
        <Provenance title="제안 근거" rows={[{ label: '신뢰도', value: formatPct(item.confidence * 100, 0) }, { label: '카테고리 근거', value: item.category_hint }]} note={item.reason} />
      </div>
      <p className="mt-2 text-caption text-text-muted">미리보기 {item.matched_transactions.length}건 · 아래 표시된 거래만 적용합니다.</p>
      <div className="mt-2 flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
        {item.matched_transactions.map((tx) => (
          <label key={tx.id} className="tnum flex items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-surface px-2 py-1 text-micro text-text-muted">
            {scope === 'reviewed_only' && <input type="checkbox" aria-label={`${item.merchant} ${tx.date} 거래 ${tx.id} 검토`} disabled={!hasWrite || apply.isPending} checked={reviewed.has(tx.id)} onChange={() => setReviewed((current) => { const next = new Set(current); if (next.has(tx.id)) next.delete(tx.id); else next.add(tx.id); return next })} />}
            <Link to={`/data/transactions?transaction_id=${tx.id}`} className="hover:underline">{tx.date} · {formatSignedWon(tx.amount)}</Link>
          </label>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-end gap-2">
        <Field label="적용 범위">
          <Select disabled={!hasWrite || apply.isPending} value={scope} onChange={(event) => setScope(event.target.value as RecurringDryRunApplyScope)}>
            {scopeOptions.map((option) => <option key={option} value={option}>{option === 'all_matching' ? '미리보기 전체' : '직접 검토한 거래만'}</option>)}
          </Select>
        </Field>
        <Button variant="primary" disabled={!hasWrite || apply.isPending || !item.preview_token || stale || ids.length === 0 || !scopeOptions.includes(scope)} onClick={() => void approve()}>승인 적용 ({ids.length}건)</Button>
        {item.proposed_kind === 'installment' ? (
          <Link to={`/data/installments?search=${encodeURIComponent(item.merchant)}&linked=unlinked&prefill_merchant=${encodeURIComponent(item.merchant)}`} className="pb-1.5 text-caption text-transfer hover:underline">할부 연결</Link>
        ) : null}
      </div>
      <p className="mt-2 text-micro text-text-muted">미래 거래 자동 적용은 지원하지 않습니다. 새 거래는 다시 검토합니다.</p>
      {stale && <Button variant="secondary" onClick={onRefresh}>미리보기 다시 조회</Button>}
    </div>
  )
}

function LoanCandidateCard({
  item,
  accounts,
}: {
  item: { transaction_id: number; date: string; merchant: string; amount: number; effective_category_major: string }
  accounts: LoanAccountCandidate[]
}) {
  const hasWrite = useWriteAccess()
  const link = useBulkLinkTransactionsToLoan()
  const review = useReviewLoanTransactionCandidate()
  const [accountKey, setAccountKey] = useState('')
  const [repayment, setRepayment] = useState<LoanRepaymentType>('mixed')
  const controlsDisabled = !hasWrite || link.isPending || review.isPending

  async function connect() {
    const account = accounts.find((candidate) => accountValue(candidate) === accountKey)
    if (!account) return
    try {
      const result = await link.mutateAsync({
        transaction_ids: [item.transaction_id],
        loan_account_id: account.loan_account_id,
        lender: account.loan_account_id === null ? account.lender : null,
        product_name: account.loan_account_id === null ? account.product_name : null,
        repayment_type: repayment,
        memo: null,
      })
      toast.success('대출 연결 완료', { description: `${result.updated}건 반영` })
    } catch (error) {
      toast.error('대출 연결 실패', { description: String(error) })
    }
  }

  async function dismissCandidate() {
    try {
      await review.mutateAsync({
        transactionId: item.transaction_id,
        data: { review_status: 'not_candidate' },
      })
      toast.success('대출 후보 제외 완료', { description: item.merchant })
    } catch (error) {
      toast.error('대출 후보 제외 실패', { description: String(error) })
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-inset px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="warn">대출 연결 후보</Badge>
        <span className="text-label font-semibold text-text-primary">{item.merchant}</span>
        <span className="tnum text-caption text-text-muted">{item.date} · {formatSignedWon(item.amount)} · {item.effective_category_major}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-end gap-2">
        <Field label="대출 계좌">
          <Select disabled={controlsDisabled} value={accountKey} onChange={(event) => setAccountKey(event.target.value)}>
            <option value="">— 선택 —</option>
            {accounts.map((account) => <option key={accountValue(account)} value={accountValue(account)}>{account.display_name}</option>)}
          </Select>
        </Field>
        <Field label="상환 성격">
          <Select disabled={controlsDisabled} value={repayment} onChange={(event) => setRepayment(event.target.value as LoanRepaymentType)}>
            <option value="mixed">원리금</option><option value="interest">이자</option><option value="principal">원금</option><option value="unknown">미정</option>
          </Select>
        </Field>
        <Button variant="primary" disabled={controlsDisabled || !accountKey} onClick={() => void connect()}>연결</Button>
        <Button variant="secondary" disabled={controlsDisabled} onClick={() => void dismissCandidate()}>
          {review.isPending ? '처리 중...' : '대출 후보 아님'}
        </Button>
        <Link to="/data/loans" className="pb-1.5 text-caption text-transfer hover:underline">대출에서 열기</Link>
      </div>
    </div>
  )
}

export function InboxPage() {
  const [tab, setTab] = useState<Tab>('all')
  const [queuePage, setQueuePage] = useState(1)
  const [queueFilter, setQueueFilter] = useState({ search: '', issue_types: '', period_from: '', period_to: '' })
  const canonical = useCanonicalViewsDashboard({
    queue_page: queuePage, queue_limit: 20,
    search: queueFilter.search || undefined,
    issue_types: queueFilter.issue_types || undefined,
    period_from: queueFilter.period_from || undefined,
    period_to: queueFilter.period_to || undefined,
  })
  useEffect(() => {
    const totalPages = canonical.data?.unclassified_work_queue_total_pages
    if (totalPages !== undefined && queuePage > Math.max(1, totalPages)) setQueuePage(Math.max(1, totalPages))
  }, [canonical.data?.unclassified_work_queue_total_pages, queuePage])
  const dryRun = useRecurringCategoryRulesDryRun()
  const unlinked = useLoanTransactionMappings({ linked: 'unlinked', page: 1, per_page: 20 })
  const loanAccounts = useLoanAccounts()
  const velocity = useDiscretionaryVelocity()

  const queueItems = canonical.data?.unclassified_work_queue ?? []
  const dryRunItems = dryRun.data?.items ?? []
  const loanItems = unlinked.data?.items ?? []
  const accounts = loanAccounts.data?.items ?? []
  const coverage = velocity.data?.classification_coverage_ratio ?? null

  const counts = useMemo(() => ({
    unclassified: canonical.data?.unclassified_work_queue_total ?? queueItems.length,
    dryrun: dryRunItems.length,
    loan: unlinked.data?.total ?? loanItems.length,
  }), [canonical.data?.unclassified_work_queue_total, queueItems.length, dryRunItems.length, loanItems.length, unlinked.data?.total])
  const total = counts.unclassified + counts.dryrun + counts.loan

  const showUnclassified = tab === 'all' || tab === 'unclassified'
  const showDryRun = tab === 'all' || tab === 'dryrun'
  const showLoan = tab === 'all' || tab === 'loan'
  const loading = canonical.isLoading || dryRun.isLoading || unlinked.isLoading
  const empty = !loading && total === 0

  return (
    <>
      <PageHeader
        title="데이터 · 인박스"
        meta={<CoverageGauge className="w-48" label="분류 커버리지" ratio={coverage} />}
      />

      <div className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="인박스 탭"
          options={[
            { value: 'all', label: `전체 ${total}` },
            { value: 'unclassified', label: `미분류 ${counts.unclassified}` },
            { value: 'dryrun', label: `승인 대기 ${counts.dryrun}` },
            { value: 'loan', label: `대출 연결 ${counts.loan}` },
          ] as const}
          value={tab}
          onChange={setTab}
        />

        {showUnclassified && <Card title="미분류 작업 찾기" meta="검색·분류 항목·기간을 적용한 전체 거래 수입니다">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="거래처 검색"><TextInput value={queueFilter.search} onChange={(event) => { setQueueFilter((current) => ({ ...current, search: event.target.value })); setQueuePage(1) }} /></Field>
            <Field label="미분류 항목"><Select value={queueFilter.issue_types} onChange={(event) => { setQueueFilter((current) => ({ ...current, issue_types: event.target.value })); setQueuePage(1) }}>
              <option value="">전체 항목</option><option value="cost_kind">고정/변동</option><option value="spend_necessity">필수/재량</option><option value="recurring_kind">반복 성격</option><option value="loan_link">대출 연결 검토</option>
            </Select></Field>
            <Field label="시작 월"><TextInput type="month" value={queueFilter.period_from} onChange={(event) => { setQueueFilter((current) => ({ ...current, period_from: event.target.value })); setQueuePage(1) }} /></Field>
            <Field label="종료 월"><TextInput type="month" value={queueFilter.period_to} onChange={(event) => { setQueueFilter((current) => ({ ...current, period_to: event.target.value })); setQueuePage(1) }} /></Field>
          </div>
        </Card>}
        {canonical.error || dryRun.error || unlinked.error ? <ErrorState onRetry={() => { void canonical.refetch(); void dryRun.refetch(); void unlinked.refetch() }} /> : loading ? <ListSkeleton rows={5} /> :
         empty ? (
          <Card title="처리할 항목이 없습니다">
            <EmptyState message={Object.values(queueFilter).some(Boolean) ? '현재 검색·기간·분류 조건에 맞는 항목이 없습니다' : `분류 커버리지 ${formatPct(coverage == null ? null : coverage * 100, 0)} — 처리할 항목이 없습니다`} />
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {showDryRun && dryRunItems.map((item) => <DryRunCard key={`dry-${item.merchant}-${item.preview_token}`} item={item} onRefresh={() => void dryRun.refetch()} />)}
            {showUnclassified && queueItems.map((item) => <UnclassifiedCard key={`unc-${item.transaction_id}-${item.cost_kind}-${item.spend_necessity}-${item.fixed_cost_necessity}-${item.recurring_payment_kind}`} item={item} />)}
            {showUnclassified && <Pagination page={queuePage} perPage={20} total={counts.unclassified} onPageChange={setQueuePage} />}
            {showLoan && loanItems.map((item) => (
              <LoanCandidateCard
                key={`loan-${item.transaction_id}`}
                item={{ transaction_id: item.transaction_id, date: item.date.slice(5), merchant: item.merchant, amount: item.amount, effective_category_major: item.effective_category_major }}
                accounts={accounts}
              />
            ))}
            {showLoan && counts.loan > loanItems.length ? (
              <Link to="/data/loans" className="flex items-center gap-1 px-1 text-caption text-transfer hover:underline">
                대출 연결 후보 전체 보기 ({counts.loan}건)
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        )}
        {!loading && !empty && (showUnclassified && counts.unclassified === 0 && tab === 'unclassified') ? (
          <EmptyState message="미분류 거래가 없습니다" />
        ) : null}
      </div>
    </>
  )
}
