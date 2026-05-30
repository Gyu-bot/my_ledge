import { useEffect, useRef, useState } from 'react'
import { AlertBanner } from '../components/ui/AlertBanner'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { Pagination } from '../components/ui/Pagination'
import { useChromeContext } from '../components/layout/chromeContext'
import {
  useBulkLinkTransactionsToLoan,
  useLoanAccounts,
  useLoanTransactionMappings,
  useUpdateLoanAccountMetadata,
} from '../hooks/useTransactions'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { formatKRW } from '../lib/utils'
import type {
  LoanAccountCandidate,
  LoanKind,
  LoanLinkStateFilter,
  LoanRepaymentType,
  LoanTransactionMappingItem,
} from '../types/transaction'

interface FilterState {
  search: string
  start_date: string
  end_date: string
  linked: LoanLinkStateFilter
  loan_account_id: string
  repayment_type: '' | LoanRepaymentType
}

interface LinkDraft {
  loan_account_id: string
  repayment_type: LoanRepaymentType
  memo: string
}

interface LoanAccountMetadataDraft {
  display_name_user: string
  loan_kind: LoanKind
}

const PAGE_SIZE = 40
const DEFAULT_FILTER: FilterState = {
  search: '',
  start_date: '',
  end_date: '',
  linked: 'all',
  loan_account_id: '',
  repayment_type: '',
}
const DEFAULT_LINK_DRAFT: LinkDraft = {
  loan_account_id: '',
  repayment_type: 'mixed',
  memo: '',
}

const REPAYMENT_LABEL: Record<LoanRepaymentType, string> = {
  principal: '원금',
  interest: '이자',
  mixed: '원리금',
  unknown: '미정',
}

const LOAN_KIND_LABEL: Record<LoanKind, string> = {
  unknown: '미지정',
  overdraft: '마이너스 통장',
  equal_principal_interest: '원리금 균등 상환',
  equal_principal: '원금 균등 상환',
  bullet: '일시 원금 상환',
  other: '기타',
}

const LOAN_KIND_OPTIONS = Object.entries(LOAN_KIND_LABEL) as [LoanKind, string][]

function accountValue(account: LoanAccountCandidate) {
  return account.loan_account_id !== null
    ? `id:${account.loan_account_id}`
    : `pair:${account.lender}:${account.product_name}`
}

