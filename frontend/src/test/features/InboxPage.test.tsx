import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { InboxPage } from '../../features/data/InboxPage'

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

const updateMutate = vi.fn().mockResolvedValue({})
const approveMutate = vi.fn().mockResolvedValue({ updated: 2 })

vi.mock('../../hooks/useCanonicalViews', () => ({
  useCanonicalViewsDashboard: () =>
    query({
      data_coverage: { first_transaction_date: '2025-03-12', last_transaction_date: '2026-06-10' },
      monthly_cashflow: [], true_spendable_monthly: [], loan_repayment_monthly: [],
      merchant_monthly_baseline: [], recurring_merchant_monthly: [],
      unclassified_work_queue: [
        { transaction_id: 1, date: '2026-06-01', type: '지출', merchant: 'SKT 자동납부', effective_category_major: '통신', effective_category_minor: null, amount: -106600, amount_abs: 106600, needs_cost_kind: true, needs_fixed_cost_necessity: false, needs_spend_necessity: true, needs_recurring_payment_kind: true, needs_loan_link_review: false, merchant_expense_count: 12, priority_score: 9, priority_reason: '월 단위 반복 신호가 있는 미분류 지출' },
      ],
    }),
}))

vi.mock('../../hooks/useAnalytics', () => ({
  useDiscretionaryVelocity: () => query({ classification_coverage_ratio: 0.76 }),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useRecurringCategoryRulesDryRun: () =>
    query({ items: [{ merchant: '넷플릭스', proposed_kind: 'monthly_recurring', confidence: 0.92, reason: '매월 반복', category_hint: '구독', apply_scope_options: ['all_matching', 'future_only'], matched_transactions: [{ id: 1, date: '2026-05-15', amount: -17000 }] }] }),
  useLoanTransactionMappings: () =>
    query({ total: 1, page: 1, per_page: 20, items: [{ transaction_id: 51, date: '2026-06-01', merchant: '국민은행 대출이자', amount: -1420000, effective_category_major: '금융', effective_category_minor: null, description: '', time: '', type: '지출', currency: 'KRW', payment_method: null, memo: null, link: null }] }),
  useLoanAccounts: () => query({ items: [{ loan_account_id: 1, lender: '국민은행', product_name: '주택담보대출', display_name_user: '우리집 주담대', display_name: '우리집 주담대', loan_kind: 'equal_principal_interest', loan_start_date: null, loan_maturity_date: null, latest_snapshot_date: null, latest_balance: null, latest_interest_rate: null }] }),
  useUpdateTransaction: () => ({ mutateAsync: updateMutate, isPending: false }),
  useApplyRecurringDryRun: () => ({ mutateAsync: approveMutate, isPending: false }),
  useBulkLinkTransactionsToLoan: () => ({ mutateAsync: vi.fn().mockResolvedValue({ updated: 1 }), isPending: false }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function renderPage() {
  return render(<MemoryRouter><InboxPage /></MemoryRouter>)
}

describe('InboxPage', () => {
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
      expect(updateMutate).toHaveBeenCalledWith({ id: 1, data: { cost_kind: 'fixed', spend_necessity: null, recurring_payment_kind: null } })
    })
  })
})
