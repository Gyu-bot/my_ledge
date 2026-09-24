import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { LoanItem } from '../../types/asset'
import { LoansPage } from '../../features/data/LoansPage'

const mutationMocks = vi.hoisted(() => ({
  updateLoanAccount: vi.fn(),
  patchRepayment: vi.fn(),
}))

const state = vi.hoisted(() => ({
  includeHidden: false,
  loans: [] as LoanItem[],
  loansLoading: false,
}))

const activeAccount = {
  loan_account_id: 1,
  lender: '국민은행',
  product_name: '활성대출',
  display_name_user: null,
  display_name: '국민은행 활성대출',
  loan_kind: 'unknown',
  loan_start_date: null,
  loan_maturity_date: null,
  as_of_date: '2026-05-31',
  latest_snapshot_date: '2026-05-31',
  is_active: true,
  is_hidden: false,
  is_matured: false,
  is_stale: false,
  lifecycle_status: 'active',
  latest_balance: '10000000.00',
  last_observed_balance: '10000000.00',
  last_observed_principal: null,
  last_observed_snapshot_date: '2026-05-31',
  included_in_active_summary: true,
  excluded_from_summary_reason: null,
  stable_identity_status: 'stable_lender_product',
  stable_identity_reason: null,
  latest_interest_rate: '3.45',
}

const hiddenAccount = {
  ...activeAccount,
  loan_account_id: 2,
  lender: '종료은행',
  product_name: '완납대출',
  display_name: '종료은행 완납대출',
  is_active: false,
  is_hidden: true,
  lifecycle_status: 'user_hidden',
  latest_balance: '0.00',
  last_observed_balance: '0.00',
  included_in_active_summary: false,
  excluded_from_summary_reason: 'user_hidden',
}

const query = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: vi.fn() })

vi.mock('../../hooks/useTransactions', () => ({
  useLoanAccounts: (params?: { include_hidden?: boolean }) => {
    state.includeHidden = Boolean(params?.include_hidden)
    return query({ items: params?.include_hidden ? [activeAccount, hiddenAccount] : [activeAccount] })
  },
  useUpdateLoanAccountMetadata: () => ({
    mutateAsync: mutationMocks.updateLoanAccount.mockResolvedValue(activeAccount),
    isPending: false,
  }),
  useLoanTransactionMappings: () => query({ total: 0, page: 1, per_page: 40, items: [] }),
  useBulkLinkTransactionsToLoan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLoanMerchantRules: () => query({ items: [] }),
  useUpsertLoanMerchantRule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApplyLoanMerchantRules: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTransactionFilterOptions: () => query({}),
}))

