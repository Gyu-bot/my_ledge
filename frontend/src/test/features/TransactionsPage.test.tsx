import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TransactionsPage } from '../../features/data/TransactionsPage'

const mutationMocks = vi.hoisted(() => ({
  bulkRestorePreview: vi.fn(),
  bulkRestore: vi.fn(),
}))

vi.mock('../../hooks/useTransactions', () => {
  const noop = () => ({ mutateAsync: vi.fn().mockResolvedValue({ updated: 1 }), isPending: false })
  const wrap = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: vi.fn() })
  return {
    useTransactionList: () =>
      wrap({
        total: 1, page: 1, per_page: 40,
        items: [
          { id: 1, date: '2026-06-09', time: '12:00:00', type: '지출', category_major: '식비', category_minor: '배달', category_major_user: null, category_minor_user: null, effective_category_major: '식비', effective_category_minor: '배달', description: '쿠팡이츠-원본', merchant: '쿠팡이츠', amount: -23000, currency: 'KRW', payment_method: '카드 A', cost_kind: 'variable', fixed_cost_necessity: null, spend_necessity: 'discretionary', cost_classification_source: 'auto', recurring_payment_kind: null, memo: null, is_deleted: false, merged_into_id: null, is_edited: false, source: 'import', created_at: '', updated_at: '' },
        ],
      }),
    useTransactionFilterOptions: () => wrap({ category_options: ['식비', '구독'], category_minor_options: ['배달'], category_minor_options_by_major: { 식비: ['배달'] }, payment_method_options: ['카드 A'] }),
    useUpdateTransaction: noop,
    useDeleteTransaction: noop,
    useRestoreTransaction: noop,
    useBulkUpdateTransactions: noop,
    useBulkDeletePreview: noop,
    useBulkDeleteTransactions: noop,
    useBulkRestorePreview: () => ({
      mutateAsync: mutationMocks.bulkRestorePreview.mockResolvedValue({
        count: 1,
        period_start: '2026-06-09',
        period_end: '2026-06-09',
        expense_total: -23000,
        representative_merchants: ['쿠팡이츠'],
      }),
      isPending: false,
    }),
    useBulkRestoreTransactions: () => ({
      mutateAsync: mutationMocks.bulkRestore.mockResolvedValue({
        updated: 1,
        preview: {
          count: 1,
          period_start: '2026-06-09',
          period_end: '2026-06-09',
          expense_total: -23000,
          representative_merchants: ['쿠팡이츠'],
        },
      }),
      isPending: false,
    }),
  }
})

vi.mock('../../hooks/useAnalytics', () => ({
  useRecurringPayments: () => ({
    data: { total: 1, page: 1, per_page: 20, items: [{ merchant: '넷플릭스', category: '구독', avg_amount: 17000, interval_type: 'monthly', avg_interval_days: 30, occurrences: 12, confidence: 0.9, last_date: '2026-06-01', recurring_payment_kind: 'monthly_recurring', installment_count: 0, monthly_recurring_count: 12, not_recurring_count: 0, unclassified_count: 0, transaction_ids: [1] }], assumptions: '' },
    isLoading: false, error: null, refetch: vi.fn(),
  }),
}))

vi.mock('../../hooks/useSettings', () => ({
  useAnalyticsSettings: () => ({
    data: {
      effective: {
        bulk_operations: {
          require_preview: true,
          require_confirmation: true,
          show_undo_after_delete: true,
          max_bulk_rows_without_extra_confirmation: 100,
        },
      },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function renderPage(path = '/data/transactions') {
  return render(<MemoryRouter initialEntries={[path]}><TransactionsPage /></MemoryRouter>)
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    mutationMocks.bulkRestorePreview.mockClear()
    mutationMocks.bulkRestore.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('행 보기: 거래 테이블과 필터 바를 렌더한다', () => {
    renderPage()
    expect(screen.getByText('필터')).toBeInTheDocument()
    expect(screen.getByText('쿠팡이츠')).toBeInTheDocument()
    expect(screen.getByText('-₩23,000')).toBeInTheDocument()
  })

  it('행 클릭 시 우측 편집 패널이 열린다 (출처 체인 표시)', () => {
    renderPage()
    fireEvent.click(screen.getByText('쿠팡이츠'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/쿠팡이츠-원본/)).toBeInTheDocument()
    expect(within(dialog).getByText(/자동 분류/)).toBeInTheDocument()
  })

  it('행 선택 시 하단 일괄 바가 나타난다', () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('쿠팡이츠 선택'))
    expect(screen.getByText('1건 선택됨')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '일괄 적용' })).toBeInTheDocument()
  })

  it('bulk restore는 preview 확인 후 실행한다', async () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('쿠팡이츠 선택'))
    fireEvent.click(screen.getByRole('button', { name: '복원' }))

    await waitFor(() => {
      expect(mutationMocks.bulkRestorePreview).toHaveBeenCalledWith({ ids: [1] })
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('1건 복원'))
      expect(mutationMocks.bulkRestore).toHaveBeenCalledWith({ ids: [1] })
    })
  })

  it('?view=groups 면 그룹 보기(반복 결제)를 렌더한다', () => {
    renderPage('/data/transactions?view=groups')
    expect(screen.getByText('반복 결제 후보')).toBeInTheDocument()
    expect(screen.getByText('넷플릭스')).toBeInTheDocument()
  })
})
