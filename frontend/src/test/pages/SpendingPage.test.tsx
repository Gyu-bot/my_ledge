import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SpendingPage } from '../../pages/SpendingPage'

const useCategoryBreakdownMock = vi.fn()
const useSubcategoryBreakdownMock = vi.fn()
const useMerchantSpendMock = vi.fn()

vi.mock('../../hooks/useTransactions', () => ({
  useCategoryTimeline: () => ({ data: { items: [] }, isLoading: false, error: null, refetch: vi.fn() }),
  useCategoryBreakdown: (params: unknown) => useCategoryBreakdownMock(params),
  useSubcategoryBreakdown: (params: unknown) => useSubcategoryBreakdownMock(params),
  useTransactionList: () => ({ data: { total: 0, page: 1, per_page: 20, items: [] }, isLoading: false }),
  useDailySpend: () => ({ data: { items: [] }, isLoading: false }),
}))

vi.mock('../../hooks/useAnalytics', () => ({
  useFixedCostSummary: () => ({
    data: {
      fixed_ratio: 0.4,
      fixed_total: 100000,
      variable_total: 150000,
      essential_fixed_total: 70000,
      discretionary_fixed_total: 30000,
      unclassified_count: 0,
    },
    isLoading: false,
  }),
  useMerchantSpend: (params: unknown) => useMerchantSpendMock(params),
}))

vi.mock('../../components/layout/chromeContext', () => ({
  useChromeContext: () => ({ setMetaBadge: vi.fn() }),
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SpendingPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
    useMerchantSpendMock.mockImplementation(() => ({ data: { items: [] }, isLoading: false }))
    useCategoryBreakdownMock.mockImplementation(() => ({
      data: {
        items: [
          { category: '식비', amount: -120000 },
          { category: '교통', amount: -40000 },
        ],
      },
      isLoading: false,
    }))
    useSubcategoryBreakdownMock.mockImplementation(() => ({ data: { items: [] }, isLoading: false }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requests subcategory data for the selected major category', async () => {
    wrap(<SpendingPage />)

    expect(useSubcategoryBreakdownMock).toHaveBeenCalledWith(
      expect.objectContaining({ category_major: '식비' }),
    )
  })

  it('shows the detail range on the merchant treemap card instead of a hardcoded recent-period badge', () => {
    wrap(<SpendingPage />)

    expect(screen.queryByText('최근 3개월')).not.toBeInTheDocument()
  })

  it('requests merchant spend using the selected detail month span', () => {
    wrap(<SpendingPage />)

    expect(useMerchantSpendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        start_month: '2025-10',
        end_month: '2026-03',
        limit: 10,
      }),
    )
  })
})
