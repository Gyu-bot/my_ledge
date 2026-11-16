import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Toaster } from '../../ds/toast'
import { getToasts } from '../../ds/toastStore'
import { ClassificationPage } from '../../features/workbench/ClassificationPage'
import type { SpendCubeQuery, SpendCubeRow } from '../../types/metrics'
import type { TransactionListParams } from '../../types/transaction'
import { cubeFixture, dataStatusFixture, failed, query } from './metricsFixtures'
import { txFixture } from './workbenchFixtures'

const mocks = vi.hoisted(() => ({
  setDefault: vi.fn(),
  deleteDefault: vi.fn(),
  bulk: vi.fn(),
  setOne: vi.fn(),
  listApi: vi.fn(),
  writeAccess: vi.fn(),
}))

let cubeRows: Array<Partial<SpendCubeRow> & { amount: number }> = []
let cubeError = false
const cubeCalls: SpendCubeQuery[] = []
const listHookCalls: TransactionListParams[] = []

vi.mock('../../hooks/useMetrics', () => ({
  useDataStatus: () => query(dataStatusFixture()),
  useSpendCube: (params: SpendCubeQuery | null) => {
    if (params) cubeCalls.push(params)
    if (cubeError) return failed('503: down')
    return query(cubeFixture(cubeRows, params?.group_by ?? []))
  },
}))

vi.mock('../../hooks/useNature', () => ({
  useSetCategoryDefault: () => ({ mutateAsync: mocks.setDefault, isPending: false }),
  useDeleteCategoryDefault: () => ({ mutateAsync: mocks.deleteDefault, isPending: false }),
  useBulkTransactionAdjustability: () => ({ mutateAsync: mocks.bulk, isPending: false }),
  useSetTransactionAdjustability: () => ({ mutateAsync: mocks.setOne, isPending: false }),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionList: (params: TransactionListParams) => {
    listHookCalls.push(params)
    return query({ total: 2, page: 1, per_page: 50, items: [
      txFixture(41, { merchant: '샘플 카페', effective_category_major: '샘플 식비', effective_category_minor: '카페', amount: -5_000 }),
      txFixture(42, { merchant: '샘플 카페 본점', effective_category_major: '샘플 식비', effective_category_minor: '카페', amount: -6_000 }),
    ] })
  },
  useLoanTransactionMappings: () => query({ total: 1, page: 1, per_page: 20, items: [{ transaction_id: 51, date: '2026-06-01', merchant: '샘플 은행 이자', amount: -1_000_000, effective_category_major: '샘플 금융', effective_category_minor: null }] }),
  useLoanAccounts: () => query({ items: [] }),
  useBulkLinkTransactionsToLoan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReviewLoanTransactionCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../../api/transactions', () => ({
  transactionApi: { list: (params: TransactionListParams) => mocks.listApi(params) },
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => mocks.writeAccess() }))

