import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyticsApi } from '../../api/analytics'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function captureRequests() {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
    new Response(JSON.stringify({ items: [] }), { status: 200 }),
  ))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('analysis cutoff adapters', () => {
  it('진행월은 오늘까지, 과거 마감월은 월말까지 전월비를 요청한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-24T12:00:00+09:00'))
    const fetchMock = captureRequests()
    await analyticsApi.categoryMoM({ base_month: '2026-09' })
    await analyticsApi.categoryMoM({ base_month: '2026-08' })
    const current = new URL(fetchMock.mock.calls[0][0], 'http://localhost').searchParams
    const closed = new URL(fetchMock.mock.calls[1][0], 'http://localhost').searchParams
    expect(current.get('start_date')).toBe('2026-08-01')
    expect(current.get('end_date')).toBe('2026-09-24')
    expect(closed.get('start_date')).toBe('2026-07-01')
    expect(closed.get('end_date')).toBe('2026-08-31')
  })

  it('부분기간 명시 날짜를 유지하고 수입 포함 비교에서 이체를 제외한다', async () => {
    const fetchMock = captureRequests()
    await analyticsApi.categoryMoM({ base_month: '2026-09', end_date: '2026-09-12', include_income: true })
    await analyticsApi.merchantSpend({ start_month: '2026-09', end_month: '2026-09', end_date: '2026-09-12', include_income: true })
    await analyticsApi.monthlyCashflow({ start_date: '2026-09-01', end_date: '2026-09-12' })
    await analyticsApi.purchaseGateCandidates({ status: 'pending', start_date: '2026-09-01', end_date: '2026-09-12' })
    await analyticsApi.recurringPayments({ page: 2, activity: 'history', end_date: '2026-09-12', recent_days: 90 })
    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(url, 'http://localhost').searchParams.get('end_date')).toBe('2026-09-12')
    }
    for (const [url] of fetchMock.mock.calls.slice(0, 2)) {
      expect(new URL(url, 'http://localhost').searchParams.get('type')).toBe('income_expense')
    }
    expect(new URL(fetchMock.mock.calls[4][0], 'http://localhost').searchParams.get('activity')).toBe('history')
  })
})
