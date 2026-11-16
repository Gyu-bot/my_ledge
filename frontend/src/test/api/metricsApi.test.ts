import { afterEach, describe, expect, it, vi } from 'vitest'
import { metricsApi } from '../../api/metrics'

function stubFetch() {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('metricsApi — T058 화면이 읽는 지표 계약', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('지표·비교·읽기 표면 경로와 쿼리를 그대로 만든다', async () => {
    const fetchMock = stubFetch()
    await metricsApi.dataStatus()
    await metricsApi.monthlyFlow({ start_period: '2026-07', end_period: '2026-07' })
    await metricsApi.spendCube({ start_period: '2026-07', end_period: '2026-07', group_by: ['effective_category_major', 'merchant'], flow_row: 'undecided', limit: 100 })
    await metricsApi.comparisonMonthlyFlow('2026-07')
    await metricsApi.contributions({ period: '2026-07', adjustability: 'adjustable', level: 'merchant', category: '샘플 식비' })
    await metricsApi.reviewItems({ period: '2026-07', limit: 100 })
    await metricsApi.projectionAccuracy()
    await metricsApi.transferTransactions({ start_date: '2026-07-01', end_date: '2026-07-31', limit: 2000 })

    const urls = fetchMock.mock.calls.map(([url]) => decodeURIComponent(String(url)))
    expect(urls).toEqual([
      '/api/v1/metrics/data-status',
      '/api/v1/metrics/monthly-flow?start_period=2026-07&end_period=2026-07',
      '/api/v1/metrics/spend-cube?start_period=2026-07&end_period=2026-07&group_by=effective_category_major,merchant&flow_row=undecided&limit=100',
      '/api/v1/metrics/comparison/monthly-flow?period=2026-07',
      '/api/v1/metrics/comparison/contributions?period=2026-07&adjustability=adjustable&level=merchant&category=샘플+식비',
      '/api/v1/read/review-items?period=2026-07&limit=100',
      '/api/v1/canonical-views/month-projection/accuracy',
      '/api/v1/transfer-purposes/transactions?start_date=2026-07-01&end_date=2026-07-31&limit=2000',
    ])
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).method ?? 'GET').toBe('GET')
    }
  })

  it('전망과 두 비교의 선택 인자를 서버로 보내고 정확도 경로는 유지한다', async () => {
    const fetchMock = stubFetch()
    await metricsApi.monthProjection({ reference_date: '2026-07-15' })
    await metricsApi.comparisonMonthlyFlow('2026-07', 'previous_month')
    await metricsApi.contributions({ period: '2026-07', baseline: 'previous_month' })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/read/month-projection?reference_date=2026-07-15',
      '/api/v1/metrics/comparison/monthly-flow?period=2026-07&baseline=previous_month',
      '/api/v1/metrics/comparison/contributions?period=2026-07&baseline=previous_month',
    ])
  })

  it('조회 실패는 상태코드를 담은 오류로 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Invalid API key."}', { status: 401 })))
    await expect(metricsApi.dataStatus()).rejects.toThrow(/^401:/)
  })
})