function renderPage(path = '/data/inbox') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ClassificationPage />
      <Toaster />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cubeRows = [
    { effective_category_major: '샘플 생활', effective_category_minor: null, merchant: '샘플 마트', amount: 90_000, transaction_count: 3 },
    { effective_category_major: '샘플 식비', effective_category_minor: '카페', merchant: '샘플 카페', amount: 250_000, transaction_count: 40 },
    { effective_category_major: '샘플 교통', effective_category_minor: null, merchant: '샘플 택시', amount: 120_000, transaction_count: 8 },
    { effective_category_major: '샘플 식비', effective_category_minor: '카페', merchant: '샘플 환불처', amount: -3_000, transaction_count: 1 },
  ]
  cubeError = false
  cubeCalls.length = 0
  listHookCalls.length = 0
  mocks.setDefault.mockReset().mockResolvedValue({ id: 77, category_major: '샘플 식비', category_minor: null, adjustability: 'adjustable', created_at: '', updated_at: '' })
  mocks.deleteDefault.mockReset().mockResolvedValue(undefined)
  mocks.bulk.mockReset().mockImplementation(async ({ ids }: { ids: number[] }) => ({ applied: ids, failed: [] }))
  mocks.setOne.mockReset().mockResolvedValue({})
  mocks.writeAccess.mockReset().mockReturnValue(true)
  mocks.listApi.mockReset().mockImplementation(async (params: TransactionListParams) => ({
    total: 3,
    page: params.page,
    per_page: 200,
    items: [
      txFixture(41, { merchant: '샘플 카페', effective_category_major: '샘플 식비', effective_category_minor: '카페' }),
      txFixture(43, { merchant: '샘플 카페', effective_category_major: '샘플 식비', effective_category_minor: '카페' }),
      // 부분 일치 검색에 걸린 다른 거래처·다른 소분류는 고른 묶음이 아니다
      txFixture(44, { merchant: '샘플 카페 본점', effective_category_major: '샘플 식비', effective_category_minor: '카페' }),
      txFixture(45, { merchant: '샘플 카페', effective_category_major: '샘플 식비', effective_category_minor: '디저트' }),
    ],
  }))
  for (const item of getToasts()) item.action = undefined
})

function queueTitles(): string[] {
  const queue = screen.getByRole('list', { name: '분류 큐' })
  return within(queue).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent ?? '')
}

