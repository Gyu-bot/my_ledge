import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoansPage } from '../../features/data/LoansPage'

const mutationMocks = vi.hoisted(() => ({
  updateLoanAccount: vi.fn(),
}))

const state = vi.hoisted(() => ({
  includeHidden: false,
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
  useLoanSummary: () => query({ items: [] }),
  usePatchLoanRepaymentMetadata: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function renderPage() {
  return render(<MemoryRouter><LoansPage /></MemoryRouter>)
}

describe('LoansPage', () => {
  beforeEach(() => {
    mutationMocks.updateLoanAccount.mockClear()
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
        loan_kind: 'unknown',
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
        loan_kind: 'unknown',
        is_hidden: false,
      })
    })
  })
})
