import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { InboxPage } from '../../features/data/InboxPage'

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

const updateMutate = vi.fn().mockResolvedValue({})
const approveMutate = vi.fn().mockResolvedValue({ updated: 2 })
const linkMutate = vi.fn().mockResolvedValue({ updated: 1 })
const reviewMutate = vi.fn()
const canonicalParams = vi.fn()
let queueTotal = 1
let existingClassification = { cost_kind: null as 'fixed' | 'variable' | null, spend_necessity: null as 'essential' | 'discretionary' | null, fixed_cost_necessity: null, recurring_payment_kind: null as 'monthly_recurring' | null }

const loanCandidate = {
  transaction_id: 51,
  date: '2026-06-01',
  merchant: '국민은행 대출이자',
  amount: -1420000,
  effective_category_major: '금융',
  effective_category_minor: null,
  description: '',
  time: '',
  type: '지출',
  currency: 'KRW',
  payment_method: null,
  memo: null,
  link: null,
} as const

let hasWriteAccess = true
let reviewIsPending = false
let loanMappingData = {
  total: 1,
  page: 1,
  per_page: 20,
  items: [loanCandidate],
}

function resetLoanMappingData() {
  loanMappingData = {
    total: 1,
    page: 1,
    per_page: 20,
    items: [loanCandidate],
  }
}

vi.mock('../../hooks/useCanonicalViews', () => ({
  useCanonicalViewsDashboard: (params: unknown) => { canonicalParams(params); return query({
      unclassified_work_queue_total: queueTotal,
      data_coverage: { first_transaction_date: '2025-03-12', last_transaction_date: '2026-06-10' },
      monthly_cashflow: [], true_spendable_monthly: [], loan_repayment_monthly: [],
      merchant_monthly_baseline: [], recurring_merchant_monthly: [],
      unclassified_work_queue: [
        { ...existingClassification, transaction_id: 1, date: '2026-06-01', type: '지출', merchant: 'SKT 자동납부', effective_category_major: '통신', effective_category_minor: null, amount: -106600, amount_abs: 106600, needs_cost_kind: true, needs_fixed_cost_necessity: false, needs_spend_necessity: true, needs_recurring_payment_kind: true, needs_loan_link_review: false, merchant_expense_count: 12, priority_score: 9, priority_reason: '월 단위 반복 신호가 있는 미분류 지출' },
      ],
    }) },
}))