describe('ClassificationPage — 작업대 · 분류 큐', () => {
  it('조정 가능성이 미정인 지출만 묻고, 금액 영향이 큰 묶음부터 보인다', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '작업대 · 분류' })).toBeInTheDocument()
    expect(cubeCalls[cubeCalls.length - 1]).toEqual(expect.objectContaining({
      adjustability: 'undecided',
      group_by: ['effective_category_major', 'effective_category_minor', 'merchant'],
    }))
    // 반복 여부만 빈 거래는 큐의 조건이 아니다 (조정 가능성 미정만)
    expect(JSON.stringify(cubeCalls)).not.toMatch(/recurring/)
    expect(queueTitles()).toEqual(['샘플 카페', '샘플 택시', '샘플 마트', '샘플 환불처'])
    expect(screen.getByText(/미정 ₩250,000 · 40건/)).toBeInTheDocument()
    expect(screen.queryByText(/반복|매월 반복|승인 대기|신뢰도/)).not.toBeInTheDocument()
  })

  it('한 번의 조작으로 카테고리 전체에 기본값을 주고, 되돌리기를 제공한다', async () => {
    renderPage()
    const row = screen.getByText('샘플 카페').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '카테고리 샘플 식비 기본값을 조정 가능(으)로' }))
    await waitFor(() => expect(mocks.setDefault).toHaveBeenCalledWith({ category_major: '샘플 식비', category_minor: null, adjustability: 'adjustable' }))
    expect(await screen.findByText("'샘플 식비' 카테고리 기본값을 '조정 가능'(으)로 정했습니다")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(mocks.deleteDefault).toHaveBeenCalledWith(77))
  })

  it('한 번의 조작으로 같은 거래처(같은 카테고리·소분류)의 미정 거래에만 값을 준다', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '샘플 카페 미정 거래를 보호(으)로' }))
    await waitFor(() => expect(mocks.bulk).toHaveBeenCalledTimes(1))
    expect(mocks.listApi).toHaveBeenCalledWith(expect.objectContaining({ type: '지출', adjustability: 'undecided', category_major: '샘플 식비', search: '샘플 카페', page: 1 }))
    expect(mocks.bulk).toHaveBeenCalledWith(expect.objectContaining({ ids: [41, 43], value: 'protected' }))
    expect(await screen.findByText("'샘플 카페' 거래 2건을 '보호'(으)로 정했습니다")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(mocks.bulk).toHaveBeenLastCalledWith(expect.objectContaining({ ids: [41, 43], value: null })))
  })

  it('정기 지급 등록은 고른 묶음의 거래처·카테고리만 채워 등록 화면으로 보낸다 (값은 미리 고르지 않는다)', () => {
    renderPage()
    const row = screen.getByText('샘플 카페').closest('li') as HTMLElement
    const link = within(row).getByRole('link', { name: '정기 지급으로 등록' })
    const url = new URL(link.getAttribute('href') ?? '', 'http://x')
    expect(url.pathname).toBe('/data/nature')
    expect(Object.fromEntries(url.searchParams)).toEqual({ tab: 'recurring', new: '1', category_major: '샘플 식비', category_minor: '카페', merchant: '샘플 카페' })
  })

  it('묶음을 펼치면 미정 거래가 보이고 거래 하나에도 값을 줄 수 있다', async () => {
    renderPage()
    const row = screen.getByText('샘플 카페').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '거래 보기' }))
    const list = within(row).getByRole('list', { name: '샘플 카페 미정 거래' })
    // 같은 거래처 이름만 (부분 일치 제외)
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(listHookCalls[listHookCalls.length - 1]).toEqual(expect.objectContaining({ adjustability: 'undecided', category_major: '샘플 식비', search: '샘플 카페' }))
    fireEvent.click(within(list).getByRole('button', { name: /거래를 조정 가능\(으\)로$/ }))
    await waitFor(() => expect(mocks.setOne).toHaveBeenCalledWith({ id: 41, value: 'adjustable' }))
  })

  it('카테고리별로 묶어 볼 수 있다', () => {
    renderPage('/data/inbox?view=category')
    expect(cubeCalls[cubeCalls.length - 1]).toEqual(expect.objectContaining({ group_by: ['effective_category_major'], adjustability: 'undecided' }))
    expect(screen.queryByRole('link', { name: '정기 지급으로 등록' })).not.toBeInTheDocument()
  })

  it('수천 묶음도 한 쪽에 25개씩 나눠 보이고 순서를 지킨다', () => {
    cubeRows = Array.from({ length: 3000 }, (_, index) => ({
      effective_category_major: `샘플 분류 ${index % 30}`,
      effective_category_minor: null,
      merchant: `샘플 거래처 ${index}`,
      amount: (index * 7919) % 100_000 + 1,
      transaction_count: 1,
    }))
    const started = performance.now()
    renderPage()
    const elapsed = performance.now() - started
    const titles = queueTitles()
    expect(titles).toHaveLength(25)
    const amounts = cubeRows.map((row) => row.amount).sort((a, b) => b - a)
    const first = screen.getByText(new RegExp(`미정 ₩${amounts[0].toLocaleString('ko-KR')} `))
    expect(first).toBeInTheDocument()
    expect(screen.getByText(/3,000개 묶음/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(queueTitles()[0]).not.toBe(titles[0])
    expect(elapsed).toBeLessThan(2000)
  })

  it('읽기 전용이면 값을 주는 버튼을 잠근다', () => {
    mocks.writeAccess.mockReturnValue(false)
    renderPage()
    for (const button of screen.getAllByRole('button', { name: '카테고리 샘플 식비 기본값을 보호(으)로' })) expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: '샘플 카페 미정 거래를 보호(으)로' })).toBeDisabled()
  })

  it('미정 지출이 없으면 빈 상태를, 읽기 실패면 오류를 보인다', () => {
    cubeRows = []
    const view = renderPage()
    expect(screen.getByText('조정 가능성이 미정인 지출이 없습니다.')).toBeInTheDocument()
    view.unmount()
    cubeError = true
    renderPage()
    expect(screen.getByText('데이터베이스 조회가 실패했습니다. 잠시 뒤 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('대출 연결 후보는 따로 된 탭에서 처리한다', () => {
    renderPage('/data/inbox?tab=loan')
    expect(screen.getByText('샘플 은행 이자')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '대출 후보 아님' })).toBeInTheDocument()
  })
})
