import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyticsApi } from '../../api/analytics'
import { assetApi } from '../../api/assets'
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
    await analyticsApi.fixedCostTrend({ start_month: '2026-01', end_month: '2026-03' })
    await analyticsApi.merchantSpend({ start_month: '2026-01', end_month: '2026-03', limit: 5 })
    await analyticsApi.merchantSpend({ months: 3, limit: 5 })
    await analyticsApi.discretionaryVelocity({ as_of_date: '2026-04-08' })
    await analyticsApi.purchaseGateCandidates({ status: 'pending', limit: 5 })
    await transactionApi.recurringCategoryRulesDryRun()
    await transactionApi.applyRecurringDryRun({
      merchant: '왓챠',
      proposed_kind: 'monthly_recurring',
      apply_scope: 'future_only',
    })

    expect(fetchMock.mock.calls[0][0]).toContain('/analytics/monthly-cashflow?')
    expect(fetchMock.mock.calls[0][0]).toContain('start_date=')
    expect(fetchMock.mock.calls[0][0]).toContain('end_date=')
    expect(fetchMock.mock.calls[1][0]).toContain('start_date=2026-01-01')
    expect(fetchMock.mock.calls[1][0]).toContain('end_date=2026-03-31')
    expect(fetchMock.mock.calls[2][0]).toContain('/analytics/fixed-cost-trend?')
    expect(fetchMock.mock.calls[2][0]).toContain('start_date=2026-01-01')
    expect(fetchMock.mock.calls[2][0]).toContain('end_date=2026-03-31')
    expect(fetchMock.mock.calls[3][0]).toContain('start_date=2026-01-01')
    expect(fetchMock.mock.calls[3][0]).toContain('end_date=2026-03-31')
    expect(fetchMock.mock.calls[3][0]).toContain('limit=5')
    expect(fetchMock.mock.calls[3][0]).not.toContain('months=')
    expect(fetchMock.mock.calls[4][0]).toContain('limit=5')
    expect(fetchMock.mock.calls[4][0]).not.toContain('months=')
    expect(fetchMock.mock.calls[5][0]).toContain('/analytics/discretionary-velocity?')
    expect(fetchMock.mock.calls[5][0]).toContain('as_of_date=2026-04-08')
    expect(fetchMock.mock.calls[6][0]).toContain('/analytics/purchase-gate-candidates?')
    expect(fetchMock.mock.calls[6][0]).toContain('review_status=pending')
    expect(fetchMock.mock.calls[6][0]).toContain('per_page=5')
    expect(fetchMock.mock.calls[7][0]).toContain('/auto-classification/recurring-category-rules/dry-run')
    expect(fetchMock.mock.calls[8][0]).toContain('/auto-classification/apply/recurring-dry-run')
    expect(fetchMock.mock.calls[8][1]).toMatchObject({ method: 'POST' })
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

  it('maps asset and loan metadata patches to the health contract endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 200 })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await assetApi.patchAssetLiquidity(101, {
      liquidity_tier: 'near_liquid',
      is_cash_equivalent: false,
    })
    await assetApi.patchLoanRepaymentMetadata(201, {
      monthly_payment: '750000',
      repayment_method: 'principal_equal',
    })
    await assetApi.patchLoanRepaymentMetadata(202, {
      repayment_method: 'interest_only',
    })

    expect(fetchMock.mock.calls[0][0]).toContain('/assets/snapshots/101/liquidity')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      liquidity_tier: 'near_liquid',
      is_cash_equivalent: false,
    })
    expect(fetchMock.mock.calls[1][0]).toContain('/loans/201/repayment-metadata')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      monthly_payment: '750000',
      repayment_method: 'principal_equal',
    })
    expect(fetchMock.mock.calls[2][0]).toContain('/loans/202/repayment-metadata')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({
      repayment_method: 'interest_only',
    })
  })
})
