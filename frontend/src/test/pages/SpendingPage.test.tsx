import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SpendingPage } from '../../pages/SpendingPage'

const useCategoryBreakdownMock = vi.fn()
const useSubcategoryBreakdownMock = vi.fn()

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
  useMerchantSpend: () => ({ data: { items: [] }, isLoading: false }),
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

  it('requests subcategory data for the selected major category', async () => {
    wrap(<SpendingPage />)

    await waitFor(() => {
      expect(useSubcategoryBreakdownMock).toHaveBeenCalledWith(
        expect.objectContaining({ category_major: '식비' }),
      )
    })
  })

  it('shows the detail range on the merchant treemap card instead of a hardcoded recent-period badge', () => {
    wrap(<SpendingPage />)

    expect(screen.queryByText('최근 3개월')).not.toBeInTheDocument()
  })
})
