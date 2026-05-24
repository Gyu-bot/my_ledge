import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WorkbenchPage } from '../../pages/WorkbenchPage'
import type {
  TransactionFilterOptionsResponse,
  TransactionListParams,
  TransactionListResponse,
  TransactionResponse,
} from '../../types/transaction'

const mockUseTransactionList = vi.fn<(params?: TransactionListParams) => { data: TransactionListResponse; isLoading: boolean }>()
const mockUseWriteAccess = vi.fn<() => boolean>()
const updateTransactionMock = vi.fn()
const bulkUpdateTransactionsMock = vi.fn()

function buildTransaction(overrides: Partial<TransactionResponse>): TransactionResponse {
  return {
    id: 1,
    date: '2026-04-01',
    time: '09:00:00',
    type: '지출',
    category_major: '식비',
    category_minor: null,
    category_major_user: null,
    category_minor_user: null,
    effective_category_major: '식비',
    effective_category_minor: null,
    description: '기본 거래',
    merchant: '기본 거래처',
    amount: -12000,
    currency: 'KRW',
    payment_method: '카드',
    cost_kind: null,
    fixed_cost_necessity: null,
    recurring_payment_kind: null,
    memo: null,
    is_deleted: false,
    merged_into_id: null,
    is_edited: false,
    source: 'import',
    created_at: '2026-04-01T09:00:00',
    updated_at: '2026-04-01T09:00:00',
    ...overrides,
  }
}

let filterOptions: TransactionFilterOptionsResponse = {
  category_options: ['식비'],
  category_minor_options: ['배달', '외식'],
  category_minor_options_by_major: { 식비: ['배달', '외식'] },
  payment_method_options: ['카드'],
}

vi.mock('../../hooks/useWriteAccess', () => ({
  useWriteAccess: () => mockUseWriteAccess(),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionList: (params: TransactionListParams) => mockUseTransactionList(params),
  useTransactionFilterOptions: () => ({
    data: filterOptions,
  }),
  useUpdateTransaction: () => ({ mutateAsync: updateTransactionMock }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn() }),
  useRestoreTransaction: () => ({ mutateAsync: vi.fn() }),
  useBulkUpdateTransactions: () => ({ mutateAsync: bulkUpdateTransactionsMock }),
}))

