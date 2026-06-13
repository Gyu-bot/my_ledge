import { useEffect, useState } from 'react'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { BulkBar } from '../../ds/BulkBar'
import { Field, Select, TextInput } from '../../ds/Field'
import { Pagination } from '../../ds/Pagination'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { EM_DASH, formatSignedWon, formatWon } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import {
  useApplyLoanMerchantRules,
  useBulkLinkTransactionsToLoan,
  useLoanAccounts,
  useLoanMerchantRules,
  useLoanTransactionMappings,
  useTransactionFilterOptions,
  useUpdateLoanAccountMetadata,
  useUpsertLoanMerchantRule,
} from '../../hooks/useTransactions'
import { useLoanSummary, usePatchLoanRepaymentMetadata } from '../../hooks/useAssets'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type {
  LoanAccountCandidate,
  LoanKind,
  LoanLinkStateFilter,
  LoanMerchantRuleMatchField,
  LoanRepaymentType,
} from '../../types/transaction'
import type { LoanRepaymentMethod } from '../../types/asset'

type Tab = 'accounts' | 'links' | 'rules'
const PAGE_SIZE = 40

const LOAN_KIND_LABEL: Record<LoanKind, string> = {
  unknown: '미지정', overdraft: '마이너스 통장', equal_principal_interest: '원리금 균등 상환',
  equal_principal: '원금 균등 상환', bullet: '일시 원금 상환', other: '기타',
}
const REPAYMENT_LABEL: Record<LoanRepaymentType, string> = { principal: '원금', interest: '이자', mixed: '원리금', unknown: '미정' }
const REPAYMENT_METHOD_LABEL: Record<LoanRepaymentMethod, string> = { principal_interest: '원리금 균등', principal_equal: '원금 균등', interest_only: '이자만', unknown: '미정' }

function accountValue(account: LoanAccountCandidate) {
  return account.loan_account_id !== null ? `id:${account.loan_account_id}` : `pair:${account.lender}:${account.product_name}`
}
function accountIdFromValue(value: string) {
  if (!value.startsWith('id:')) return undefined
  const parsed = Number(value.slice(3))
  return Number.isFinite(parsed) ? parsed : undefined
}

