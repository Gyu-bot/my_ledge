import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { InstallmentsPage } from '../../pages/InstallmentsPage'

const useWriteAccessMock = vi.fn()
const useInstallmentPlansMock = vi.fn()
const useInstallmentTransactionMappingsMock = vi.fn()
const useInstallmentForecastMock = vi.fn()
let createInstallmentPlanMock = vi.fn()
let linkTransactionToInstallmentMock = vi.fn()
let bulkLinkTransactionsToInstallmentMock = vi.fn()

vi.mock('../../hooks/useWriteAccess', () => ({
  useWriteAccess: () => useWriteAccessMock(),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useInstallmentPlans: () => useInstallmentPlansMock(),
  useInstallmentTransactionMappings: (...args: unknown[]) => useInstallmentTransactionMappingsMock(...args),
  useInstallmentForecast: () => useInstallmentForecastMock(),
  useCreateInstallmentPlan: () => ({ mutateAsync: createInstallmentPlanMock, isPending: false }),
  usePatchInstallmentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLinkTransactionToInstallment: () => ({
    mutateAsync: linkTransactionToInstallmentMock,
    isPending: false,
  }),
  useUnlinkTransactionFromInstallment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBulkLinkTransactionsToInstallment: () => ({
    mutateAsync: bulkLinkTransactionsToInstallmentMock,
    isPending: false,
  }),
}))

vi.mock('../../components/layout/chromeContext', () => ({
  useChromeContext: () => ({ setMetaBadge: vi.fn() }),
}))

function wrap(ui: React.ReactNode, initialEntries: string[] = ['/operations/installments']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useWriteAccessMock.mockReturnValue(true)
  createInstallmentPlanMock = vi.fn().mockResolvedValue({ id: 2 })
  linkTransactionToInstallmentMock = vi.fn().mockResolvedValue({ transaction_id: 11 })
  bulkLinkTransactionsToInstallmentMock = vi.fn().mockResolvedValue({ updated: 1 })
  useInstallmentPlansMock.mockReturnValue({
    data: {
      items: [
        {
          id: 1,
          display_name: '맥북 3개월 할부',
          merchant: '애플',
          payment_method: '카드',
          total_installments: 3,
          monthly_amount: 100000,
          first_payment_date: '2026-05-10',
          status: 'active',
          memo: null,
          linked_installment_count: 0,
          created_at: '2026-05-30T00:00:00',
          updated_at: '2026-05-30T00:00:00',
        },
      ],
    },
    isLoading: false,
  })
  useInstallmentTransactionMappingsMock.mockReturnValue({
    data: {
      total: 1,
      page: 1,
      per_page: 40,
      items: [
        {
          transaction_id: 11,
          date: '2026-05-10',
          time: '09:00:00',
          type: '지출',
          effective_category_major: '쇼핑',
          effective_category_minor: '전자제품',
          description: '애플',
          merchant: '애플',
          amount: -100000,
          currency: 'KRW',
          payment_method: '카드',
          memo: null,
          recurring_payment_kind: 'installment',
          link: null,
        },
      ],
    },
    isLoading: false,
  })
  useInstallmentForecastMock.mockReturnValue({
    data: {
      items: [
        {
          installment_plan_id: 1,
          installment_plan_display_name: '맥북 3개월 할부',
          installment_number: 3,
          total_installments: 3,
          due_date: '2026-07-10',
          period: '2026-07',
          amount: 100000,
          status: 'projected',
          transaction_id: null,
        },
      ],
      monthly_summary: [
        {
          period: '2026-07',
          observed_total: 0,
          projected_total: 100000,
          missed_total: 0,
        },
      ],
    },
    isLoading: false,
  })
})

describe('InstallmentsPage', () => {
  it('labels the candidate search box as searching merchant, original description, and memo', () => {
    wrap(<InstallmentsPage />)

    expect(screen.getByPlaceholderText('거래처·원본 설명·메모 검색')).toBeInTheDocument()
  })

  it('renders plan management, transaction linking, and forecast sections', () => {
    wrap(<InstallmentsPage />)

    expect(screen.getByText('할부 항목 관리')).toBeInTheDocument()
    expect(screen.getByText('거래 연결 후보')).toBeInTheDocument()
    expect(screen.getByText('월별 남은 할부 예측')).toBeInTheDocument()
    expect(screen.getAllByText('맥북 3개월 할부').length).toBeGreaterThan(0)
    expect(screen.getByText('2026-07')).toBeInTheDocument()
    expect(screen.getByText('예정')).toBeInTheDocument()
  })

  it('creates a plan and links a transaction', async () => {
    wrap(<InstallmentsPage />)

    fireEvent.change(screen.getByLabelText('할부명'), { target: { value: '아이패드 2개월' } })
    fireEvent.change(screen.getByLabelText('거래처'), { target: { value: '애플' } })
    fireEvent.change(screen.getByLabelText('총 개월'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('월 납입액'), { target: { value: '80000' } })
    fireEvent.change(screen.getByLabelText('첫 청구일'), { target: { value: '2026-06-10' } })
    fireEvent.click(screen.getByRole('button', { name: '할부 항목 저장' }))

    await waitFor(() => {
      expect(createInstallmentPlanMock).toHaveBeenCalledWith({
        display_name: '아이패드 2개월',
        merchant: '애플',
        payment_method: null,
        total_installments: 2,
        monthly_amount: 80000,
        first_payment_date: '2026-06-10',
        memo: null,
      })
    })

    fireEvent.change(screen.getByLabelText('애플 연결 할부'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('애플 회차'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '애플 연결' }))

    await waitFor(() => {
      expect(linkTransactionToInstallmentMock).toHaveBeenCalledWith({
        id: 11,
        data: {
          installment_plan_id: 1,
          installment_number: 1,
          memo: null,
        },
      })
    })
  })

  it('hydrates filters and new-plan draft from query params and shows helper copy for numeric fields', () => {
    wrap(
      <InstallmentsPage />,
      ['/operations/installments?search=%EC%95%A0%ED%94%8C&linked=unlinked&prefill_merchant=%EC%95%A0%ED%94%8C&prefill_amount=120000'],
    )

    expect(useInstallmentTransactionMappingsMock).toHaveBeenCalledWith(expect.objectContaining({
      search: '애플',
      linked: 'unlinked',
    }))
    expect(screen.getByLabelText('후보 검색어')).toHaveValue('애플')
    expect(screen.getByLabelText('후보 연결 상태')).toHaveValue('unlinked')
    expect(screen.getByLabelText('거래처')).toHaveValue('애플')
    expect(screen.getByLabelText('월 납입액')).toHaveValue(120000)
    expect(screen.getByText('카드 할부 전체 회차')).toBeInTheDocument()
    expect(screen.getByText('매월 청구 예상액')).toBeInTheDocument()
    expect(screen.getByText('1회차 청구 날짜')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }))

    expect(screen.getAllByText('선택한 첫 거래가 몇 회차인지').length).toBeGreaterThan(0)
    expect(screen.getAllByText('이 거래가 전체 할부 중 몇 번째인지').length).toBeGreaterThan(0)
  })

  it('disables write controls in read-only mode', () => {
    useWriteAccessMock.mockReturnValue(false)

    wrap(<InstallmentsPage />)

    expect(screen.getByText('읽기 전용 모드')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '할부 항목 저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '애플 연결' })).toBeDisabled()
  })
})