function accountIdFromValue(value: string) {
  if (!value.startsWith('id:')) return undefined
  const parsed = Number(value.slice(3))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function LoanMappingPage() {
  const hasWrite = useWriteAccess()
  const { setMetaBadge } = useChromeContext()
  const selectPageCheckboxRef = useRef<HTMLInputElement | null>(null)
  const [filterDraft, setFilterDraft] = useState<FilterState>(DEFAULT_FILTER)
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [linkDraft, setLinkDraft] = useState<LinkDraft>(DEFAULT_LINK_DRAFT)
  const [accountMetadataDrafts, setAccountMetadataDrafts] = useState<Record<string, LoanAccountMetadataDraft>>({})
  const [alert, setAlert] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)

  const mappingParams = {
    page,
    per_page: PAGE_SIZE,
    search: appliedFilter.search || undefined,
    start_date: appliedFilter.start_date || undefined,
    end_date: appliedFilter.end_date || undefined,
    linked: appliedFilter.linked,
    loan_account_id: accountIdFromValue(appliedFilter.loan_account_id),
    repayment_type: appliedFilter.repayment_type || undefined,
  }
  const mappings = useLoanTransactionMappings(mappingParams)
  const loanAccounts = useLoanAccounts()
  const bulkLoanLinkMutation = useBulkLinkTransactionsToLoan()
  const updateLoanAccountMetadataMutation = useUpdateLoanAccountMetadata()

  useEffect(() => {
    const total = mappings.data?.total ?? 0
    const showing = mappings.data?.items?.length ?? 0
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {showing} / {total}건
      </span>,
    )
    return () => setMetaBadge(null)
  }, [mappings.data, setMetaBadge])

  const visibleIds = mappings.data?.items.map((item) => item.transaction_id) ?? []
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id))

  useEffect(() => {
    if (selectPageCheckboxRef.current) {
      selectPageCheckboxRef.current.indeterminate = someVisibleSelected && !allVisibleSelected
    }
  }, [allVisibleSelected, someVisibleSelected])

  useEffect(() => {
    if (!loanAccounts.data?.items) return
    setAccountMetadataDrafts((prev) => {
      const next = { ...prev }
      let changed = false
      for (const account of loanAccounts.data.items) {
        const key = accountValue(account)
        if (!next[key]) {
          next[key] = {
            display_name_user: account.display_name_user ?? '',
            loan_kind: account.loan_kind,
          }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [loanAccounts.data])

  function applyFilter() {
    setAppliedFilter(filterDraft)
    setPage(1)
    setSelectedIds(new Set())
  }

  function resetFilter() {
    setFilterDraft(DEFAULT_FILTER)
    setAppliedFilter(DEFAULT_FILTER)
    setPage(1)
    setSelectedIds(new Set())
  }

  function toggleSelectVisible() {
    if (visibleIds.length === 0) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function toggleSelect(item: LoanTransactionMappingItem) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.transaction_id)) next.delete(item.transaction_id)
      else next.add(item.transaction_id)
      return next
    })
  }

  async function applyLoanLink() {
    const selectedAccount = loanAccounts.data?.items.find((account) => (
      accountValue(account) === linkDraft.loan_account_id
    ))
    if (!selectedAccount || selectedIds.size === 0) return

    try {
      const result = await bulkLoanLinkMutation.mutateAsync({
        transaction_ids: [...selectedIds],
        loan_account_id: selectedAccount.loan_account_id,
        lender: selectedAccount.loan_account_id === null ? selectedAccount.lender : null,
        product_name: selectedAccount.loan_account_id === null ? selectedAccount.product_name : null,
        repayment_type: linkDraft.repayment_type,
        memo: linkDraft.memo || null,
      })
      setSelectedIds(new Set())
      setLinkDraft(DEFAULT_LINK_DRAFT)
      setAlert({ variant: 'success', title: `${result.updated}건 대출 연결 완료` })
    } catch (e) {
      setAlert({ variant: 'error', title: '대출 연결 실패', description: String(e) })
    }
  }

  async function saveLoanAccountMetadata(account: LoanAccountCandidate) {
    const key = accountValue(account)
    const draft = accountMetadataDrafts[key] ?? {
      display_name_user: account.display_name_user ?? '',
      loan_kind: account.loan_kind,
    }
    try {
      const updated = await updateLoanAccountMetadataMutation.mutateAsync({
        loan_account_id: account.loan_account_id,
        lender: account.loan_account_id === null ? account.lender : null,
        product_name: account.loan_account_id === null ? account.product_name : null,
        display_name_user: draft.display_name_user.trim() || null,
        loan_kind: draft.loan_kind,
      })
      setAccountMetadataDrafts((prev) => ({
        ...prev,
        [accountValue(updated)]: {
          display_name_user: updated.display_name_user ?? '',
          loan_kind: updated.loan_kind,
        },
      }))
      setAlert({ variant: 'success', title: '대출 계좌 정보 저장 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '대출 계좌 정보 저장 실패', description: String(e) })
    }
  }

  const inputCls = 'text-caption text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5'
  const hasSelection = selectedIds.size > 0
  const isReadOnly = !hasWrite

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
          description="API 키가 없어 대출 연결 저장이 비활성화됩니다."
        />
      )}

      <div className="bg-surface-card border border-border-subtle rounded-card px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-caption text-text-secondary font-semibold">대출 상환 거래 필터</div>
            <div className="text-micro text-text-ghost mt-0.5">지출 거래 중 대출 상환 후보를 대출 계좌와 연결합니다.</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={applyFilter} className="text-caption px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md">적용</button>
            <button onClick={resetFilter} className="text-caption px-3 py-1.5 border border-border-faint text-text-ghost rounded-md">초기화</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} w-40`}
            placeholder="분석용 거래처·원본 설명·메모·계좌 검색"
            value={filterDraft.search}
            onChange={(e) => setFilterDraft((filter) => ({ ...filter, search: e.target.value }))}
          />
          <select
            className={inputCls}
            value={filterDraft.linked}
            onChange={(e) => setFilterDraft((filter) => ({ ...filter, linked: e.target.value as LoanLinkStateFilter }))}
          >
            <option value="all">연결 상태 전체</option>
            <option value="linked">연결됨</option>
            <option value="unlinked">미연결</option>
          </select>
          <select
            className={`${inputCls} min-w-44`}
            value={filterDraft.loan_account_id}
            onChange={(e) => setFilterDraft((filter) => ({ ...filter, loan_account_id: e.target.value }))}
          >
            <option value="">대출 계좌 전체</option>
            {loanAccounts.data?.items.map((account) => (
              <option key={`${account.lender}:${account.product_name}`} value={accountValue(account)}>
                {account.display_name}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            value={filterDraft.repayment_type}
            onChange={(e) => setFilterDraft((filter) => ({
              ...filter,
              repayment_type: e.target.value as '' | LoanRepaymentType,
            }))}
          >
            <option value="">상환 성격 전체</option>
            <option value="mixed">원리금</option>
            <option value="interest">이자</option>
            <option value="principal">원금</option>
            <option value="unknown">미정</option>
          </select>
          <div className="w-px h-5 bg-border-faint" />
          <input type="date" className={inputCls} value={filterDraft.start_date} onChange={(e) => setFilterDraft((filter) => ({ ...filter, start_date: e.target.value }))} />
          <input type="date" className={inputCls} value={filterDraft.end_date} onChange={(e) => setFilterDraft((filter) => ({ ...filter, end_date: e.target.value }))} />
        </div>
      </div>

      <div className="bg-surface-card border border-border-subtle rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-faint">
          <div>
            <span className="text-label font-semibold text-text-secondary">대출 계좌 관리</span>
            <div className="text-micro text-text-ghost mt-0.5">대출 표시명과 대출 성격을 거래 연결과 분리해 관리합니다.</div>
          </div>
          <span className="text-micro text-text-muted bg-surface-bar border border-border-subtle px-2 py-0.5 rounded-full">
            {loanAccounts.data?.items.length ?? 0}개 계좌
          </span>
        </div>

        {loanAccounts.data?.items.length ? (
          <div className="divide-y divide-border-faint">
            {loanAccounts.data.items.map((account) => {
              const key = accountValue(account)
              const draft = accountMetadataDrafts[key] ?? {
                display_name_user: account.display_name_user ?? '',
                loan_kind: account.loan_kind,
              }
              const loanMeta = [
                account.latest_snapshot_date ? `스냅샷 ${account.latest_snapshot_date}` : '스냅샷 없음',
                account.loan_start_date ? `신규 ${account.loan_start_date}` : null,
                account.loan_maturity_date ? `만기 ${account.loan_maturity_date}` : null,
                account.latest_balance ? `잔액 ₩${formatKRW(Number(account.latest_balance))}` : null,
                account.latest_interest_rate ? `${account.latest_interest_rate}%` : null,
              ].filter(Boolean).join(' · ')
              return (
                <div key={key} className="px-4 py-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-44 flex-1">
                    <div className="text-caption text-text-secondary font-semibold truncate">
                      {account.lender} {account.product_name}
                    </div>
                    <div className="text-micro text-text-ghost mt-0.5">
                      {loanMeta}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-micro text-text-faint">대출 계좌명</span>
                    <input
                      aria-label="대출 계좌명"
                      className={`${inputCls} w-44 py-1`}
                      value={draft.display_name_user}
                      placeholder={account.display_name}
                      onChange={(e) => setAccountMetadataDrafts((prev) => ({
                        ...prev,
                        [key]: { ...draft, display_name_user: e.target.value },
                      }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-micro text-text-faint">대출 성격</span>
                    <select
                      aria-label="대출 성격"
                      className={`${inputCls} min-w-40 py-1`}
                      value={draft.loan_kind}
                      onChange={(e) => setAccountMetadataDrafts((prev) => ({
                        ...prev,
                        [key]: { ...draft, loan_kind: e.target.value as LoanKind },
                      }))}
                    >
                      {LOAN_KIND_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => saveLoanAccountMetadata(account)}
                    disabled={isReadOnly || updateLoanAccountMetadataMutation.isPending}
                    className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
                  >
                    계좌 정보 저장
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState message="등록 가능한 대출 계좌가 없습니다" />
        )}
      </div>

      {hasSelection && (
        <div className="px-4 py-3 bg-surface-section border border-border-subtle rounded-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-caption text-info-default font-semibold">{selectedIds.size}건 선택됨</div>
              <div className="text-micro text-text-ghost mt-0.5">선택한 지출 거래를 같은 대출 계좌 상환으로 연결합니다.</div>
            </div>
            <button
              onClick={() => { setSelectedIds(new Set()); setLinkDraft(DEFAULT_LINK_DRAFT) }}
              className="text-caption px-3 py-1.5 border border-border-faint text-text-ghost rounded-md"
            >
              선택 해제
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5">
              <span className="text-caption text-text-faint">대출 계좌</span>
              <select
                aria-label="대출 계좌"
                className={`${inputCls} min-w-44 py-1`}
                value={linkDraft.loan_account_id}
                onChange={(e) => setLinkDraft((draft) => ({
                  ...draft,
                  loan_account_id: e.target.value,
                }))}
              >
                <option value="">— 선택 —</option>
                {loanAccounts.data?.items.map((account) => (
                  <option key={`${account.lender}:${account.product_name}`} value={accountValue(account)}>
                    {account.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-caption text-text-faint">상환 성격</span>
              <select
                className={`${inputCls} py-1`}
                value={linkDraft.repayment_type}
                onChange={(e) => setLinkDraft((draft) => ({
                  ...draft,
                  repayment_type: e.target.value as LoanRepaymentType,
                }))}
              >
                <option value="mixed">원리금</option>
                <option value="interest">이자</option>
                <option value="principal">원금</option>
                <option value="unknown">미정</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-caption text-text-faint">연결 메모</span>
              <input
                className={`${inputCls} w-32 py-1`}
                value={linkDraft.memo}
                onChange={(e) => setLinkDraft((draft) => ({ ...draft, memo: e.target.value }))}
              />
            </label>
            <button
              onClick={applyLoanLink}
              disabled={isReadOnly || !linkDraft.loan_account_id || bulkLoanLinkMutation.isPending}
              className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
            >
              대출 연결
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface-card border border-border-subtle rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-faint">
          <div>
            <span className="text-label font-semibold text-text-secondary">대출 상환 거래 목록</span>
            <div className="text-micro text-text-ghost mt-0.5">현재 연결된 대출 계좌와 상환 성격을 함께 확인합니다.</div>
          </div>
          <span className="text-micro text-text-muted bg-surface-bar border border-border-subtle px-2 py-0.5 rounded-full">
            {page} / {Math.max(1, Math.ceil((mappings.data?.total ?? 0) / PAGE_SIZE))} 페이지 · {mappings.data?.total ?? 0}건
          </span>
        </div>

        {mappings.isLoading ? <LoadingState /> :
          mappings.data && mappings.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-caption" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 30 }} />
                  <col style={{ width: 62 }} />
                  <col style={{ width: 132 }} />
                  <col style={{ width: 94 }} />
                  <col style={{ width: 82 }} />
                  <col style={{ width: 152 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 70 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="text-micro text-text-ghost px-2 py-2 text-left font-medium">
                      <input
                        ref={selectPageCheckboxRef}
                        type="checkbox"
                        aria-label="현재 페이지 전체 선택"
                        checked={allVisibleSelected}
                        onChange={toggleSelectVisible}
                        className="w-3 h-3 accent-accent"
                      />
                    </th>
                    {['날짜', '원본 설명', '분석용 거래처', '분류', '연결 대출', '상환', '금액'].map((header) => (
                      <th key={header} className="text-micro text-text-ghost px-2 py-2 text-left font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappings.data.items.map((item) => {
                    const isSelected = selectedIds.has(item.transaction_id)
                    const rowClass = isSelected ? 'bg-surface-selected' : ''
                    return (
                      <tr key={item.transaction_id} className={rowClass}>
                        <td className="px-2 py-2">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item)} className="w-3 h-3 accent-accent" />
                        </td>
                        <td className="px-2 py-2 text-text-ghost">{item.date.slice(5)}</td>
                        <td className="px-2 py-2 text-micro text-text-ghost italic overflow-hidden text-ellipsis whitespace-nowrap">{item.description}</td>
                        <td className="px-2 py-2 text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">{item.merchant}</td>
                        <td className="px-2 py-2 text-text-faint">
                          <span className="block truncate">{item.effective_category_major}</span>
                          <span className="block text-micro text-text-ghost truncate">{item.effective_category_minor ?? '—'}</span>
                        </td>
                        <td className="px-2 py-2">
                          {item.link ? (
                            <span className="text-info-default bg-info-dim border border-info-muted px-1.5 py-0.5 rounded text-micro">
                              {item.link.display_name}
                            </span>
                          ) : (
                            <span className="text-warn bg-warn-dim border border-warn-muted px-1.5 py-0.5 rounded text-micro">
                              미연결
                            </span>
                          )}
                          {item.link?.memo ? <span className="block text-micro text-text-ghost mt-1 truncate">{item.link.memo}</span> : null}
                        </td>
                        <td className="px-2 py-2 text-text-faint">
                          {item.link ? REPAYMENT_LABEL[item.link.repayment_type] : '—'}
                        </td>
                        <td className={`px-2 py-2 text-right font-semibold ${item.amount < 0 ? 'text-danger' : 'text-accent'}`}>
                          {item.amount < 0 ? '-' : '+'}₩{formatKRW(Math.abs(item.amount))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <Pagination page={page} perPage={PAGE_SIZE} total={mappings.data.total} onPageChange={setPage} />
            </div>
          ) : <EmptyState message="조건에 맞는 대출 상환 후보가 없습니다" />}
      </div>
    </div>
  )
}