vi.mock('../../hooks/useAnalytics', () => ({
  useDiscretionaryVelocity: () => query({ classification_coverage_ratio: 0.76 }),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useRecurringCategoryRulesDryRun: () =>
    query({ items: [{ merchant: '넷플릭스', proposed_kind: 'monthly_recurring', confidence: 0.92, reason: '매월 반복', category_hint: '구독', preview_token: 'preview-1', default_apply_scope: 'all_matching', apply_scope_options: ['all_matching', 'reviewed_only'], matched_transactions: [{ id: 1, date: '2026-05-15', amount: -17000 }] }] }),
  useLoanTransactionMappings: () =>
    query(loanMappingData),
  useLoanAccounts: () => query({ items: [{ loan_account_id: 1, lender: '국민은행', product_name: '주택담보대출', display_name_user: '우리집 주담대', display_name: '우리집 주담대', loan_kind: 'equal_principal_interest', loan_start_date: null, loan_maturity_date: null, as_of_date: null, latest_snapshot_date: null, is_active: true, is_hidden: false, is_matured: false, is_stale: false, lifecycle_status: 'active', latest_balance: null, last_observed_balance: null, last_observed_principal: null, last_observed_snapshot_date: null, included_in_active_summary: true, excluded_from_summary_reason: null, stable_identity_status: 'stable_lender_product', stable_identity_reason: null, latest_interest_rate: null }] }),
  useUpdateTransaction: () => ({ mutateAsync: updateMutate, isPending: false }),
  useApplyRecurringDryRun: () => ({ mutateAsync: approveMutate, isPending: false }),
  useBulkLinkTransactionsToLoan: () => ({ mutateAsync: linkMutate, isPending: false }),
  useReviewLoanTransactionCandidate: () => ({ mutateAsync: reviewMutate, isPending: reviewIsPending }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => hasWriteAccess }))

function renderPage() {
  return render(<MemoryRouter><InboxPage /></MemoryRouter>)
}

describe('InboxPage', () => {
  beforeEach(() => {
    queueTotal = 1
    canonicalParams.mockClear()
    existingClassification = { cost_kind: null, spend_necessity: null, fixed_cost_necessity: null, recurring_payment_kind: null }
    hasWriteAccess = true
    reviewIsPending = false
    resetLoanMappingData()
    updateMutate.mockClear()
    approveMutate.mockClear()
    linkMutate.mockClear()
    reviewMutate.mockReset()
    reviewMutate.mockImplementation(async () => {
      loanMappingData = {
        ...loanMappingData,
        total: 0,
        items: [],
      }
      return {
        candidate_key: 'loan_transaction:51',
        candidate_type: 'loan_transaction',
        transaction_id: 51,
        review_status: 'not_candidate',
        memo: null,
        reviewed_at: '2026-06-27T09:00:00Z',
      }
    })
  })

  it('3종 카드(승인 대기·미분류·대출 연결)와 커버리지 게이지를 렌더한다', () => {
    renderPage()
    expect(screen.getByText('승인 대기')).toBeInTheDocument()
    expect(screen.getByText('넷플릭스')).toBeInTheDocument()
    expect(screen.getByText('미분류')).toBeInTheDocument()
    expect(screen.getByText('SKT 자동납부')).toBeInTheDocument()
    expect(screen.getByText('대출 연결 후보')).toBeInTheDocument()
    expect(screen.getByText('76%')).toBeInTheDocument()
  })

  it('탭 카운트를 표시한다 (전체 3 = 미분류1 + 승인1 + 대출1)', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /전체 3/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /승인 대기 1/ })).toBeInTheDocument()
  })

  it('미분류 카드에서 분류 저장 시 해당 거래를 업데이트한다', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('고정/변동', { selector: 'select' }), { target: { value: 'fixed' } })
    fireEvent.click(screen.getAllByRole('button', { name: '저장' })[0])
    await waitFor(() => {
      expect(updateMutate).toHaveBeenCalledWith({ id: 1, data: { cost_kind: 'fixed' } })
    })
  })

  it('대출 후보 카드에 대출 후보 아님 액션을 노출하고 클릭 시 not_candidate 리뷰를 보낸다', async () => {
    renderPage()

    const dismissButton = screen.getByRole('button', { name: '대출 후보 아님' })
    expect(dismissButton).toBeInTheDocument()

    fireEvent.click(dismissButton)

    await waitFor(() => {
      expect(reviewMutate).toHaveBeenCalledWith({
        transactionId: 51,
        data: { review_status: 'not_candidate' },
      })
    })
  })

  it('대출 후보 아님 처리 성공 후 재조회 결과를 반영해 대출 후보 행과 카운트를 숨긴다', async () => {
    const view = renderPage()

    fireEvent.click(screen.getByRole('button', { name: '대출 후보 아님' }))

    await waitFor(() => {
      expect(reviewMutate).toHaveBeenCalledTimes(1)
    })

    view.rerender(<MemoryRouter><InboxPage /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.queryByText('국민은행 대출이자')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /전체 2/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /대출 연결 0/ })).toBeInTheDocument()
    })
  })
  it('기존 분류를 채우고 수정한 필요도만 저장하며 거래 ID로 이동한다', async () => {
    existingClassification = { cost_kind: 'fixed', spend_necessity: 'essential', fixed_cost_necessity: null, recurring_payment_kind: 'monthly_recurring' }
    renderPage()
    expect(screen.getByLabelText('고정/변동', { selector: 'select' })).toHaveValue('fixed')
    expect(screen.getByLabelText('반복', { selector: 'select' })).toHaveValue('monthly_recurring')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '거래에서 열기' })).toHaveAttribute('href', '/data/transactions?transaction_id=1')
    fireEvent.change(screen.getByLabelText('필수/재량', { selector: 'select' }), { target: { value: 'discretionary' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(updateMutate).toHaveBeenCalledWith({ id: 1, data: { spend_necessity: 'discretionary' } }))
  })

  it('전체수와 페이지/검색 필터를 서버로 전달한다', () => {
    queueTotal = 2034
    renderPage()
    expect(screen.getByRole('tab', { name: /미분류 2034/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(canonicalParams).toHaveBeenLastCalledWith(expect.objectContaining({ queue_page: 2, queue_limit: 20 }))
    fireEvent.change(screen.getByLabelText('거래처 검색'), { target: { value: '은행' } })
    fireEvent.change(screen.getByLabelText('미분류 항목'), { target: { value: 'cost_kind' } })
    expect(canonicalParams).toHaveBeenLastCalledWith(expect.objectContaining({ queue_page: 1, search: '은행', issue_types: 'cost_kind' }))
  })

  it('반복 승인에는 미리보기 토큰과 정확한 ID를 보낸다', async () => {
    renderPage()
    expect(screen.queryByRole('option', { name: 'future_only' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '승인 적용 (1건)' }))
    await waitFor(() => expect(approveMutate).toHaveBeenCalledWith({ merchant: '넷플릭스', proposed_kind: 'monthly_recurring', apply_scope: 'all_matching', preview_token: 'preview-1', transaction_ids: [1] }))
  })

  it('직접 검토 범위는 거래를 체크해야 승인할 수 있다', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('적용 범위'), { target: { value: 'reviewed_only' } })
    expect(screen.getByRole('button', { name: '승인 적용 (0건)' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /넷플릭스.*검토/ }))
    fireEvent.click(screen.getByRole('button', { name: '승인 적용 (1건)' }))
    await waitFor(() => expect(approveMutate).toHaveBeenCalledWith(expect.objectContaining({ apply_scope: 'reviewed_only', transaction_ids: [1] })))
  })

  it('명시적으로 지운 필요도는 null로 보내고 다른 분류는 유지한다', async () => {
    existingClassification = { cost_kind: 'fixed', spend_necessity: 'essential', fixed_cost_necessity: null, recurring_payment_kind: 'monthly_recurring' }
    renderPage()
    fireEvent.change(screen.getByLabelText('필수/재량', { selector: 'select' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(updateMutate).toHaveBeenCalledWith({ id: 1, data: { spend_necessity: null } }))
  })

  it('오래된 반복 미리보기는 재조회 안내 후 재승인을 차단한다', async () => {
    approveMutate.mockRejectedValueOnce(new Error('409: preview changed'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '승인 적용 (1건)' }))
    await screen.findByRole('button', { name: '미리보기 다시 조회' })
    expect(screen.getByRole('button', { name: '승인 적용 (1건)' })).toBeDisabled()
    expect(approveMutate).toHaveBeenCalledTimes(1)
  })

})
