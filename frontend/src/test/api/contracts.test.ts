import type { PropsWithChildren } from 'react'
import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyticsApi } from '../../api/analytics'
import { assetApi } from '../../api/assets'
import { transactionApi } from '../../api/transactions'
import {
  txKeys,
  useCreateInstallmentPlan,
  useInstallmentTransactionSuggestions,
  useLinkTransactionToInstallment,
  useReviewLoanTransactionCandidate,
} from '../../hooks/useTransactions'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

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
    expect(fetchMock.mock.calls[6][0]).toContain('/analytics/spending-review-candidates?')
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

  it('maps loan candidate review and installment suggestion adapters to backend contracts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidate_key: 'loan_transaction:51',
            candidate_type: 'loan_transaction',
            transaction_id: 51,
            review_status: 'not_candidate',
            memo: '수동 검토',
            reviewed_at: '2026-06-27T09:00:00Z',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total: 1,
            page: 2,
            per_page: 10,
            items: [
              {
                transaction: {
                  transaction_id: 71,
                  date: '2026-06-01',
                  time: '09:00:00',
                  type: '지출',
                  effective_category_major: '생활',
                  effective_category_minor: null,
                  description: '카드 결제',
                  merchant: '애플',
                  amount: -300000,
                  currency: 'KRW',
                  payment_method: '카드',
                  memo: null,
                  recurring_payment_kind: 'installment',
                },
                installment_plan_id: 3,
                installment_plan_display_name: '맥북 할부',
                installment_plan_merchant: '애플',
                total_installments: 3,
                monthly_amount: 300000,
                first_payment_date: '2026-06-05',
                suggested_installment_number: 1,
                expected_billing_date: '2026-06-05',
                amount_delta: 0,
                billing_day_delta: 0,
                score: 98,
                confidence: 'high',
                reason_labels: ['same_merchant', 'same_amount'],
                conflict_reason: null,
                is_usable: true,
              },
            ],
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await transactionApi.reviewLoanTransactionCandidate(51, {
      review_status: 'not_candidate',
      memo: '수동 검토',
    })
    await transactionApi.installmentTransactionSuggestions({
      installment_plan_id: 3,
      page: 2,
      per_page: 10,
    })

    expect(fetchMock.mock.calls[0][0]).toContain('/loan-transaction-links/51/review')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      review_status: 'not_candidate',
      memo: '수동 검토',
    })

    expect(fetchMock.mock.calls[1][0]).toContain('/installment-transaction-suggestions?')
    expect(fetchMock.mock.calls[1][0]).toContain('installment_plan_id=3')
    expect(fetchMock.mock.calls[1][0]).toContain('page=2')
    expect(fetchMock.mock.calls[1][0]).toContain('per_page=10')
  })

  it('fetches installment suggestions through the typed query hook', async () => {
    const queryClient = createQueryClient()
    const apiSpy = vi.spyOn(transactionApi, 'installmentTransactionSuggestions').mockResolvedValue({
      total: 1,
      page: 3,
      per_page: 5,
      items: [
        {
          transaction: {
            transaction_id: 81,
            date: '2026-06-01',
            time: '09:00:00',
            type: '지출',
            effective_category_major: '생활',
            effective_category_minor: null,
            description: '카드 결제',
            merchant: '애플',
            amount: -300000,
            currency: 'KRW',
            payment_method: '카드',
            memo: null,
            recurring_payment_kind: 'installment',
          },
          installment_plan_id: 3,
          installment_plan_display_name: '맥북 할부',
          installment_plan_merchant: '애플',
          total_installments: 3,
          monthly_amount: 300000,
          first_payment_date: '2026-06-05',
          suggested_installment_number: 1,
          expected_billing_date: '2026-06-05',
          amount_delta: 0,
          billing_day_delta: 0,
          score: 98,
          confidence: 'high',
          reason_labels: ['same_merchant', 'same_amount'],
          conflict_reason: null,
          is_usable: true,
        },
      ],
    })

    const { result } = renderHook(
      () =>
        useInstallmentTransactionSuggestions({
          installment_plan_id: 3,
          page: 3,
          per_page: 5,
        }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(result.current.data?.items).toHaveLength(1)
    })

    expect(apiSpy).toHaveBeenCalledWith({
      installment_plan_id: 3,
      page: 3,
      per_page: 5,
    })
    expect(result.current.data?.items[0]?.suggested_installment_number).toBe(1)
  })

  it('invalidates loan mapping and inbox queries after loan candidate review succeeds', async () => {
    const queryClient = createQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined)
    vi.spyOn(transactionApi, 'reviewLoanTransactionCandidate').mockResolvedValue({
      candidate_key: 'loan_transaction:51',
      candidate_type: 'loan_transaction',
      transaction_id: 51,
      review_status: 'not_candidate',
      memo: '제외',
      reviewed_at: '2026-06-27T09:00:00Z',
    })

    const { result } = renderHook(() => useReviewLoanTransactionCandidate(), {
      wrapper: createWrapper(queryClient),
    })

    await result.current.mutateAsync({
      transactionId: 51,
      data: { review_status: 'not_candidate', memo: '제외' },
    })

    const invalidatedKeys = invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey)
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ['transactions', 'loanTransactionMappings'],
        ['canonical-views'],
      ]),
    )
  })

  it('invalidates installment suggestions when installment plans or links change', async () => {
    const queryClient = createQueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined)
    vi.spyOn(transactionApi, 'createInstallmentPlan').mockResolvedValue({
      id: 3,
      display_name: '맥북 할부',
      merchant: '애플',
      payment_method: '카드',
      total_installments: 3,
      monthly_amount: 300000,
      first_payment_date: '2026-06-05',
      memo: null,
      status: 'active',
      linked_installment_count: 0,
      created_at: '2026-06-27T09:00:00Z',
      updated_at: '2026-06-27T09:00:00Z',
    })
    vi.spyOn(transactionApi, 'linkTransactionToInstallment').mockResolvedValue({
      transaction_id: 81,
      installment_plan_id: 3,
      installment_plan_display_name: '맥북 할부',
      installment_number: 1,
      total_installments: 3,
      monthly_amount: 300000,
      due_date: '2026-06-05',
      source: 'manual',
      memo: null,
      created_at: '2026-06-27T09:00:00Z',
      updated_at: '2026-06-27T09:00:00Z',
    })

    const { result: createResult } = renderHook(() => useCreateInstallmentPlan(), {
      wrapper: createWrapper(queryClient),
    })
    const { result: linkResult } = renderHook(() => useLinkTransactionToInstallment(), {
      wrapper: createWrapper(queryClient),
    })

    await createResult.current.mutateAsync({
      display_name: '맥북 할부',
      merchant: '애플',
      payment_method: '카드',
      total_installments: 3,
      monthly_amount: 300000,
      first_payment_date: '2026-06-05',
      memo: null,
    })
    await linkResult.current.mutateAsync({
      id: 81,
      data: {
        installment_plan_id: 3,
        installment_number: 1,
        memo: null,
      },
    })

    const invalidatedKeys = invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey)
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        txKeys.installmentPlans(),
        ['transactions', 'installmentForecast'],
        ['transactions', 'installmentTransactionMappings'],
        ['transactions', 'installmentTransactionSuggestions'],
      ]),
    )
  })
})
