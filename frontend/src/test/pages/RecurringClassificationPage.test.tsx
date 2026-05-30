import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { RecurringClassificationPage } from '../../pages/RecurringClassificationPage'

const useRecurringPaymentsMock = vi.fn()
const useWriteAccessMock = vi.fn()
let bulkUpdateTransactionsMock = vi.fn()
let applyRecurringDryRunMock = vi.fn()

vi.mock('../../hooks/useAnalytics', () => ({
  useRecurringPayments: (...args: unknown[]) => useRecurringPaymentsMock(...args),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useBulkUpdateTransactions: () => ({ mutateAsync: bulkUpdateTransactionsMock, isPending: false }),
  useRecurringCategoryRulesDryRun: () => ({
    data: {
      items: [
        {
          merchant: '왓챠',
          proposed_kind: 'installment',
          confidence: 1,
          matched_transactions: [
            { id: 31, date: '2026-01-05', amount: -12000 },
            { id: 32, date: '2026-02-05', amount: -12000 },
          ],
          reason: '반복 후보 조건과 카테고리 힌트가 일치합니다.',
          category_hint: '구독',
          apply_scope_options: ['all_matching', 'future_only'],
        },
      ],
    },
    isLoading: false,
  }),
  useApplyRecurringDryRun: () => ({ mutateAsync: applyRecurringDryRunMock, isPending: false }),
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
  applyRecurringDryRunMock = vi.fn().mockResolvedValue({ updated: 2 })
  useRecurringPaymentsMock.mockReturnValue({
    data: {
      total: 3,
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
          not_recurring_count: 0,
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
          not_recurring_count: 0,
          unclassified_count: 3,
          transaction_ids: [21, 22, 23],
        },
        {
          merchant: '쿠팡',
          category: '쇼핑',
          avg_amount: 42000,
          interval_type: 'monthly',
          avg_interval_days: 30,
          occurrences: 3,
          confidence: 0.95,
          last_date: '2026-02-03',
          recurring_payment_kind: 'installment',
          installment_count: 3,
          monthly_recurring_count: 0,
          not_recurring_count: 0,
          unclassified_count: 0,
          transaction_ids: [31, 32, 33],
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
        ids: [11, 12, 21, 22, 23, 31, 32, 33],
        recurring_payment_kind: 'installment',
      })
    })
    expect(await screen.findByText('3개 그룹 분류 저장 완료')).toBeInTheDocument()
  })

  it('can explicitly mark a candidate as not recurring', async () => {
    wrap(<RecurringClassificationPage />)

    fireEvent.change(screen.getByLabelText('통신사 반복결제 분류'), {
      target: { value: 'not_recurring' },
    })

    await waitFor(() => {
      expect(bulkUpdateTransactionsMock).toHaveBeenCalledWith({
        ids: [11, 12],
        recurring_payment_kind: 'not_recurring',
      })
    })
  })

  it('shows recurring dry-run proposals and applies the selected scope', async () => {
    wrap(<RecurringClassificationPage />)

    expect(screen.getByText('dry-run 승인 후보')).toBeInTheDocument()
    expect(screen.getByText('왓챠')).toBeInTheDocument()
    expect(screen.getAllByText('할부').length).toBeGreaterThan(0)
    expect(screen.getByText('confidence 100.0%')).toBeInTheDocument()
    expect(screen.getByText('카테고리 힌트 구독')).toBeInTheDocument()
    expect(screen.getByText('반복 후보 조건과 카테고리 힌트가 일치합니다.')).toBeInTheDocument()
    expect(screen.getByText('2026-01-05 · ₩ 12,000')).toBeInTheDocument()
    expect(screen.getByText('all_matching / future_only')).toBeInTheDocument()
    expect(screen.getByLabelText('왓챠 dry-run 적용 범위')).toHaveValue('all_matching')

    fireEvent.change(screen.getByLabelText('왓챠 dry-run 적용 범위'), {
      target: { value: 'all_matching' },
    })
    fireEvent.click(screen.getByRole('button', { name: '왓챠 dry-run 승인 적용' }))

    await waitFor(() => {
      expect(applyRecurringDryRunMock).toHaveBeenCalledWith({
        merchant: '왓챠',
        proposed_kind: 'installment',
        apply_scope: 'all_matching',
      })
    })
    expect(await screen.findByText('왓챠 dry-run 적용 완료')).toBeInTheDocument()
  })

  it('adds installment management links for saved installment groups and installment dry-run candidates', () => {
    wrap(<RecurringClassificationPage />)

    expect(screen.getByRole('link', { name: '쿠팡 할부 관리 이동' })).toHaveAttribute(
      'href',
      '/operations/installments?search=%EC%BF%A0%ED%8C%A1&linked=unlinked&prefill_merchant=%EC%BF%A0%ED%8C%A1&prefill_amount=42000',
    )
    expect(screen.getByRole('link', { name: '왓챠 할부 관리 이동' })).toHaveAttribute(
      'href',
      '/operations/installments?search=%EC%99%93%EC%B1%A0&linked=unlinked&prefill_merchant=%EC%99%93%EC%B1%A0&prefill_amount=12000',
    )
  })

  it('disables classification controls in read-only mode', () => {
    useWriteAccessMock.mockReturnValue(false)

    wrap(<RecurringClassificationPage />)

    expect(screen.getByText('읽기 전용 모드')).toBeInTheDocument()
    expect(screen.getByLabelText('통신사 반복결제 분류')).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '왓챠 dry-run 승인 적용' })).toBeDisabled()
  })
})
