import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LoanMappingPage } from '../../pages/LoanMappingPage'
import type {
  LoanTransactionMappingListResponse,
  LoanTransactionMappingParams,
} from '../../types/transaction'

const mockUseLoanTransactionMappings = vi.fn<
  (params: LoanTransactionMappingParams) => {
    data: LoanTransactionMappingListResponse
    isLoading: boolean
  }
>()
const mockUseWriteAccess = vi.fn<() => boolean>()
let bulkLoanLinkMutate = vi.fn()
let updateLoanAccountMetadataMutate = vi.fn()

vi.mock('../../hooks/useWriteAccess', () => ({
  useWriteAccess: () => mockUseWriteAccess(),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useLoanTransactionMappings: (params: LoanTransactionMappingParams) =>
    mockUseLoanTransactionMappings(params),
  useLoanAccounts: () => ({
    data: {
      items: [
        {
          loan_account_id: null,
          lender: '국민은행',
          product_name: '주택담보대출',
          display_name_user: null,
          display_name: '국민은행 주택담보대출',
          loan_kind: 'unknown',
          latest_snapshot_date: '2026-05-31',
          latest_balance: '209500000.00',
          latest_interest_rate: '3.45',
        },
      ],
    },
  }),
  useBulkLinkTransactionsToLoan: () => ({ mutateAsync: bulkLoanLinkMutate, isPending: false }),
  useUpdateLoanAccountMetadata: () => ({
    mutateAsync: updateLoanAccountMetadataMutate,
    isPending: false,
  }),
}))

vi.mock('../../components/layout/chromeContext', () => ({
  useChromeContext: () => ({ setMetaBadge: vi.fn() }),
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function response(): LoanTransactionMappingListResponse {
  return {
    total: 2,
    page: 1,
    per_page: 40,
    items: [
      {
        transaction_id: 41,
        date: '2026-05-20',
        time: '09:00:00',
        type: '지출',
        effective_category_major: '금융',
        effective_category_minor: '대출상환',
        description: '국민은행 원리금 상환',
        merchant: '국민은행',
        amount: -650000,
        currency: 'KRW',
        payment_method: '국민은행 계좌',
        memo: null,
        link: {
          transaction_id: 41,
          loan_account_id: 1,
          lender: '국민은행',
          product_name: '주택담보대출',
          display_name_user: null,
          display_name: '국민은행 주택담보대출',
          loan_kind: 'unknown',
          repayment_type: 'mixed',
          source: 'manual',
          memo: '자동 연결',
          created_at: '2026-05-24T09:00:00',
          updated_at: '2026-05-24T09:00:00',
        },
      },
      {
        transaction_id: 42,
        date: '2026-05-19',
        time: '10:00:00',
        type: '지출',
        effective_category_major: '금융',
        effective_category_minor: '대출이자',
        description: '카카오뱅크 대출이자',
        merchant: '카카오뱅크',
        amount: -120000,
        currency: 'KRW',
        payment_method: '카카오뱅크 계좌',
        memo: null,
        link: null,
      },
    ],
  }
}

beforeEach(() => {
  mockUseWriteAccess.mockReturnValue(true)
  bulkLoanLinkMutate = vi.fn().mockResolvedValue({ updated: 2 })
  updateLoanAccountMetadataMutate = vi.fn().mockResolvedValue({
    loan_account_id: 1,
    lender: '국민은행',
    product_name: '주택담보대출',
    display_name_user: '우리집 주담대',
    display_name: '우리집 주담대',
    loan_kind: 'equal_principal_interest',
    latest_snapshot_date: '2026-05-31',
    latest_balance: '209500000.00',
    latest_interest_rate: '3.45',
  })
  mockUseLoanTransactionMappings.mockImplementation(() => ({
    data: response(),
    isLoading: false,
  }))
})

describe('LoanMappingPage', () => {
  it('shows the current loan account for linked expense transactions', () => {
    wrap(<LoanMappingPage />)

    expect(screen.getAllByText('국민은행 주택담보대출').length).toBeGreaterThan(0)
    expect(screen.getAllByText('원리금').length).toBeGreaterThan(0)
    expect(screen.getAllByText('미연결').length).toBeGreaterThan(0)
  })

  it('bulk-links selected transactions from the separate loan mapping screen', async () => {
    wrap(<LoanMappingPage />)

    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }))
    fireEvent.change(screen.getByLabelText('대출 계좌'), {
      target: { value: 'pair:국민은행:주택담보대출' },
    })
    fireEvent.click(screen.getByRole('button', { name: '대출 연결' }))

    await waitFor(() => {
      expect(bulkLoanLinkMutate).toHaveBeenCalledWith({
        transaction_ids: [41, 42],
        loan_account_id: null,
        lender: '국민은행',
        product_name: '주택담보대출',
        repayment_type: 'mixed',
        memo: null,
      })
    })
  })

  it('edits loan account display name and loan kind in a separate account section', async () => {
    wrap(<LoanMappingPage />)

    expect(screen.getByText('대출 계좌 관리')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('대출 계좌명'), {
      target: { value: '우리집 주담대' },
    })
    fireEvent.change(screen.getByLabelText('대출 성격'), {
      target: { value: 'equal_principal_interest' },
    })
    fireEvent.click(screen.getByRole('button', { name: '계좌 정보 저장' }))

    await waitFor(() => {
      expect(updateLoanAccountMetadataMutate).toHaveBeenCalledWith({
        loan_account_id: null,
        lender: '국민은행',
        product_name: '주택담보대출',
        display_name_user: '우리집 주담대',
        loan_kind: 'equal_principal_interest',
      })
    })
  })
})
