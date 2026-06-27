import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Field, Select } from '../../ds/Field'
import { CoverageGauge } from '../../ds/CoverageGauge'
import { Provenance } from '../../ds/Provenance'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { formatPct, formatSignedWon, formatWon } from '../../ds/format'
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
import type { LoanAccountCandidate, LoanRepaymentType, RecurringDryRunApplyScope, RecurringDryRunItem, RecurringPaymentKind, SpendNecessity } from '../../types/transaction'
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
  const [costKind, setCostKind] = useState<'' | 'fixed' | 'variable'>('')
  const [necessity, setNecessity] = useState<'' | SpendNecessity>('')
  const [recurring, setRecurring] = useState<'' | RecurringPaymentKind>('')

  async function save() {
    try {
      await update.mutateAsync({
        id: item.transaction_id,
        data: {
          cost_kind: costKind || null,
          spend_necessity: necessity || null,
          recurring_payment_kind: recurring || null,
        },
      })
      toast.success('분류 저장 완료', { description: item.merchant })
    } catch (error) {
      toast.error('저장 실패', { description: String(error) })
    }
  }

  const canSave = !!(costKind || necessity || recurring)

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
            <option value="">—</option><option value="fixed">고정</option><option value="variable">변동</option>
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
        <Link to="/data/transactions" className="pb-1.5 text-caption text-transfer hover:underline">거래에서 열기</Link>
      </div>
    </div>
  )
}

function DryRunCard({ item }: { item: RecurringDryRunItem }) {
  const hasWrite = useWriteAccess()
  const apply = useApplyRecurringDryRun()
  const scopeOptions = [...(item.apply_scope_options ?? [])].sort((a, b) => (a === 'all_matching' ? -1 : b === 'all_matching' ? 1 : 0))
  const [scope, setScope] = useState<RecurringDryRunApplyScope>(scopeOptions[0] ?? 'future_only')

  async function approve() {
    try {
      const result = await apply.mutateAsync({ merchant: item.merchant, proposed_kind: item.proposed_kind, apply_scope: scope })
      toast.success(`${item.merchant} 승인 적용 완료`, { description: `${result.updated}건 반영` })
    } catch (error) {
      toast.error('승인 적용 실패', { description: String(error) })
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-inset px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="accent">승인 대기</Badge>
        <span className="text-label font-semibold text-text-primary">{item.merchant}</span>
        <span className="text-caption text-text-muted">제안: {RECURRING_LABEL[item.proposed_kind]}</span>
        <Provenance title="제안 근거" rows={[{ label: 'confidence', value: formatPct(item.confidence * 100, 0) }, { label: '카테고리 힌트', value: item.category_hint }]} note={item.reason} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.matched_transactions.slice(0, 6).map((tx) => (
          <span key={tx.id} className="tnum rounded-sm border border-border-subtle bg-bg-surface px-2 py-0.5 text-micro text-text-muted">
            {tx.date} · {formatWon(tx.amount)}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-end gap-2">
        <Field label="적용 범위">
          <Select disabled={!hasWrite} value={scope} onChange={(event) => setScope(event.target.value as RecurringDryRunApplyScope)}>
            {scopeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
        <Button variant="primary" disabled={!hasWrite || apply.isPending || item.matched_transactions.length === 0} onClick={() => void approve()}>승인 적용</Button>
        {item.proposed_kind === 'installment' ? (
          <Link to={`/data/installments?search=${encodeURIComponent(item.merchant)}&linked=unlinked&prefill_merchant=${encodeURIComponent(item.merchant)}`} className="pb-1.5 text-caption text-transfer hover:underline">할부 연결</Link>
        ) : null}
      </div>
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
  const canonical = useCanonicalViewsDashboard()
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
    unclassified: queueItems.length,
    dryrun: dryRunItems.length,
    loan: unlinked.data?.total ?? loanItems.length,
  }), [queueItems.length, dryRunItems.length, loanItems.length, unlinked.data?.total])
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

        {loading ? <ListSkeleton rows={5} /> :
         empty ? (
          <Card title="처리할 항목이 없습니다">
            <EmptyState message={`분류 커버리지 ${formatPct(coverage == null ? null : coverage * 100, 0)} — 깨끗한 상태입니다`} />
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {showDryRun && dryRunItems.map((item) => <DryRunCard key={`dry-${item.merchant}`} item={item} />)}
            {showUnclassified && queueItems.map((item) => <UnclassifiedCard key={`unc-${item.transaction_id}`} item={item} />)}
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