vi.mock('../../hooks/useAssets', () => ({
  useLoanSummary: () => ({ ...query({ items: state.loans }), isLoading: state.loansLoading }),
  usePatchLoanRepaymentMetadata: () => ({ mutateAsync: mutationMocks.patchRepayment.mockResolvedValue({}), isPending: false }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function renderPage() {
  return render(<MemoryRouter><LoansPage /></MemoryRouter>)
}

describe('LoansPage', () => {
  beforeEach(() => {
    mutationMocks.updateLoanAccount.mockClear()
    mutationMocks.patchRepayment.mockClear()
    state.loansLoading = false
    state.loans = [{ id: 9, lender: activeAccount.lender, product_name: activeAccount.product_name, loan_type: null, principal: null, balance: '10000000', interest_rate: null, monthly_payment: '90000', monthly_payment_source: 'estimated_from_linked_transactions', repayment_method: 'principal_interest', repayment_method_source: 'derived_from_loan_account', start_date: null, maturity_date: null }]
    state.includeHidden = false
  })

  it('계좌를 숨김 처리하고 숨김 포함 목록에서 다시 표시할 수 있다', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '숨김' }))

    await waitFor(() => {
      expect(mutationMocks.updateLoanAccount).toHaveBeenCalledWith({
        loan_account_id: 1,
        lender: null,
        product_name: null,
        is_hidden: true,
      })
    })

    fireEvent.click(screen.getByLabelText('숨김 포함'))

    expect(state.includeHidden).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '다시 표시' }))

    await waitFor(() => {
      expect(mutationMocks.updateLoanAccount).toHaveBeenLastCalledWith({
        loan_account_id: 2,
        lender: null,
        product_name: null,
        is_hidden: false,
      })
    })
  })
  it('계좌명만 저장하면 상환 메타와 대출 성격을 보내지 않는다', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('대출 계좌명'), { target: { value: '새 이름' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mutationMocks.updateLoanAccount).toHaveBeenCalledWith({ loan_account_id: 1, lender: null, product_name: null, display_name_user: '새 이름' }))
    expect(mutationMocks.patchRepayment).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('₩₩')
  })

  it('대출 성격만 저장해도 빈 수동 금액을 전송하지 않는다', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('대출 성격'), { target: { value: 'overdraft' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mutationMocks.updateLoanAccount).toHaveBeenCalledWith({ loan_account_id: 1, lender: null, product_name: null, loan_kind: 'overdraft' }))
    expect(mutationMocks.patchRepayment).not.toHaveBeenCalled()
  })

  it('상환 방식만 수정하면 수동 월상환액을 보존한다', async () => {
    state.loans[0] = { ...state.loans[0], monthly_payment_source: 'manual', monthly_payment: '123456' }
    renderPage()
    fireEvent.change(screen.getByLabelText('상환 방식'), { target: { value: 'interest_only' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mutationMocks.patchRepayment).toHaveBeenCalledWith({ id: 9, data: { repayment_method: 'interest_only' } }))
    expect(mutationMocks.updateLoanAccount).not.toHaveBeenCalled()
  })

  it('빈 수동 입력 저장을 차단하고 자동 복귀는 명시적 모드로 전송한다', async () => {
    state.loans[0] = { ...state.loans[0], monthly_payment_source: 'manual', monthly_payment: null, repayment_method_source: 'manual' }
    renderPage()
    fireEvent.change(screen.getByLabelText('수동 월상환액'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('수동 월상환액'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(mutationMocks.patchRepayment).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('월상환액 산정'), { target: { value: 'automatic' } })
    fireEvent.change(screen.getByLabelText('상환 방식'), { target: { value: 'automatic' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mutationMocks.patchRepayment).toHaveBeenCalledWith({ id: 9, data: { monthly_payment_mode: 'automatic', repayment_method_mode: 'automatic' } }))
  })

  it('상환 응답이 늦게 와도 편집 중 계좌명과 기존 수동 금액을 함께 보존한다', async () => {
    const loan = { ...state.loans[0], monthly_payment_source: 'manual' as const, monthly_payment: '123456' }
    state.loans = []
    state.loansLoading = true
    const view = renderPage()
    fireEvent.change(screen.getByLabelText('대출 계좌명'), { target: { value: '편집 중' } })
    state.loans = [loan]
    state.loansLoading = false
    view.rerender(<MemoryRouter><LoansPage /></MemoryRouter>)
    expect(screen.getByLabelText('대출 계좌명')).toHaveValue('편집 중')
    expect(screen.getByLabelText('수동 월상환액')).toHaveValue(123456)
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mutationMocks.updateLoanAccount).toHaveBeenCalled())
    expect(mutationMocks.patchRepayment).not.toHaveBeenCalled()
  })

  it('추정값 없음의 원인과 관측 월 근거를 표시한다', () => {
    state.loans[0] = { ...state.loans[0], monthly_payment: null, monthly_payment_missing_reason: 'insufficient_observations', monthly_payment_estimate_basis: 'median_closed_month_linked_repayments', monthly_payment_observation_months: ['2026-05'], monthly_payment_min_observations: 2, monthly_payment_estimate_window_start: '2026-01-01', monthly_payment_estimate_window_end: '2026-05-31' }
    renderPage()
    expect(screen.getByText('완료월 관측이 부족합니다')).toBeInTheDocument()
    expect(screen.getByText('관측 1개월 / 최소 2개월 (2026-05)')).toBeInTheDocument()
    expect(screen.getByText('완료월별 상환액 중앙값')).toBeInTheDocument()
  })

  it('자동 설정으로 원복하면 저장을 끄고 되돌린 필드는 다른 메타 저장에서도 제외한다', async () => {
    renderPage()
    const save = screen.getByRole('button', { name: '저장' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('월상환액 산정'), { target: { value: 'manual' } })
    expect(save).toBeDisabled()
    expect(screen.getByText('수동 월상환액을 0원 이상 입력하세요')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('수동 월상환액'), { target: { value: '150000' } })
    expect(save).toBeEnabled()
    fireEvent.change(screen.getByLabelText('월상환액 산정'), { target: { value: 'automatic' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('상환 방식'), { target: { value: 'interest_only' } })
    fireEvent.change(screen.getByLabelText('상환 방식'), { target: { value: 'automatic' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('대출 계좌명'), { target: { value: '이름만 변경' } })
    fireEvent.click(save)
    await waitFor(() => expect(mutationMocks.updateLoanAccount).toHaveBeenCalledWith({ loan_account_id: 1, lender: null, product_name: null, display_name_user: '이름만 변경' }))
    expect(mutationMocks.patchRepayment).not.toHaveBeenCalled()
  })

  it('저장된 수동 금액이 비어 있어도 다른 메타만 바꾸는 저장은 허용한다', async () => {
    state.loans[0] = { ...state.loans[0], monthly_payment_source: 'manual', monthly_payment: null }
    renderPage()
    fireEvent.change(screen.getByLabelText('대출 계좌명'), { target: { value: '새 계좌명' } })
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mutationMocks.updateLoanAccount).toHaveBeenCalledWith({ loan_account_id: 1, lender: null, product_name: null, display_name_user: '새 계좌명' }))
    expect(mutationMocks.patchRepayment).not.toHaveBeenCalled()
  })

})