vi.mock('../../hooks/useUpload', () => ({
  useUploadLogs: () => ({ data: { items: [] }, isLoading: false }),
  useUploadFile: () => ({ mutateAsync: vi.fn() }),
  useResetData: () => ({ mutateAsync: vi.fn() }),
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
  filterOptions = {
    category_options: ['식비'],
    category_minor_options: ['배달', '외식'],
    category_minor_options_by_major: { 식비: ['배달', '외식'] },
    payment_method_options: ['카드'],
  }
  mockUseWriteAccess.mockReturnValue(false)
  updateTransactionMock.mockReset()
  updateTransactionMock.mockResolvedValue({ id: 1 })
  bulkUpdateTransactionsMock.mockReset()
  bulkUpdateTransactionsMock.mockResolvedValue({ updated: 1 })
  mockUseTransactionList.mockImplementation(() => ({
    data: { total: 1, page: 1, per_page: 20, items: [] },
    isLoading: false,
  }))
})

describe('WorkbenchPage', () => {
  it('requests 40 transactions per page', () => {
    wrap(<WorkbenchPage />)

    expect(mockUseTransactionList).toHaveBeenCalled()
    expect(mockUseTransactionList.mock.lastCall?.[0]).toMatchObject({ page: 1, per_page: 40 })
  })

  it('renders the read-only banner when write access is unavailable', () => {
    wrap(<WorkbenchPage />)

    expect(screen.getByText('읽기 전용 모드')).toBeInTheDocument()
    expect(screen.getByText(/API 키가 없어 업로드·수정·삭제·초기화가 비활성화됩니다/)).toBeInTheDocument()
  })

  it('uses the shared badge style for the transaction page/count indicator', () => {
    wrap(<WorkbenchPage />)

    const badge = screen.getByText('1 / 1 페이지 · 1건')
    expect(badge.className).toContain('border-border-subtle')
    expect(badge.className).toContain('rounded-full')
    expect(badge.className).toContain('text-text-muted')
  })

  it('selects every visible transaction on the current page from the header checkbox', () => {
    mockUseTransactionList.mockImplementation(() => ({
      data: {
        total: 3,
        page: 1,
        per_page: 40,
        items: [
          buildTransaction({ id: 11, description: '점심', merchant: '회사 근처 식당' }),
          buildTransaction({ id: 12, description: '커피', merchant: '카페', amount: -4500 }),
          buildTransaction({ id: 13, description: '삭제된 거래', merchant: '삭제', is_deleted: true }),
        ],
      },
      isLoading: false,
    }))

    wrap(<WorkbenchPage />)

    const checkboxes = screen.getAllByRole('checkbox')
    const selectPageCheckbox = checkboxes[2]

    fireEvent.click(selectPageCheckbox)

    expect(screen.getByText('2건 선택됨')).toBeInTheDocument()
    expect((screen.getAllByRole('checkbox')[2] as HTMLInputElement).checked).toBe(true)
    expect((screen.getAllByRole('checkbox')[3] as HTMLInputElement).checked).toBe(true)
    expect((screen.getAllByRole('checkbox')[4] as HTMLInputElement).checked).toBe(true)
  })

  it('renders effective subcategory in the table and uses selects for bulk category inputs', () => {
    mockUseWriteAccess.mockReturnValue(true)
    mockUseTransactionList.mockImplementation(() => ({
      data: {
        total: 1,
        page: 1,
        per_page: 40,
        items: [
          buildTransaction({
            id: 21,
            description: '배달 주문',
            merchant: '배달앱',
            effective_category_minor: '배달',
          }),
        ],
      },
      isLoading: false,
    }))

    wrap(<WorkbenchPage />)

    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }))

    expect(screen.getAllByText('배달').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('combobox')).toHaveLength(11)
    expect(screen.getAllByRole('option', { name: '식비' }).length).toBeGreaterThan(0)
  })

  it('does not expose recurring classification in bulk edit controls or payloads', async () => {
    mockUseWriteAccess.mockReturnValue(true)
    mockUseTransactionList.mockImplementation(() => ({
      data: {
        total: 1,
        page: 1,
        per_page: 40,
        items: [
          buildTransaction({
            id: 22,
            description: '정기 결제',
            merchant: '구독 서비스',
            recurring_payment_kind: 'installment',
          }),
        ],
      },
      isLoading: false,
    }))

    wrap(<WorkbenchPage />)

    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }))

    expect(screen.getByText('선택한 행에 같은 값을 일괄 적용합니다.')).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(11)
    fireEvent.click(screen.getByRole('button', { name: '일괄 적용' }))

    await waitFor(() => {
      expect(bulkUpdateTransactionsMock).toHaveBeenCalledWith(expect.not.objectContaining({
        recurring_payment_kind: expect.anything(),
      }))
    })
  })

  it('keeps recurring classification out of single-row update payloads', async () => {
    mockUseWriteAccess.mockReturnValue(true)
    mockUseTransactionList.mockImplementation(() => ({
      data: {
        total: 1,
        page: 1,
        per_page: 40,
        items: [
          buildTransaction({
            id: 23,
            description: '정기 결제',
            merchant: '구독 서비스',
            recurring_payment_kind: 'installment',
          }),
        ],
      },
      isLoading: false,
    }))

    wrap(<WorkbenchPage />)

    fireEvent.click(screen.getByRole('button', { name: '✎' }))
    fireEvent.click(screen.getByRole('button', { name: '✓' }))

    await waitFor(() => {
      expect(updateTransactionMock).toHaveBeenCalledWith({
        id: 23,
        data: expect.not.objectContaining({
          recurring_payment_kind: expect.anything(),
        }),
      })
    })
  })

  it('applies cost and recurring classification filters to the transaction query', () => {
    mockUseTransactionList.mockImplementation(() => ({
      data: { total: 0, page: 1, per_page: 40, items: [] },
      isLoading: false,
    }))

    wrap(<WorkbenchPage />)

    fireEvent.change(screen.getByLabelText('고정비/변동비 필터'), { target: { value: 'fixed' } })
    fireEvent.change(screen.getByLabelText('고정비 필수 여부 필터'), { target: { value: 'essential' } })
    fireEvent.change(screen.getByLabelText('반복결제 분류 필터'), { target: { value: 'installment' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))

    expect(mockUseTransactionList.mock.lastCall?.[0]).toMatchObject({
      cost_kind: 'fixed',
      fixed_cost_necessity: 'essential',
      recurring_payment_kind: 'installment',
    })
  })

  it('falls back to current transaction data when the filter-options response has no subcategory metadata', () => {
    filterOptions = {
      category_options: ['식비'],
      category_minor_options: [],
      category_minor_options_by_major: {},
      payment_method_options: ['카드'],
    }
    mockUseWriteAccess.mockReturnValue(true)
    mockUseTransactionList.mockImplementation(() => ({
      data: {
        total: 2,
        page: 1,
        per_page: 40,
        items: [
          buildTransaction({
            id: 31,
            effective_category_major: '식비',
            effective_category_minor: '배달',
          }),
          buildTransaction({
            id: 32,
            effective_category_major: '식비',
            effective_category_minor: '외식',
            description: '외식',
          }),
        ],
      },
      isLoading: false,
    }))

    wrap(<WorkbenchPage />)

    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }))

    expect(screen.getAllByRole('option', { name: '배달' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('option', { name: '외식' }).length).toBeGreaterThan(0)
  })
})
