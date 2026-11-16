import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { TransactionsPage } from '../../features/data/TransactionsPage'
import type { TransactionNature } from '../../types/nature'
import type { TransactionListParams, TransactionResponse } from '../../types/transaction'

const mocks = vi.hoisted(() => ({
  bulkUpdate: vi.fn(),
  update: vi.fn(),
  bulkRestorePreview: vi.fn(),
  bulkRestore: vi.fn(),
  bulkAdjustability: vi.fn(),
  setAdjustability: vi.fn(),
  listCalls: [] as unknown[],
}))

function tx(overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return {
    id: 1, date: '2026-06-09', time: '12:00:00', type: '지출', category_major: '식비', category_minor: '배달', category_major_user: null, category_minor_user: null,
    effective_category_major: '식비', effective_category_minor: '배달', description: '샘플배달-원본', merchant: '샘플배달', amount: -23000, currency: 'KRW',
    payment_method: '카드 A', memo: null, is_deleted: false, merged_into_id: null, is_edited: false, source: 'import', created_at: '', updated_at: '',
    ...overrides,
  }
}

function nature(id: number, overrides: Partial<TransactionNature> = {}): TransactionNature {
  return {
    transaction_id: id, effective: true, type: '지출', date: '2026-06-09', merchant: '샘플배달', effective_category_major: '식비', effective_category_minor: '배달',
    payment_form: 'ad_hoc', commitment_kind: null, loan_account_id: null, installment_plan_id: null, commitment: null,
    adjustability: 'adjustable', adjustability_source: 'category_default',
    levels: { fixed: null, transaction: null, commitment: null, category_default: 'adjustable' },
    excluded_from_commitments: false, installment_link_unconfirmed: false, necessity_conflict: false,
    ...overrides,
  }
}

vi.mock('../../hooks/useTransactions', () => {
  const noop = () => ({ mutateAsync: vi.fn().mockResolvedValue({ updated: 1 }), isPending: false })
  const wrap = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: vi.fn() })
  return {
    useTransactionList: (params: TransactionListParams) => {
      mocks.listCalls.push(params)
      return wrap({ total: 1, page: 1, per_page: 40, items: [tx()] })
    },
    useTransactionFilterOptions: () => wrap({ category_options: ['식비', '구독'], category_minor_options: ['배달'], category_minor_options_by_major: { 식비: ['배달'] }, payment_method_options: ['카드 A'] }),
    useTransactionDetail: (id: number | null) =>
      wrap(id === 1 ? tx() : id ? tx({ id, date: '2026-01-01', time: '05:52:21', merchant: '연결된 거래', amount: -1200, payment_method: '카드 B', description: '원본', effective_category_major: '구독', effective_category_minor: null, category_minor: null }) : undefined),
    useUpdateTransaction: () => ({ mutateAsync: mocks.update.mockResolvedValue({}), isPending: false }),
    useDeleteTransaction: noop,
    useRestoreTransaction: noop,
    useBulkUpdateTransactions: () => ({ mutateAsync: mocks.bulkUpdate.mockResolvedValue({ updated: 1 }), isPending: false }),
    useBulkDeletePreview: noop,
    useBulkDeleteTransactions: noop,
    useBulkRestorePreview: () => ({
      mutateAsync: mocks.bulkRestorePreview.mockResolvedValue({ count: 1, period_start: '2026-06-09', period_end: '2026-06-09', expense_total: -23000, representative_merchants: ['샘플배달'] }),
      isPending: false,
    }),
    useBulkRestoreTransactions: () => ({ mutateAsync: mocks.bulkRestore.mockResolvedValue({ updated: 1 }), isPending: false }),
  }
})

vi.mock('../../hooks/useNature', () => ({
  useTransactionNature: (id: number | null) => ({ data: id ? nature(id) : undefined, isLoading: false, error: null }),
  useTransferPurposeDetail: () => ({ data: undefined, isLoading: false, error: null }),
  useSetTransactionAdjustability: () => ({ mutateAsync: mocks.setAdjustability.mockResolvedValue({}), isPending: false }),
  useSetTransferPurpose: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBulkTransactionAdjustability: () => ({ mutateAsync: mocks.bulkAdjustability.mockResolvedValue({ applied: [1], failed: [] }), isPending: false }),
}))

