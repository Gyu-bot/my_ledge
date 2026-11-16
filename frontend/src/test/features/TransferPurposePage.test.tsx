import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { TransferPurposePage } from '../../features/workbench/TransferPurposePage'
import type { TransferPurposeListResponse } from '../../types/metrics'
import type { TransferPurposeRule } from '../../types/nature'
import { transferItem, transferListFixture, transferRule } from './netWorthFixtures'

// 합성 자료만 사용한다 (공개 저장소).

const state = vi.hoisted(() => ({
  list: null as unknown,
  listError: null as Error | null,
  listParams: [] as unknown[],
  rules: [] as unknown[],
  write: true,
  setPurpose: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
}))

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => state.write }))

vi.mock('../../hooks/useMetrics', () => ({
  useTransferPurposeList: (params: unknown) => {
    state.listParams.push(params)
    if (state.listError) return { data: undefined, isLoading: false, error: state.listError, refetch: vi.fn() }
    return query(state.list as TransferPurposeListResponse)
  },
}))

vi.mock('../../hooks/useNature', () => ({
  useSetTransferPurpose: () => ({ mutateAsync: state.setPurpose, isPending: false }),
  useTransferPurposeRules: () => query({ items: state.rules as TransferPurposeRule[] }),
  useCreateTransferPurposeRule: () => ({ mutateAsync: state.createRule, isPending: false }),
  useUpdateTransferPurposeRule: () => ({ mutateAsync: state.updateRule, isPending: false }),
  useDeleteTransferPurposeRule: () => ({ mutateAsync: state.deleteRule, isPending: false }),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionFilterOptions: () =>
    query({ category_options: ['이체', '저축'], category_minor_options_by_major: { 이체: ['내계좌이체'], 저축: [] } }),
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderPage(path = '/data/transfers') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/data/transfers" element={<><TransferPurposePage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

function rows() {
  return within(screen.getByRole('list', { name: '이체 목록' })).getAllByRole('listitem')
}

describe('TransferPurposePage (작업대 · 이체 목적)', () => {
  beforeEach(() => {
    state.list = transferListFixture([
      transferItem({ transaction_id: 1, merchant: '가상증권', amount: -1_000_000 }),
      transferItem({ transaction_id: 2, merchant: '가상저축은행', amount: -800_000, purpose: 'savings', purpose_source: 'rule_merchant', rule_id: 7, rule_purpose: 'savings' }),
      transferItem({ transaction_id: 3, merchant: '가상증권', amount: 500_000, date: '2026-06-20', purpose: 'investment', purpose_source: 'transaction', transaction_purpose: 'investment' }),
      transferItem({ transaction_id: 4, merchant: '내 다른 통장', amount: -300_000, effective_category_minor: '내계좌이체' }),
    ])
    state.listError = null
    state.listParams = []
    state.rules = [transferRule()]
    state.write = true
    state.setPurpose.mockReset().mockResolvedValue({})
    state.createRule.mockReset().mockResolvedValue({})
    state.updateRule.mockReset().mockResolvedValue({})
    state.deleteRule.mockReset().mockResolvedValue(undefined)
  })

  it('이체를 응답 순서(금액 큰 순)로, 지금 목적과 그 출처와 함께 보인다', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '작업대 · 이체 목적' })).toBeInTheDocument()
    const items = rows()
    expect(items).toHaveLength(4)
    expect(within(items[0]).getByText('가상증권')).toBeInTheDocument()
    expect(within(items[0]).getByText('목적 미정')).toBeInTheDocument()
    expect(within(items[0]).getByText('(정하지 않음)')).toBeInTheDocument()
    expect(within(items[1]).getByText('저축', { selector: 'span' })).toBeInTheDocument()
    expect(within(items[1]).getByText('(거래처 규칙)')).toBeInTheDocument()
    expect(within(items[2]).getByText('(이 거래에서 정함)')).toBeInTheDocument()
    expect(screen.getByText(/전체 기간의 이체 4건 중 목적 미정/)).toBeInTheDocument()
    expect(screen.getByText('(50.0%).', { exact: false })).toBeInTheDocument()
  })

  it('아무것도 미리 고르지 않는다: 거래에서 정한 값이 없으면 선택이 비어 있다', () => {
    renderPage()
    expect(screen.getByLabelText('가상증권 2026-06-05 이체의 목적')).toHaveValue('')
    expect(screen.getByLabelText('가상저축은행 2026-06-05 이체의 목적')).toHaveValue('') // 규칙 값은 선택에 미리 넣지 않는다
    expect(screen.getByLabelText('가상증권 2026-06-20 이체의 목적')).toHaveValue('investment')
  })

  it('한 이체의 목적을 정하고, 거래에서 정한 값을 지운다', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('가상증권 2026-06-05 이체의 목적'), { target: { value: 'investment' } })
    await waitFor(() => expect(state.setPurpose).toHaveBeenCalledWith({ id: 1, value: 'investment' }))
    fireEvent.change(screen.getByLabelText('가상증권 2026-06-20 이체의 목적'), { target: { value: '' } })
    await waitFor(() => expect(state.setPurpose).toHaveBeenCalledWith({ id: 3, value: null }))
  })

  it('필터: 목적 미정만, 기간 — 주소에 남고 조회 조건이 된다', () => {
    renderPage()
    expect(state.listParams[state.listParams.length - 1]).toEqual({ start_date: undefined, end_date: undefined, purpose: undefined, limit: 2000 })
    fireEvent.click(screen.getByLabelText('목적 미정만 보기'))
    expect(state.listParams[state.listParams.length - 1]).toEqual(expect.objectContaining({ purpose: 'undecided' }))
    fireEvent.change(screen.getByLabelText('기간 시작일'), { target: { value: '2026-06-01' } })
    expect(state.listParams[state.listParams.length - 1]).toEqual(expect.objectContaining({ start_date: '2026-06-01', purpose: 'undecided' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/data/transfers?undecided=1&start=2026-06-01')
    fireEvent.click(screen.getByRole('button', { name: '기간 지우기' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/data/transfers?undecided=1')
  })

  it('재무상태 대조에서 오면 구간을 기간으로 받고, 그 구간으로 돌아가는 링크를 둔다', () => {
    renderPage('/data/transfers?start=2026-06-01&end=2026-06-30&undecided=1&from=2026-05-31~2026-06-30')
    expect(state.listParams[0]).toEqual({ start_date: '2026-06-01', end_date: '2026-06-30', purpose: 'undecided', limit: 2000 })
    expect(screen.getByRole('link', { name: /2026-05-31 → 2026-06-30 대조로 돌아가기/ })).toHaveAttribute('href', '/net-worth?start=2026-05-31&end=2026-06-30')
    expect(screen.getByText(/2026년 6월 1일 ~ 2026년 6월 30일의 이체/)).toBeInTheDocument()
  })

  it('사람이 고른 목적을 같은 거래처 이체 모두에 규칙으로 (확인 뒤 한 번에)', async () => {
    renderPage()
    expect(within(rows()[0]).queryByRole('button', { name: /규칙으로/ })).not.toBeInTheDocument() // 고르지 않은 거래에는 없다
    fireEvent.click(within(rows()[2]).getByRole('button', { name: '같은 거래처 2건에 규칙으로' }))
    const confirm = screen.getByRole('group', { name: '같은 거래처 규칙 확인' })
    expect(within(confirm).getByText(/거래처 '가상증권'의 이체를 '투자'\(으\)로 정하는 규칙을 만듭니다/)).toBeInTheDocument()
    expect(within(confirm).getByText(/이체 2건 중 1건의 목적이 이 규칙을 따릅니다/)).toBeInTheDocument()
    expect(state.createRule).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole('button', { name: '규칙 만들기' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalledWith({ match_scope: 'merchant', merchant: '가상증권', purpose: 'investment' }))
  })

  it('같은 거래처 규칙이 이미 있으면 그 규칙을 바꾼다', async () => {
    state.list = transferListFixture([
      transferItem({ transaction_id: 9, merchant: '가상저축은행', purpose: 'internal_move', purpose_source: 'transaction', transaction_purpose: 'internal_move' }),
    ])
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '같은 거래처 1건에 규칙으로' }))
    expect(screen.getByText(/이미 '저축' 규칙이 있습니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '규칙 바꾸기' }))
    await waitFor(() => expect(state.updateRule).toHaveBeenCalledWith({ id: 7, data: { purpose: 'internal_move' } }))
  })

  it('규칙 만들기: 목적을 고르기 전에는 만들 수 없다', async () => {
    renderPage()
    const card = screen.getByText('새 규칙').closest('div') as HTMLElement
    const submit = within(card).getByRole('button', { name: '규칙 만들기' })
    fireEvent.change(within(card).getByLabelText('거래처 이름'), { target: { value: '가상증권' } })
    expect(submit).toBeDisabled()
    fireEvent.change(within(card).getByLabelText('목적'), { target: { value: 'investment' } })
    fireEvent.click(submit)
    await waitFor(() => expect(state.createRule).toHaveBeenCalledWith({ match_scope: 'merchant', merchant: '가상증권', purpose: 'investment', label: null }))
  })

  it('카테고리 규칙: 대분류와 (선택) 소분류', async () => {
    renderPage()
    const card = screen.getByText('새 규칙').closest('div') as HTMLElement
    fireEvent.change(within(card).getByLabelText('범위'), { target: { value: 'category' } })
    fireEvent.change(within(card).getByLabelText('대분류'), { target: { value: '이체' } })
    fireEvent.change(within(card).getByLabelText('소분류'), { target: { value: '내계좌이체' } })
    fireEvent.change(within(card).getByLabelText('목적'), { target: { value: 'internal_move' } })
    fireEvent.click(within(card).getByRole('button', { name: '규칙 만들기' }))
    await waitFor(() => expect(state.createRule).toHaveBeenCalledWith({ match_scope: 'category', category_major: '이체', category_minor: '내계좌이체', purpose: 'internal_move', label: null }))
  })

  it('규칙 고치기', async () => {
    renderPage()
    const list = screen.getByRole('list', { name: '이체 목적 규칙 목록' })
    expect(within(list).getByText(/지금 이 규칙으로 목적이 정해진 이체 3건/)).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: '고치기' }))
    fireEvent.change(within(list).getByLabelText('목적'), { target: { value: 'investment' } })
    fireEvent.click(within(list).getByRole('button', { name: '고친 내용 저장' }))
    await waitFor(() => expect(state.updateRule).toHaveBeenCalledWith({ id: 7, data: { match_scope: 'merchant', merchant: '가상저축은행', purpose: 'investment', label: null } }))
  })

  it('규칙 지우기는 확인 문구를 입력해야 실행된다', async () => {
    renderPage()
    const list = screen.getByRole('list', { name: '이체 목적 규칙 목록' })
    fireEvent.click(within(list).getByRole('button', { name: '지우기' }))
    const dialog = screen.getByRole('alertdialog', { name: '이체 목적 규칙 지우기' })
    expect(within(dialog).getByText(/이체 3건은 다른 규칙이 없으면 다시 '목적 미정'이 됩니다/)).toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', { name: '지우기' })
    expect(confirm).toBeDisabled()
    expect(state.deleteRule).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByPlaceholderText('확인 문구 입력'), { target: { value: '지우기' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(state.deleteRule).toHaveBeenCalledWith(7))
  })

  it('이체가 없으면 빈 상태, 조회 실패는 오류 상태', () => {
    state.list = transferListFixture([])
    const { unmount } = renderPage('/data/transfers?undecided=1')
    expect(screen.getByText('이 기간에 목적이 정해지지 않은 이체가 없습니다.')).toBeInTheDocument()
    unmount()
    state.listError = new Error('401: no key')
    renderPage()
    expect(screen.getByText('API 키가 없거나 맞지 않아 자료를 읽지 못했습니다.')).toBeInTheDocument()
  })

  it('규칙이 없으면 빈 상태', () => {
    state.rules = []
    renderPage()
    expect(screen.getByText('아직 만든 규칙이 없습니다.')).toBeInTheDocument()
  })

  it('쓰기 권한이 없으면 읽기 전용으로 보인다', () => {
    state.write = false
    renderPage()
    expect(screen.getByText(/API 키가 없어 목적과 규칙을 바꿀 수 없습니다/)).toBeInTheDocument()
    expect(screen.getByLabelText('가상증권 2026-06-05 이체의 목적')).toBeDisabled()
    expect(within(screen.getByRole('list', { name: '이체 목적 규칙 목록' })).getByRole('button', { name: '지우기' })).toBeDisabled()
  })
})
