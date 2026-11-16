vi.mock('../../features/analysis/SpendingReferenceCard', () => ({ SpendingReferenceCard: () => null }))
// T059: 분석 화면에서 거래를 고치고 돌아오면 필터와 위치가 그대로이고, 키보드만으로 열고·저장하고·닫는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom'
import { MonthClosePage } from '../../features/monthclose/MonthClosePage'
import { AppShell } from '../../shell/AppShell'
import type { SpendCubeQuery } from '../../types/metrics'
import type { TransactionResponse } from '../../types/transaction'
import { basisFixture, contractFixture, cubeFixture, dataStatusFixture, monthFixture, query } from './metricsFixtures'
import { txFixture } from './workbenchFixtures'

const mocks = vi.hoisted(() => ({ update: vi.fn() }))

vi.mock('../../ds/charts/CashflowChart', () => ({ CashflowChart: () => <div /> }))

const rows: Record<number, TransactionResponse> = {
  21: txFixture(21, { merchant: '샘플 마트', effective_category_major: '샘플 식비', category_major: '샘플 식비', amount: -40_000, date: '2026-06-10' }),
  22: txFixture(22, { merchant: '샘플 마트', effective_category_major: '샘플 식비', category_major: '샘플 식비', amount: -20_000, date: '2026-06-12' }),
}

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionList: () => query({ total: 2, page: 1, per_page: 200, items: [rows[21], rows[22]] }),
  useTransactionDetail: (id: number | null) => query(id ? rows[id] : undefined),
  useTransactionFilterOptions: () => query({ category_options: ['샘플 식비'], category_minor_options: [], category_minor_options_by_major: {}, payment_method_options: [] }),
  useUpdateTransaction: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRestoreTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../../hooks/useNature', () => ({
  useTransactionNature: () => query(undefined),
  useTransferPurposeDetail: () => query(undefined),
  useSetTransactionAdjustability: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTransferPurpose: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../../hooks/useMetrics', () => ({
  useMonthProjection: () => query(undefined),
  useReadDataStatus: () => query({ data: { periods: [] } }),
  useDataStatus: () => query(dataStatusFixture()),
  useMonthlyFlow: () => query({ contract: contractFixture(), items: [monthFixture('2026-06', 'closed'), monthFixture('2026-07', 'closed')] }),
  useSpendCube: (params: SpendCubeQuery | null) => query(cubeFixture(
    params?.group_by.join(',') === 'flow_row' ? [] : [{ effective_category_major: '샘플 식비', merchant: '샘플 마트', amount: 60_000, transaction_count: 2 }],
    params?.group_by ?? [],
  )),
  useMonthlyFlowComparison: () => query({ contract: contractFixture(), comparison: basisFixture(), measures: [], residual_rate: null }),
  useTransferTransactions: () => query({ total_count: 0, undecided_count: 0, undecided_activity_total: 0, activity_total: 0, items: [] }),
  useProjectionAccuracy: () => query(null),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="현재 주소">{location.pathname + location.search}</output>
}

function renderMonthClose(path = '/?month=2026-06') {
  const router = createMemoryRouter(
    [{ path: '/', element: <><MonthClosePage /><LocationProbe /></> }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

function openCellTransactions() {
  const table = screen.getByRole('list', { name: '2026-06 월 흐름표' })
  fireEvent.click(within(table).getByRole('button', { name: /^−?\s*미정/ }))
  const panel = screen.getByRole('region', { name: '미정 근거' })
  // 칸이 하나뿐이면 저절로 펼쳐져 있다
  expect(within(panel).getByRole('list', { name: '샘플 식비 · 샘플 마트 거래' })).toBeInTheDocument()
  return panel
}

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue({})
})

describe('분석 화면에서 그 자리 고치기', () => {
  it('키보드만으로 거래 고치기를 열고(Enter), 저장하고(Ctrl+Enter), 닫히면 보던 자리로 초점과 필터가 돌아온다', async () => {
    const router = renderMonthClose()
    const panel = openCellTransactions()
    const opener = within(panel).getByRole('button', { name: '샘플 마트 2026-06-10 거래 고치기' })
    opener.focus()
    fireEvent.click(opener) // 버튼에서 Enter = 클릭

    const dialog = screen.getByRole('dialog', { name: '샘플 마트' })
    // 첫 입력칸으로 초점이 간다
    expect(document.activeElement).toBe(within(dialog).getByLabelText('분석용 거래처'))
    // 화면을 떠나지 않는다
    expect(router.state.location.pathname).toBe('/')

    const memo = within(dialog).getByLabelText('메모')
    memo.focus()
    fireEvent.change(memo, { target: { value: '확인함' } })
    fireEvent.keyDown(memo, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 21, data: { memo: '확인함' } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // 초점은 연 버튼으로, 고르던 달과 열어 둔 근거 패널은 그대로
    expect(document.activeElement).toBe(opener)
    expect(screen.getByRole('region', { name: '미정 근거' })).toBe(panel)
    expect(screen.getByLabelText('현재 주소')).toHaveTextContent('/?month=2026-06')
    expect(screen.getByLabelText('결산할 마감월')).toHaveValue('2026-06')
  })

  it('Esc로 저장 없이 닫고, Tab은 패널 안에서만 돈다', () => {
    renderMonthClose()
    const panel = openCellTransactions()
    const opener = within(panel).getByRole('button', { name: '샘플 마트 2026-06-12 거래 고치기' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog')
    // 바꾼 것이 없으면 저장할 수 없다
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeDisabled()
    // Shift+Tab을 첫 요소에서 누르면 마지막 요소로 간다
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'))
    focusable[0].focus()
    fireEvent.keyDown(focusable[0], { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(focusable[focusable.length - 1])
    fireEvent.keyDown(focusable[focusable.length - 1], { key: 'Tab' })
    expect(document.activeElement).toBe(focusable[0])

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(opener)
  })
})

describe('다른 화면에 다녀오면 보던 위치를 되살린다', () => {
  it('뒤로 가기로 돌아오면 스크롤 위치가 돌아오고, 새 화면은 맨 위에서 시작한다', async () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <AppShell />, children: [
        { index: true, element: <p>분석 화면</p> },
        { path: 'data/transactions', element: <p>거래 화면</p> },
      ] }],
      { initialEntries: ['/?month=2026-06'] },
    )
    render(<RouterProvider router={router} />)
    act(() => {
      window.scrollTo(0, 640)
      window.dispatchEvent(new Event('scroll'))
    })
    await act(async () => { await router.navigate('/data/transactions?transaction_id=21') })
    expect(screen.getByText('거래 화면')).toBeInTheDocument()
    expect(window.scrollY).toBe(0)
    await act(async () => { await router.navigate(-1) })
    expect(screen.getByText('분석 화면')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?month=2026-06')
    expect(window.scrollY).toBe(640)
  })
})
