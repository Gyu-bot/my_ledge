import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { CommitmentsPage } from '../../features/commitments/CommitmentsPage'
import { dataStatusFixture, failed, loading, query } from './metricsFixtures'
import { commitmentsFixture, txFixture } from './workbenchFixtures'

let commitmentsState: ReturnType<typeof query> | ReturnType<typeof failed> | ReturnType<typeof loading>
const periodsAsked: Array<string | null> = []
const detailIds: number[] = []

vi.mock('../../hooks/useMetrics', () => ({
  useDataStatus: () => query(dataStatusFixture()),
  useCommitments: (period: string | null) => {
    periodsAsked.push(period)
    return commitmentsState
  },
}))

vi.mock('../../api/transactions', () => ({
  transactionApi: {
    detail: (id: number) => {
      detailIds.push(id)
      return Promise.resolve(txFixture(id, { merchant: `샘플 할부처 ${id}` }))
    },
  },
}))

vi.mock('../../features/analysis/DataStatusStrip', () => ({ DataStatusStrip: () => <div>자료 현황 띠</div> }))

function renderPage(path = '/commitments') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <CommitmentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  commitmentsState = query(commitmentsFixture())
  periodsAsked.length = 0
  detailIds.length = 0
})

describe('CommitmentsPage — 약정 현황', () => {
  it('대출·할부·정기 지급을 한 목록에 월 부담과 근거, 주기, 남은 회차·종료, 조정 가능성과 함께 보인다', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '약정 현황' })).toBeInTheDocument()
    expect(screen.getByText('자료 현황 띠')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '약정' })
    const cards = within(list).getAllByRole('listitem')
    // 끝난 약정은 기본으로 숨긴다 (진행 중 5개)
    expect(cards).toHaveLength(5)
    const loan = cards[0]
    expect(within(loan).getByText('샘플 대출')).toBeInTheDocument()
    expect(within(loan).getByText('₩450,000')).toBeInTheDocument()
    expect(within(loan).getByText(/대출 스냅샷의 월 상환액/)).toBeInTheDocument()
    expect(within(loan).getByText('매월')).toBeInTheDocument()
    expect(within(loan).getByText(/만기 2030년 1월 10일/)).toBeInTheDocument()
    expect(within(loan).getByText(/보호 \(대출·할부는 끝날 때까지 고정\)/)).toBeInTheDocument()
    expect(within(loan).getByRole('link', { name: /대출 화면에서 열기/ })).toHaveAttribute('href', '/data/loans')

    const installment = cards[1]
    expect(within(installment).getByText(/남은 회차 1회 \/ 전체 6회/)).toBeInTheDocument()
    expect(within(installment).getByText(/마지막 회차 예정일 2026년 8월 15일/)).toBeInTheDocument()
    expect(within(installment).getByText(/할부 계획의 월 금액/)).toBeInTheDocument()
    expect(within(installment).getByRole('link', { name: /할부 화면에서 열기/ })).toHaveAttribute('href', '/data/installments')

    const yearly = within(list).getByText('샘플 연간 구독').closest('li') as HTMLElement
    expect(within(yearly).getByText('기록 없음')).toBeInTheDocument()
    expect(within(yearly).getByText(/매달 나가는 약정이 아니라 월 부담을 내지 않습니다/)).toBeInTheDocument()
    expect(within(yearly).getByRole('link', { name: /정기 지급 고치기/ })).toHaveAttribute('href', '/data/nature?tab=recurring&edit=7')

    expect(screen.getByText('₩650,000')).toBeInTheDocument()
    expect(screen.getByText(/기록된 약정의 속성입니다. 앞으로의 지급을 내다보지 않습니다/)).toBeInTheDocument()
  })

  it('관측 상태를 세 상태와 두 보조 상태로 쉬운 말로 보이고 "미납"이라는 말을 쓰지 않는다', () => {
    renderPage()
    const list = screen.getByRole('list', { name: '약정' })
    expect(within(list).getByText('관측됨')).toBeInTheDocument()
    expect(within(list).getByText('주기상 있어야 하는데 관측 안 됨')).toBeInTheDocument()
    expect(within(list).getByText('거래는 있으나 연결 미확인')).toBeInTheDocument()
    expect(within(list).getByText('이 달에는 예정 없음')).toBeInTheDocument()
    expect(within(list).getByText('판단할 기록 없음')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('미납')
    expect(within(list).getByText(/지급하지 않았다는 뜻은 아닙니다/)).toBeInTheDocument()
  })

  it('"연결 미확인"에서 해당 거래 목록을 열고 그 자리에서 고치거나 할부 화면으로 갈 수 있다', async () => {
    renderPage()
    const installment = screen.getByText('샘플 할부').closest('li') as HTMLElement
    fireEvent.click(within(installment).getByRole('button', { name: '연결 미확인 거래 2건 보기' }))
    const rows = await within(installment).findByRole('list', { name: '샘플 할부 연결 미확인 거래' })
    await waitFor(() => expect(within(rows).getAllByRole('listitem')).toHaveLength(2))
    expect(detailIds.sort()).toEqual([601, 602])
    expect(within(rows).getByText('샘플 할부처 601')).toBeInTheDocument()
    expect(within(rows).getAllByRole('button', { name: /거래 고치기/ })).toHaveLength(2)
    expect(within(installment).getByRole('link', { name: '할부 화면에서 연결' })).toHaveAttribute('href', '/data/installments?linked=unlinked')
  })

  it('관측 상태와 종류로 거르고, 끝난 약정을 따로 켤 수 있다', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^거래는 있으나 연결 미확인 1$/ }))
    expect(within(screen.getByRole('list', { name: '약정' })).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '모든 상태' }))
    fireEvent.click(screen.getByRole('button', { name: '정기 지급' }))
    expect(within(screen.getByRole('list', { name: '약정' })).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getByLabelText('끝난 약정도 보기 (1)'))
    expect(within(screen.getByRole('list', { name: '약정' })).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('끝남')).toBeInTheDocument()
  })

  it('달을 바꾸면 그 달의 관측을 다시 묻는다', () => {
    renderPage('/commitments?period=2026-06')
    expect(periodsAsked[periodsAsked.length - 1]).toBe('2026-06')
    fireEvent.change(screen.getByLabelText('관측을 볼 달'), { target: { value: '2026-04' } })
    expect(periodsAsked[periodsAsked.length - 1]).toBe('2026-04')
  })

  it('기록이 덜 된 약정이 있으면 이유와 고치러 갈 곳을 보인다', () => {
    renderPage()
    expect(screen.getByText(/주기나 조정 가능성이 기록되지 않은 약정이 있음 — 주기 미기록 1건/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /정기 지급의 주기·조정 가능성 정하러 가기/ })).toHaveAttribute('href', '/data/nature?tab=recurring')
  })

  it('약정이 없으면 등록 안내를 보인다', () => {
    commitmentsState = query(commitmentsFixture([]))
    renderPage()
    expect(screen.getByText(/기록된 약정이 없습니다/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '정기 지급 등록하러 가기' })).toHaveAttribute('href', '/data/nature?tab=recurring')
  })

  it('읽기 실패는 쉬운 말과 다시 시도로 보인다', () => {
    commitmentsState = failed('401: no key')
    renderPage()
    expect(screen.getByText('API 키가 없거나 맞지 않아 자료를 읽지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument()
  })

  it('불러오는 동안 자리표시를 보인다', () => {
    commitmentsState = loading()
    renderPage()
    expect(screen.getByText('약정 목록')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '약정' })).not.toBeInTheDocument()
  })
})