vi.mock('../../hooks/useSettings', () => ({
  useAnalyticsSettings: () => ({
    data: { effective: { bulk_operations: { require_preview: true, require_confirmation: true, show_undo_after_delete: true, max_bulk_rows_without_extra_confirmation: 100 } } },
    isLoading: false, error: null, refetch: vi.fn(),
  }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function renderPage(path = '/data/transactions') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/data/transactions" element={<TransactionsPage />} />
        <Route path="/data/inbox" element={<div><p>분류 화면</p><Link to="/data/transactions?adjustability=undecided&type=%EC%A7%80%EC%B6%9C">돌아가기</Link></div>} />
        <Route path="/data/nature" element={<p>정기 지급 화면</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    for (const mock of [mocks.bulkUpdate, mocks.update, mocks.bulkRestorePreview, mocks.bulkRestore, mocks.bulkAdjustability, mocks.setAdjustability]) mock.mockClear()
    mocks.listCalls.length = 0
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('거래 목록과 새 축(지급 형태·조정 가능성·흐름표 줄) 조회 조건을 보인다 — 예전 반복 입력은 없다', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '작업대 · 거래' })).toBeInTheDocument()
    expect(screen.getByText('샘플배달')).toBeInTheDocument()
    expect(screen.getByText('-₩23,000')).toBeInTheDocument()
    expect(screen.getByLabelText('지급 형태')).toBeInTheDocument()
    expect(screen.getByLabelText('조정 가능성')).toBeInTheDocument()
    expect(screen.getByLabelText('월 흐름표 줄')).toBeInTheDocument()
    expect(screen.queryByLabelText('반복분류')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('고정/변동')).not.toBeInTheDocument()
  })

  it('거래처를 누르면 고치기 패널이 열리고 출처와 조정 가능성 근거를 보인다 (예전 고정/변동·반복 입력 없음)', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '샘플배달 2026-06-09 거래 고치기' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/샘플배달-원본/)).toBeInTheDocument()
    expect(within(dialog).getAllByText(/카테고리 기본값/).length).toBeGreaterThan(0)
    expect(within(dialog).getByRole('radio', { name: /따로 정하지 않음.*조정 가능 \(카테고리 기본값\)/ })).toBeChecked()
    expect(within(dialog).queryByText('반복분류')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('고정/변동')).not.toBeInTheDocument()
  })

  it('행 선택 시 하단 일괄 바가 나타나고, 거래처와 조정 가능성을 일괄로 정한다', async () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('샘플배달 선택'))
    expect(screen.getByText('1건 선택됨')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('일괄 거래처'), { target: { value: '샘플 서비스' } })
    fireEvent.change(screen.getByLabelText('일괄 조정 가능성'), { target: { value: 'protected' } })
    fireEvent.click(screen.getByRole('button', { name: '일괄 적용' }))
    await waitFor(() => {
      expect(mocks.bulkUpdate).toHaveBeenCalledWith({ ids: [1], merchant: '샘플 서비스' })
      expect(mocks.bulkAdjustability).toHaveBeenCalledWith(expect.objectContaining({ ids: [1], value: 'protected' }))
    })
  })

  it('bulk restore는 preview 확인 후 실행한다', async () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('샘플배달 선택'))
    fireEvent.click(screen.getByRole('button', { name: '복원' }))
    await waitFor(() => {
      expect(mocks.bulkRestorePreview).toHaveBeenCalledWith({ ids: [1] })
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('1건 복원'))
      expect(mocks.bulkRestore).toHaveBeenCalledWith({ ids: [1] })
    })
  })

  it('거래 번호 주소는 목록 밖의 거래도 열고, 메모만 고쳐 저장한다', async () => {
    renderPage('/data/transactions?transaction_id=99')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/05:52:21/)).toBeInTheDocument()
    expect(within(dialog).getByText('카드 B')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('메모'), { target: { value: '확인함' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 99, data: { memo: '확인함' } }))
    expect(mocks.setAdjustability).not.toHaveBeenCalled()
  })

  it('조정 가능성은 예전 분류 칸이 아니라 거래 단위 값으로 따로 저장한다', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '샘플배달 2026-06-09 거래 고치기' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /^보호/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mocks.setAdjustability).toHaveBeenCalledWith({ id: 1, value: 'protected' }))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('조회 조건은 주소에 남아 다른 화면에 다녀와도 그대로다', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('조정 가능성'), { target: { value: 'undecided' } })
    fireEvent.change(screen.getByLabelText('거래 유형'), { target: { value: '지출' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    expect(mocks.listCalls[mocks.listCalls.length - 1]).toEqual(expect.objectContaining({ adjustability: 'undecided', type: '지출', page: 1 }))
    // 다른 화면으로 갔다가 같은 주소로 돌아오면 조건이 다시 채워진다
    fireEvent.click(screen.getByRole('link', { name: '분류 큐로' }))
    expect(screen.getByText('분류 화면')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '돌아가기' }))
    expect(screen.getByLabelText('조정 가능성')).toHaveValue('undecided')
    expect(screen.getByLabelText('거래 유형')).toHaveValue('지출')
    expect(mocks.listCalls[mocks.listCalls.length - 1]).toEqual(expect.objectContaining({ adjustability: 'undecided', type: '지출' }))
  })

  it('예전 그룹 보기 주소는 정기 지급 묶음으로 보낸다', () => {
    renderPage('/data/transactions?view=groups')
    expect(screen.getByText('정기 지급 화면')).toBeInTheDocument()
  })
})