function AccountsTab() {
  const hasWrite = useWriteAccess()
  const accounts = useLoanAccounts()
  const loans = useLoanSummary()
  const updateMeta = useUpdateLoanAccountMetadata()
  const patchRepayment = usePatchLoanRepaymentMetadata()
  const [drafts, setDrafts] = useState<Record<string, { display_name_user: string; loan_kind: LoanKind; monthly_payment: string; repayment_method: LoanRepaymentMethod }>>({})

  useEffect(() => {
    const items = accounts.data?.items
    if (!items) return
    setDrafts((current) => {
      const next = { ...current }
      let changed = false
      for (const account of items) {
        const key = accountValue(account)
        if (!next[key]) {
          const loan = loans.data?.items.find((l) => l.lender === account.lender && l.product_name === account.product_name)
          next[key] = {
            display_name_user: account.display_name_user ?? '',
            loan_kind: account.loan_kind,
            monthly_payment: loan?.monthly_payment_source === 'manual' ? (loan.monthly_payment ?? '') : '',
            repayment_method: loan?.repayment_method ?? 'unknown',
          }
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [accounts.data, loans.data])

  async function save(account: LoanAccountCandidate) {
    const key = accountValue(account)
    const draft = drafts[key]
    if (!draft) return
    try {
      await updateMeta.mutateAsync({
        loan_account_id: account.loan_account_id,
        lender: account.loan_account_id === null ? account.lender : null,
        product_name: account.loan_account_id === null ? account.product_name : null,
        display_name_user: draft.display_name_user.trim() || null,
        loan_kind: draft.loan_kind,
      })
      const loan = loans.data?.items.find((l) => l.lender === account.lender && l.product_name === account.product_name)
      if (loan?.id != null && (draft.monthly_payment.trim() || draft.repayment_method !== 'unknown')) {
        await patchRepayment.mutateAsync({ id: loan.id, data: { monthly_payment: draft.monthly_payment.trim() || null, repayment_method: draft.repayment_method } })
      }
      toast.success('대출 계좌 정보 저장 완료')
    } catch (error) {
      toast.error('저장 실패', { description: String(error) })
    }
  }

  return (
    <Card title="대출 계좌 관리" meta="표시명·대출 성격·상환 메타를 함께 관리합니다" bodyClassName="p-0">
      {accounts.isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> :
       accounts.data && accounts.data.items.length > 0 ? (
        <div className="divide-y divide-border-subtle">
          {accounts.data.items.map((account) => {
            const key = accountValue(account)
            const draft = drafts[key] ?? { display_name_user: '', loan_kind: account.loan_kind, monthly_payment: '', repayment_method: 'unknown' as LoanRepaymentMethod }
            const loan = loans.data?.items.find((l) => l.lender === account.lender && l.product_name === account.product_name)
            const estimated = loan?.monthly_payment_source === 'estimated_from_linked_transactions' ? loan.monthly_payment : null
            const meta = [
              account.latest_snapshot_date ? `스냅샷 ${account.latest_snapshot_date}` : '스냅샷 없음',
              account.loan_maturity_date ? `만기 ${account.loan_maturity_date}` : null,
              account.latest_balance ? `잔액 ₩${formatWon(Number(account.latest_balance))}` : null,
              account.latest_interest_rate ? `${account.latest_interest_rate}%` : null,
            ].filter(Boolean).join(' · ')
            return (
              <div key={key} className="px-4 py-3.5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-44 flex-1">
                    <div className="text-label font-semibold text-text-primary">{account.lender} {account.product_name}</div>
                    <div className="tnum text-caption text-text-muted">{meta}</div>
                  </div>
                  <Field label="대출 계좌명"><TextInput className="w-44" disabled={!hasWrite} placeholder={account.display_name} value={draft.display_name_user} onChange={(e) => setDrafts((c) => ({ ...c, [key]: { ...draft, display_name_user: e.target.value } }))} /></Field>
                  <Field label="대출 성격"><Select disabled={!hasWrite} value={draft.loan_kind} onChange={(e) => setDrafts((c) => ({ ...c, [key]: { ...draft, loan_kind: e.target.value as LoanKind } }))}>{(Object.entries(LOAN_KIND_LABEL) as [LoanKind, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                </div>
                <div className="mt-2.5 flex flex-wrap items-end gap-3 border-t border-border-subtle pt-2.5">
                  <div className="min-w-44 rounded-md border border-border-subtle bg-bg-inset px-3 py-2">
                    <div className="text-micro text-text-faint">연결 거래 추정 월상환액</div>
                    <div className="tnum mt-1 text-caption font-semibold text-text-primary">{estimated ? `₩${formatWon(Number(estimated))}` : '추정값 없음'}</div>
                  </div>
                  <Field label="수동 월상환액"><TextInput type="number" min={0} className="w-32" disabled={!hasWrite} value={draft.monthly_payment} onChange={(e) => setDrafts((c) => ({ ...c, [key]: { ...draft, monthly_payment: e.target.value } }))} /></Field>
                  <Field label="상환 방식"><Select disabled={!hasWrite} value={draft.repayment_method} onChange={(e) => setDrafts((c) => ({ ...c, [key]: { ...draft, repayment_method: e.target.value as LoanRepaymentMethod } }))}>{(Object.entries(REPAYMENT_METHOD_LABEL) as [LoanRepaymentMethod, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                  <Button variant="primary" disabled={!hasWrite || updateMeta.isPending || patchRepayment.isPending} onClick={() => void save(account)}>저장</Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : <EmptyState className="py-8" message="등록 가능한 대출 계좌가 없습니다" />}
    </Card>
  )
}

function LinksTab() {
  const hasWrite = useWriteAccess()
  const accounts = useLoanAccounts()
  const [filter, setFilter] = useState<{ search: string; linked: LoanLinkStateFilter; account: string; repayment: '' | LoanRepaymentType }>({ search: '', linked: 'all', account: '', repayment: '' })
  const [applied, setApplied] = useState(filter)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [linkAccount, setLinkAccount] = useState('')
  const [linkRepayment, setLinkRepayment] = useState<LoanRepaymentType>('mixed')
  const link = useBulkLinkTransactionsToLoan()

  const mappings = useLoanTransactionMappings({
    page, per_page: PAGE_SIZE,
    search: applied.search || undefined,
    linked: applied.linked,
    loan_account_id: accountIdFromValue(applied.account),
    repayment_type: applied.repayment || undefined,
  })
  const items = mappings.data?.items ?? []

  async function connect() {
    const account = accounts.data?.items.find((a) => accountValue(a) === linkAccount)
    if (!account || selected.size === 0) return
    try {
      const result = await link.mutateAsync({
        transaction_ids: [...selected],
        loan_account_id: account.loan_account_id,
        lender: account.loan_account_id === null ? account.lender : null,
        product_name: account.loan_account_id === null ? account.product_name : null,
        repayment_type: linkRepayment,
        memo: null,
      })
      toast.success(`${result.updated}건 대출 연결 완료`)
      setSelected(new Set())
      setLinkAccount('')
    } catch (error) {
      toast.error('대출 연결 실패', { description: String(error) })
    }
  }

  const inputCls = 'rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-caption text-text-secondary'

  return (
    <>
      <Card title="대출 상환 거래 필터" action={<div className="flex gap-2"><Button variant="primary" onClick={() => { setApplied(filter); setPage(1); setSelected(new Set()) }}>적용</Button><Button variant="ghost" onClick={() => { setFilter({ search: '', linked: 'all', account: '', repayment: '' }); setApplied({ search: '', linked: 'all', account: '', repayment: '' }); setPage(1) }}>초기화</Button></div>}>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputCls} w-40`} placeholder="거래처·설명·계좌 검색" value={filter.search} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))} />
          <Select className={inputCls} value={filter.linked} onChange={(e) => setFilter((f) => ({ ...f, linked: e.target.value as LoanLinkStateFilter }))} aria-label="연결 상태"><option value="all">연결 상태 전체</option><option value="linked">연결됨</option><option value="unlinked">미연결</option></Select>
          <Select className={inputCls} value={filter.account} onChange={(e) => setFilter((f) => ({ ...f, account: e.target.value }))} aria-label="대출 계좌"><option value="">대출 계좌 전체</option>{accounts.data?.items.map((a) => <option key={accountValue(a)} value={accountValue(a)}>{a.display_name}</option>)}</Select>
          <Select className={inputCls} value={filter.repayment} onChange={(e) => setFilter((f) => ({ ...f, repayment: e.target.value as '' | LoanRepaymentType }))} aria-label="상환 성격"><option value="">상환 성격 전체</option><option value="mixed">원리금</option><option value="interest">이자</option><option value="principal">원금</option><option value="unknown">미정</option></Select>
        </div>
      </Card>

      <Card title="대출 상환 거래 목록" meta={`${items.length} / ${mappings.data?.total ?? 0}건`} bodyClassName="p-0">
        {mappings.isLoading ? <div className="p-4"><ListSkeleton rows={6} /></div> :
         items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-label">
              <thead className="bg-bg-inset">
                <tr>
                  <th className="px-3 py-2"><input type="checkbox" aria-label="페이지 전체 선택" checked={items.length > 0 && items.every((i) => selected.has(i.transaction_id))} onChange={() => setSelected((c) => { const n = new Set(c); const all = items.every((i) => n.has(i.transaction_id)); items.forEach((i) => all ? n.delete(i.transaction_id) : n.add(i.transaction_id)); return n })} className="h-3 w-3 accent-[var(--ds-accent-fg)]" /></th>
                  {['날짜', '거래처', '카테고리', '연결 대출', '상환', '금액'].map((h) => <th key={h} className="px-3 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((item) => (
                  <tr key={item.transaction_id} className={selected.has(item.transaction_id) ? 'bg-bg-selected' : ''}>
                    <td className="px-3 py-2"><input type="checkbox" aria-label={`${item.merchant} 선택`} checked={selected.has(item.transaction_id)} onChange={() => setSelected((c) => { const n = new Set(c); if (n.has(item.transaction_id)) n.delete(item.transaction_id); else n.add(item.transaction_id); return n })} className="h-3 w-3 accent-[var(--ds-accent-fg)]" /></td>
                    <td className="tnum px-3 py-2 text-text-faint">{item.date.slice(5)}</td>
                    <td className="max-w-[150px] truncate px-3 py-2 text-text-primary">{item.merchant}</td>
                    <td className="px-3 py-2 text-text-muted">{item.effective_category_major}</td>
                    <td className="px-3 py-2">{item.link ? <Badge variant="transfer">{item.link.display_name}</Badge> : <Badge variant="warn">미연결</Badge>}</td>
                    <td className="px-3 py-2 text-caption text-text-muted">{item.link ? REPAYMENT_LABEL[item.link.repayment_type] : EM_DASH}</td>
                    <td className={`tnum px-3 py-2 text-right font-semibold ${item.amount < 0 ? 'text-expense' : 'text-income'}`}>{formatSignedWon(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} perPage={PAGE_SIZE} total={mappings.data?.total ?? 0} onPageChange={setPage} />
          </div>
        ) : <EmptyState className="py-10" message="조건에 맞는 대출 상환 후보가 없습니다" />}
      </Card>

      <BulkBar count={selected.size} onClear={() => { setSelected(new Set()); setLinkAccount('') }}>
        <Select className="text-caption" aria-label="연결 대출 계좌" value={linkAccount} onChange={(e) => setLinkAccount(e.target.value)}><option value="">— 계좌 선택 —</option>{accounts.data?.items.map((a) => <option key={accountValue(a)} value={accountValue(a)}>{a.display_name}</option>)}</Select>
        <Select className="text-caption" aria-label="상환 성격" value={linkRepayment} onChange={(e) => setLinkRepayment(e.target.value as LoanRepaymentType)}><option value="mixed">원리금</option><option value="interest">이자</option><option value="principal">원금</option><option value="unknown">미정</option></Select>
        <Button variant="primary" disabled={!hasWrite || !linkAccount || link.isPending} onClick={() => void connect()}>대출 연결</Button>
      </BulkBar>
    </>
  )
}

function RulesTab() {
  const hasWrite = useWriteAccess()
  const accounts = useLoanAccounts()
  const rules = useLoanMerchantRules()
  const upsert = useUpsertLoanMerchantRule()
  const apply = useApplyLoanMerchantRules()
  const filterOptions = useTransactionFilterOptions()
  const [matchField, setMatchField] = useState<LoanMerchantRuleMatchField>('merchant')
  const [matchValue, setMatchValue] = useState('')
  const [accountId, setAccountId] = useState('')
  const [repayment, setRepayment] = useState<LoanRepaymentType>('mixed')

  async function save() {
    const parsed = Number(accountId)
    if (!matchValue.trim() || !Number.isFinite(parsed)) return
    try {
      await upsert.mutateAsync({ merchant: matchValue.trim(), match_field: matchField, loan_account_id: parsed, repayment_type: repayment, memo: null })
      setMatchValue(''); setAccountId('')
      toast.success('대출 매칭 규칙 저장 완료')
    } catch (error) {
      toast.error('규칙 저장 실패', { description: String(error) })
    }
  }

  async function applyAll() {
    try {
      const result = await apply.mutateAsync()
      toast.success('일괄 적용 완료', { description: `${result.updated}건 반영` })
    } catch (error) {
      toast.error('일괄 적용 실패', { description: String(error) })
    }
  }

  void filterOptions

  return (
    <Card title="대출 매칭 규칙" meta="거래처/원본 설명 정확 일치 → 대출 계좌 · 수동 연결은 덮지 않음" action={<Button variant="primary" disabled={!hasWrite || apply.isPending} onClick={() => void applyAll()}>일괄 적용</Button>} bodyClassName="p-0">
      <div className="flex flex-wrap items-end gap-2 border-b border-border-subtle px-4 py-3">
        <Field label="매칭 기준"><Select value={matchField} onChange={(e) => setMatchField(e.target.value as LoanMerchantRuleMatchField)}><option value="merchant">분석용 거래처</option><option value="description">원본 설명</option></Select></Field>
        <Field label="매칭 값"><TextInput className="w-44" value={matchValue} onChange={(e) => setMatchValue(e.target.value)} /></Field>
        <Field label="대출 계좌"><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">— 선택 —</option>{accounts.data?.items.filter((a) => a.loan_account_id !== null).map((a) => <option key={a.loan_account_id} value={a.loan_account_id ?? ''}>{a.display_name}</option>)}</Select></Field>
        <Field label="상환 성격"><Select value={repayment} onChange={(e) => setRepayment(e.target.value as LoanRepaymentType)}><option value="mixed">원리금</option><option value="interest">이자</option><option value="principal">원금</option><option value="unknown">미정</option></Select></Field>
        <Button disabled={!hasWrite || !matchValue.trim() || !accountId || upsert.isPending} onClick={() => void save()}>규칙 저장</Button>
      </div>
      {rules.data && rules.data.items.length > 0 ? (
        <table className="w-full border-collapse text-label">
          <thead className="bg-bg-inset"><tr>{['기준', '매칭 값', '대출 계좌', '상환'].map((h) => <th key={h} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border-subtle">
            {rules.data.items.map((rule) => (
              <tr key={rule.id}>
                <td className="px-4 py-2 text-text-muted">{rule.match_field === 'merchant' ? '거래처' : '원본 설명'}</td>
                <td className="px-4 py-2 text-text-secondary">{rule.merchant}</td>
                <td className="px-4 py-2 text-text-muted">{rule.display_name}</td>
                <td className="px-4 py-2 text-text-muted">{REPAYMENT_LABEL[rule.repayment_type]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <EmptyState className="py-8" message="등록된 대출 매칭 규칙이 없습니다" />}
    </Card>
  )
}

export function LoansPage() {
  const [tab, setTab] = useState<Tab>('accounts')
  return (
    <>
      <PageHeader
        title="데이터 · 대출"
        controls={
          <SegmentedControl
            ariaLabel="대출 탭"
            options={[{ value: 'accounts', label: '계좌' }, { value: 'links', label: '거래 연결' }, { value: 'rules', label: '규칙' }] as const}
            value={tab}
            onChange={setTab}
          />
        }
      />
      <div className="flex flex-col gap-4">
        {tab === 'accounts' ? <AccountsTab /> : tab === 'links' ? <LinksTab /> : <RulesTab />}
      </div>
    </>
  )
}
