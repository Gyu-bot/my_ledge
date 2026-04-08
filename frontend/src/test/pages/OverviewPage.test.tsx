import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { OverviewPage } from '../../pages/OverviewPage'

const useIncomeStabilityMock = vi.fn()
const useSpendingAnomaliesMock = vi.fn()

vi.mock('../../hooks/useAnalytics', () => ({
  useMonthlyCashflow: () => ({ data: undefined, isLoading: true, error: null }),
  useIncomeStability: (params: unknown) => useIncomeStabilityMock(params),
  useRecurringPayments: () => ({ data: undefined, isLoading: true, error: null }),
  useSpendingAnomalies: (params: unknown) => useSpendingAnomaliesMock(params),
  useMerchantSpend: () => ({ data: undefined, isLoading: true, error: null }),
  useCategoryMoM: () => ({ data: undefined, isLoading: true, error: null }),
}))

vi.mock('../../hooks/useAssets', () => ({
  useAssetSnapshots: () => ({ data: undefined, isLoading: true }),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionList: () => ({ data: undefined, isLoading: true }),
  useCategoryBreakdown: () => ({ data: undefined, isLoading: true }),
}))

vi.mock('../../components/layout/chromeContext', () => ({
  useChromeContext: () => ({ setMetaBadge: vi.fn() }),
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-08T09:00:00+09:00'))
    useIncomeStabilityMock.mockImplementation(() => ({
      data: {
        items: [],
        avg: 0,
        stdev: 0,
        coefficient_of_variation: 0.08,
        assumptions: '',
        comparison_mode: 'closed',
        reference_date: '2026-03-31',
        is_partial_period: false,
      },
      isLoading: false,
      error: null,
    }))
    useSpendingAnomaliesMock.mockImplementation(() => ({
      data: {
        total: 0,
        items: [],
        assumptions: '',
        comparison_mode: 'closed',
        reference_date: '2026-03-31',
        is_partial_period: false,
      },
      isLoading: false,
      error: null,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders KPI section titles', () => {
    wrap(<OverviewPage />)
    expect(screen.getByText('순자산')).toBeInTheDocument()
    expect(screen.getByText('이번 달 지출')).toBeInTheDocument()
    expect(screen.getByText('이번 달 수입')).toBeInTheDocument()
    expect(screen.getByText('저축률')).toBeInTheDocument()
  })

  it('renders section cards and signal controls', () => {
    wrap(<OverviewPage />)
    expect(screen.getByText('월간 현금흐름')).toBeInTheDocument()
    expect(screen.getByText('주의 신호')).toBeInTheDocument()
    expect(screen.getByText('카테고리 Top 5')).toBeInTheDocument()
    expect(screen.getByText('최근 거래')).toBeInTheDocument()
    expect(screen.getByLabelText('주의 신호 기준')).toBeInTheDocument()
  })

  it('uses the last closed month by default and switches both signal queries to partial mode', () => {
    wrap(<OverviewPage />)

    expect(useIncomeStabilityMock).toHaveBeenCalledWith({})
    expect(useSpendingAnomaliesMock).toHaveBeenCalledWith({ page: 1, per_page: 1 })
    expect(screen.getAllByText('직전 마감월').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('주의 신호 기준'), { target: { value: 'partial' } })

    expect(useIncomeStabilityMock).toHaveBeenLastCalledWith({ end_date: '2026-04-08' })
    expect(useSpendingAnomaliesMock).toHaveBeenLastCalledWith({ page: 1, per_page: 1, end_date: '2026-04-08' })
    expect(screen.getAllByText('부분 기간').length).toBeGreaterThan(0)
  })
})
