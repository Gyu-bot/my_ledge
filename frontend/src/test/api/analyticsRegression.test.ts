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
  it('부분기간 명시 날짜를 유지하고 수입 포함 비교에서 이체를 제외한다', async () => {
    const fetchMock = captureRequests()
    await analyticsApi.merchantSpend({ start_month: '2026-09', end_month: '2026-09', end_date: '2026-09-12', include_income: true })
    await analyticsApi.monthlyCashflow({ start_date: '2026-09-01', end_date: '2026-09-12' })
    await analyticsApi.recurringPayments({ page: 2, activity: 'history', end_date: '2026-09-12', recent_days: 90 })
    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(url, 'http://localhost').searchParams.get('end_date')).toBe('2026-09-12')
    }
    for (const [url] of fetchMock.mock.calls.slice(0, 1)) {
      expect(new URL(url, 'http://localhost').searchParams.get('type')).toBe('income_expense')
    }
    expect(new URL(fetchMock.mock.calls[2][0], 'http://localhost').searchParams.get('activity')).toBe('history')
  })
})
