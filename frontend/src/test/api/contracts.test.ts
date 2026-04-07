import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyticsApi } from '../../api/analytics'
import { transactionApi } from '../../api/transactions'

describe('frontend query contract adapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('maps month-based analytics queries to backend start_date/end_date', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await analyticsApi.monthlyCashflow({ months: 6 })
    await analyticsApi.fixedCostSummary({ start_month: '2026-01', end_month: '2026-03' })
    await analyticsApi.merchantSpend({ months: 3, limit: 5 })

    expect(fetchMock.mock.calls[0][0]).toContain('/analytics/monthly-cashflow?')
    expect(fetchMock.mock.calls[0][0]).toContain('start_date=')
    expect(fetchMock.mock.calls[0][0]).toContain('end_date=')
    expect(fetchMock.mock.calls[1][0]).toContain('start_date=2026-01-01')
    expect(fetchMock.mock.calls[1][0]).toContain('end_date=2026-03-31')
    expect(fetchMock.mock.calls[2][0]).toContain('limit=5')
    expect(fetchMock.mock.calls[2][0]).not.toContain('months=')
  })

  it('replaces missing daily-spend endpoint with transactions list query', async () => {
    const payload = {
      total: 2,
      page: 1,
      per_page: 200,
      items: [
        { id: 1, date: '2026-03-05', amount: -1000 },
        { id: 2, date: '2026-03-05', amount: 300 },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await transactionApi.dailySpend({ month: '2026-03', include_income: true })

    expect(fetchMock.mock.calls[0][0]).toContain('/transactions?')
    expect(fetchMock.mock.calls[0][0]).toContain('start_date=2026-03-01')
    expect(fetchMock.mock.calls[0][0]).toContain('end_date=2026-03-31')
    expect(fetchMock.mock.calls[0][0]).not.toContain('daily-spend')
    expect(result.items).toEqual([{ date: '2026-03-05', amount: -700 }])
  })

  it('builds subcategory drill-down data from transactions filtered to the selected major category', async () => {
    const payload = {
      total: 3,
      page: 1,
      per_page: 200,
      items: [
        { id: 1, effective_category_major: '식비', effective_category_minor: '카페', amount: -5000 },
        { id: 2, effective_category_major: '식비', effective_category_minor: '외식', amount: -12000 },
        { id: 3, effective_category_major: '교통', effective_category_minor: '택시', amount: -8000 },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await transactionApi.subcategoryBreakdown({
      start_month: '2026-03',
      end_month: '2026-03',
      category_major: '식비',
    })

    expect(fetchMock.mock.calls[0][0]).toContain('/transactions?')
    expect(fetchMock.mock.calls[0][0]).toContain('start_date=2026-03-01')
    expect(fetchMock.mock.calls[0][0]).toContain('end_date=2026-03-31')
    expect(result.items).toEqual([
      { category: '외식', amount: -12000 },
      { category: '카페', amount: -5000 },
    ])
  })
})
