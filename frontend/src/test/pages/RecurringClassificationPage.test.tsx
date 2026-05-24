import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { RecurringClassificationPage } from '../../pages/RecurringClassificationPage'

const useRecurringPaymentsMock = vi.fn()
const useWriteAccessMock = vi.fn()
let bulkUpdateTransactionsMock = vi.fn()

vi.mock('../../hooks/useAnalytics', () => ({
  useRecurringPayments: (...args: unknown[]) => useRecurringPaymentsMock(...args),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useBulkUpdateTransactions: () => ({ mutateAsync: bulkUpdateTransactionsMock, isPending: false }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({
  useWriteAccess: () => useWriteAccessMock(),
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

beforeEach(() => {
  useWriteAccessMock.mockReturnValue(true)
  bulkUpdateTransactionsMock = vi.fn().mockResolvedValue({ updated: 2 })
  useRecurringPaymentsMock.mockReturnValue({
    data: {
      total: 1,
      page: 1,
      per_page: 20,
      assumptions: '동일 거래처 기준',
      items: [
        {
          merchant: '통신사',
          category: '통신',
          avg_amount: 90000,
          interval_type: 'monthly',
          avg_interval_days: 31,
          occurrences: 2,
          confidence: 0.99,
          last_date: '2026-02-01',
          recurring_payment_kind: null,
          installment_count: 0,
          monthly_recurring_count: 0,
          unclassified_count: 2,
          transaction_ids: [11, 12],
        },
        {
          merchant: '구독 서비스',
          category: '구독',
          avg_amount: 29000,
          interval_type: 'monthly',
          avg_interval_days: 30,
          occurrences: 3,
          confidence: 0.97,
          last_date: '2026-02-02',
          recurring_payment_kind: null,
          installment_count: 0,
          monthly_recurring_count: 0,
          unclassified_count: 3,
          transaction_ids: [21, 22, 23],
        },
      ],
    },
    isLoading: false,
  })
})

describe('RecurringClassificationPage', () => {
  it('updates a recurring payment group from the operations screen', async () => {
    wrap(<RecurringClassificationPage />)

    fireEvent.change(screen.getByLabelText('통신사 반복결제 분류'), {
      target: { value: 'monthly_recurring' },
    })

    await waitFor(() => {
      expect(bulkUpdateTransactionsMock).toHaveBeenCalledWith({
        ids: [11, 12],
        recurring_payment_kind: 'monthly_recurring',
      })
    })
    expect(await screen.findByText('통신사 분류 저장 완료')).toBeInTheDocument()
  })

  it('bulk-updates selected recurring payment groups from the current page', async () => {
    bulkUpdateTransactionsMock = vi.fn().mockResolvedValue({ updated: 5 })

    wrap(<RecurringClassificationPage />)

    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }))
    fireEvent.change(screen.getByLabelText('선택 그룹 반복결제 분류'), {
      target: { value: 'installment' },
    })
    fireEvent.click(screen.getByRole('button', { name: '선택 그룹 분류 적용' }))

    await waitFor(() => {
      expect(bulkUpdateTransactionsMock).toHaveBeenCalledWith({
        ids: [11, 12, 21, 22, 23],
        recurring_payment_kind: 'installment',
      })
    })
    expect(await screen.findByText('2개 그룹 분류 저장 완료')).toBeInTheDocument()
  })

  it('disables classification controls in read-only mode', () => {
    useWriteAccessMock.mockReturnValue(false)

    wrap(<RecurringClassificationPage />)

    expect(screen.getByText('읽기 전용 모드')).toBeInTheDocument()
    expect(screen.getByLabelText('통신사 반복결제 분류')).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' })).toBeDisabled()
  })
})
