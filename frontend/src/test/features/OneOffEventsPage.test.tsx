import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OneOffEventsPage } from '../../features/one-off/OneOffEventsPage'
import { TrendCard } from '../../features/monthclose/TrendCard'
import { FlowTable } from '../../features/monthclose/FlowTable'
import type { OneOffEventDetail } from '../../types/oneOffEvents'
import { monthFixture } from './metricsFixtures'

const api = vi.hoisted(() => ({
  list: vi.fn(), detail: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), editMembers: vi.fn(),
}))
vi.mock('../../api/oneOffEvents', () => ({ oneOffEventsApi: api }))
vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function group(): OneOffEventDetail {
  return {
    id: 7, name: '합성 구매 묶음', note: '합성 메모', direct_member_count: 1,
    counted_total: 120, first_date: '2030-01-05', last_date: '2030-01-05',
    periods: [{ period: '2030-01', amount: 200 }, { period: '2030-02', amount: -80 }],
    members: [{
      transaction_id: 3, date: '2030-01-05', merchant: '합성 구매', description: '합성 거래 원문',
      category_major: '합성 분류', category_minor: null, amount: -200, currency: 'KRW',
      member_status: 'counted', inactive_reason: null,
    }],
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('일회성 지출 작업대', () => {
  it('직접 소속 거래와 게시월 환불 금액을 표시하고 소속 해제 후 관련 조회를 갱신한다', async () => {
    const event = group()
    api.list.mockImplementation(async () => [event])
    api.detail.mockImplementation(async () => event)
    api.editMembers.mockImplementation(async () => {
      Object.assign(event, { members: [], periods: [], direct_member_count: 0, counted_total: 0 })
      return event
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/data/one-off?event=7']}><OneOffEventsPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('-₩80')).toBeInTheDocument()
    expect(screen.getByText('집계 반영')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '귀속 거래 보기' })).toHaveAttribute('href', '/data/transactions?one_off_event_id=7')
    fireEvent.click(screen.getByRole('button', { name: '합성 구매 묶음에서 빼기' }))
    expect(await screen.findByText('귀속된 금액이 없습니다.')).toBeInTheDocument()
    expect(api.editMembers).toHaveBeenCalledWith(7, 'DELETE', [3])
    for (const queryKey of [['transactions'], ['metrics', 'monthly-flow'], ['metrics', 'comparison'], ['read'], ['canonical-views', 'month-projection'], ['spending-reference'], ['one-off-events']]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey })
    }
  })

  it('진행월과 마감월에서 참고 행을 보이고 경상과 일회성 거래로 연결한다', () => {
    const closed = { ...monthFixture('2030-02', 'closed'), one_off_total: -80, ongoing_outflow: 550_080 }
    const current = { ...monthFixture('2030-03', 'in_progress'), one_off_total: 30, ongoing_outflow: 549_970 }
    render(
      <MemoryRouter>
        <FlowTable month={closed} openMeasure={null} onToggle={vi.fn()} drilldown={null} caption="마감월 흐름표" />
        <FlowTable month={current} variant="compact" openMeasure={null} onToggle={vi.fn()} drilldown={null} caption="진행월 흐름표" />
      </MemoryRouter>,
    )
    const full = within(screen.getByRole('list', { name: '마감월 흐름표' }))
    const compact = within(screen.getByRole('list', { name: '진행월 흐름표' }))
    expect(full.getByRole('link', { name: /총지급 중 일회성/ })).toHaveTextContent('-₩80')
    expect(full.getByRole('link', { name: /총지급 중 일회성/ })).toHaveAttribute('href', expect.stringContaining('one_off=true'))
    expect(compact.getByRole('link', { name: /경상 지급/ })).toHaveAttribute('href', expect.stringContaining('one_off=false'))
  })

  it('12개월 추이에서 경상만 그린 뒤 전환 시 순환급 부호와 실제 잔여를 표시한다', () => {
    const refund = { ...monthFixture('2030-02', 'closed'), income_total: 0, total_outflow: -80, residual: 80, one_off_total: -50, ongoing_outflow: -30 }
    render(<TrendCard items={[refund]} endPeriod="2030-02" firstPeriod="2030-02" selectedPeriod="2030-02" onSelect={vi.fn()} />)
    const chart = screen.getByRole('img', { name: /경상 지급 차트/ })
    expect(chart.querySelector('polyline')).toBeNull()
    expect(chart.querySelector('title')).toHaveTextContent('경상 지급 -₩30')
    const expenseBar = chart.querySelector('rect[fill="var(--ds-chart-expense)"]')
    expect(Number(expenseBar?.getAttribute('y'))).toBeCloseTo(Number(chart.querySelector('line[stroke="var(--ds-chart-axis)"]')?.getAttribute('y1')))
    expect(Number(expenseBar?.getAttribute('height'))).toBeGreaterThan(0)
    expect(screen.getByRole('columnheader', { name: '총지급 기준 잔여' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '일회성 포함' }))
    const combined = screen.getByRole('img', { name: /수입·총지급·잔여 차트/ })
    expect(combined.querySelector('polyline')).not.toBeNull()
    expect(combined.querySelector('title')).toHaveTextContent('총지급 -₩80')
  })
})
