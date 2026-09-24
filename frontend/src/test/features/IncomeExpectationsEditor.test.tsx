import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { IncomeExpectationsEditor } from '../../features/settings/IncomeExpectationsEditor'
import { projectionFixture } from './projectionFixtures'

let writable = true
let savedItems = [{ source_key: 'income:샘플 부수입', merchant: '샘플 부수입', expected_amount: 200_000, expected_day: 10, stopped: false }]
let failPatch = false
let monthProjection = projectionFixture()
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => writable }))
vi.mock('../../hooks/useCanonicalViews', () => ({ useCanonicalViewsDashboard: () => ({ data: { month_projection: monthProjection } }) }))

beforeEach(() => {
  writable = true
  failPatch = false
  monthProjection = projectionFixture()
  savedItems = [{ source_key: 'income:샘플 부수입', merchant: '샘플 부수입', expected_amount: 200_000, expected_day: 10, stopped: false }]
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (_input, init) => {
    if (init?.method === 'PATCH') {
      if (failPatch) return new Response('synthetic failure', { status: 500 })
      return new Response(String(init.body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ items: savedItems }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, '__MY_LEDGE_RUNTIME_CONFIG__', { configurable: true, value: { apiKey: 'synthetic-test-key' } })
})
afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(window, '__MY_LEDGE_RUNTIME_CONFIG__') })

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(<QueryClientProvider client={client}><IncomeExpectationsEditor /></QueryClientProvider>)
  return { client, invalidate }
}
function patches() { return fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH') }

describe('IncomeExpectationsEditor', () => {
  it('권한 있는 GET을 사용하고 자동 감지 후보는 저장하지 않는다', async () => {
    renderEditor()
    await screen.findByDisplayValue('샘플 부수입')
    expect(screen.getByRole('button', { name: '샘플 회사 보정에 추가' })).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/settings/income-expectations')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('X-API-Key')).toBe('synthetic-test-key')
    expect(patches()).toHaveLength(0)
  })
  it('후보를 추가한 뒤 저장할 때 기존 보정을 보존하고 전체 목록과 중단 상태를 전송한다', async () => {
    const { invalidate } = renderEditor()
    await screen.findByDisplayValue('샘플 부수입')
    fireEvent.click(screen.getByRole('button', { name: '샘플 회사 보정에 추가' }))
    expect(patches()).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('예상 금액 2 (원)'), { target: { value: '3200000' } })
    fireEvent.change(screen.getByLabelText('매월 예정일 2'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '샘플 회사 수입 중단' }))
    fireEvent.click(screen.getByRole('button', { name: '예상 수입 저장' }))
    await screen.findByText('예상 수입 설정을 저장했습니다.')
    expect(JSON.parse(String(patches()[0][1]?.body))).toEqual({ items: [savedItems[0], { source_key: 'income:샘플 회사', merchant: '샘플 회사', expected_amount: 3_200_000, expected_day: 25, stopped: true }] })
    expect(new Headers(patches()[0][1]?.headers).get('X-API-Key')).toBe('synthetic-test-key')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['canonical-views'] })
  })
  it('2월 말일로 조정된 입금 날짜가 있어도 후보의 원래 예정일 31일을 보존해 저장한다', async () => {
    monthProjection.income_sources[0] = {
      ...monthProjection.income_sources[0],
      expected_day: 31,
      expected_date: '2026-02-28',
      expected_date_from: '2026-02-27',
      expected_date_to: '2026-02-28',
    }
    renderEditor()
    await screen.findByDisplayValue('샘플 부수입')
    fireEvent.click(screen.getByRole('button', { name: '샘플 회사 보정에 추가' }))
    expect(screen.getByLabelText('매월 예정일 2')).toHaveValue(31)
    fireEvent.click(screen.getByRole('button', { name: '예상 수입 저장' }))
    await screen.findByText('예상 수입 설정을 저장했습니다.')
    expect(JSON.parse(String(patches()[0][1]?.body))).toEqual({ items: [savedItems[0], { source_key: 'income:샘플 회사', merchant: '샘플 회사', expected_amount: 3_000_000, expected_day: 31, stopped: false }] })
  })
  it('원래 예정일 정보가 없을 때만 입금 날짜에서 예정일을 제안한다', async () => {
    monthProjection.income_sources[0].expected_day = null
    monthProjection.income_sources[0].expected_date = '2026-06-26'
    renderEditor()
    await screen.findByDisplayValue('샘플 부수입')
    fireEvent.click(screen.getByRole('button', { name: '샘플 회사 보정에 추가' }))
    expect(screen.getByLabelText('매월 예정일 2')).toHaveValue(26)
    expect(patches()).toHaveLength(0)
  })
  it('직접 추가한 수입처 이름으로 안정된 key를 만들고 이름 변경도 반영한다', async () => {
    renderEditor()
    await screen.findByDisplayValue('샘플 부수입')
    fireEvent.click(screen.getByRole('button', { name: '수입처 직접 추가' }))
    fireEvent.change(screen.getByLabelText('수입처 2'), { target: { value: '  SAMPLE   Employer  ' } })
    fireEvent.change(screen.getByLabelText('예상 금액 2 (원)'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('매월 예정일 2'), { target: { value: '31' } })
    fireEvent.change(screen.getByLabelText('수입처 1'), { target: { value: '새 샘플 부수입' } })
    fireEvent.click(screen.getByRole('button', { name: '예상 수입 저장' }))
    await screen.findByText('예상 수입 설정을 저장했습니다.')
    expect(JSON.parse(String(patches()[0][1]?.body))).toEqual({ items: [
      { ...savedItems[0], source_key: 'income:새 샘플 부수입', merchant: '새 샘플 부수입' },
      { source_key: 'income:sample employer', merchant: 'SAMPLE Employer', expected_amount: 0, expected_day: 31, stopped: false },
    ] })
  })
  it('빈 금액과 잘못된 예정일은 전송하지 않는다', async () => {
    renderEditor()
    await screen.findByDisplayValue('샘플 부수입')
    fireEvent.change(screen.getByLabelText('예상 금액 1 (원)'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('매월 예정일 1'), { target: { value: '32' } })
    fireEvent.click(screen.getByRole('button', { name: '예상 수입 저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('0원 이상의 예상 금액')
    expect(patches()).toHaveLength(0)
  })
  it('저장 실패 시 입력을 유지하고 다시 저장할 수 있다', async () => {
    failPatch = true
    renderEditor()
    await screen.findByDisplayValue('샘플 부수입')
    fireEvent.change(screen.getByLabelText('예상 금액 1 (원)'), { target: { value: '222000' } })
    fireEvent.click(screen.getByRole('button', { name: '예상 수입 저장' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('예상 금액 1 (원)')).toHaveValue(222000)
    failPatch = false
    fireEvent.click(screen.getByRole('button', { name: '예상 수입 저장' }))
    await screen.findByText('예상 수입 설정을 저장했습니다.')
  })
  it('초기화는 빈 보정 목록을 PATCH하고 감지 후보를 자동 저장하지 않는다', async () => {
    renderEditor()
    await screen.findByDisplayValue('샘플 부수입')
    fireEvent.click(screen.getByRole('button', { name: '자동 감지로 초기화' }))
    await screen.findByText('사용자 보정을 지우고 자동 감지로 되돌렸습니다.')
    expect(JSON.parse(String(patches()[0][1]?.body))).toEqual({ items: [] })
    expect(screen.queryByDisplayValue('샘플 부수입')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '샘플 회사 보정에 추가' })).toBeInTheDocument()
  })
  it('읽기 전용에서는 인증 설정 GET이나 변경을 시도하지 않는다', () => {
    writable = false
    renderEditor()
    expect(screen.getByText('예상 수입 설정을 조회하거나 수정하려면 쓰기 권한이 필요합니다.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '예상 수입 저장' })).not.toBeInTheDocument()
  })
})
