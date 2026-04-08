import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { InsightsPage } from '../../pages/InsightsPage'

const useMerchantSpendMock = vi.fn()
const useCategoryMoMMock = vi.fn()

vi.mock('../../hooks/useAnalytics', () => ({
  useMonthlyCashflow: () => ({
    data: {
      items: [{ period: '2026-03', income: 100, expense: -50, transfer: 0, net_cashflow: 50, savings_rate: 0.5 }],
    },
    isLoading: false,
  }),
  useIncomeStability: () => ({
    data: { coefficient_of_variation: 0.08, assumptions: '', items: [], avg: 0, stdev: 0 },
    isLoading: false,
  }),
  useRecurringPayments: () => ({ data: { total: 0, items: [], assumptions: '' }, isLoading: false }),
  useSpendingAnomalies: (...args: unknown[]) => useSpendingAnomaliesMock(...args),
  useMerchantSpend: (params: unknown) => useMerchantSpendMock(params),
  useCategoryMoM: (params: unknown) => useCategoryMoMMock(params),
}))

const useSpendingAnomaliesMock = vi.fn()

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

describe('InsightsPage', () => {
  beforeEach(() => {
    useMerchantSpendMock.mockImplementation(() => ({ data: { items: [] }, isLoading: false }))
    useCategoryMoMMock.mockImplementation(() => ({ data: { items: [] }, isLoading: false }))
    useSpendingAnomaliesMock.mockImplementation(() => ({ data: { total: 0, items: [], assumptions: '' }, isLoading: false }))
  })

  it('requests merchant spend with the selected period option', () => {
    wrap(<InsightsPage />)

    expect(useMerchantSpendMock).toHaveBeenCalledWith(expect.objectContaining({ months: 3, limit: 5 }))
  })

  it('renders local controls for merchant period and category base month', () => {
    wrap(<InsightsPage />)

    expect(screen.getByLabelText('거래처 소비 기간')).toBeInTheDocument()
    expect(screen.getByLabelText('카테고리 기준월')).toBeInTheDocument()
  })

  it('renders anomaly deltas with a directional sign only once', () => {
    useSpendingAnomaliesMock.mockImplementation(() => ({
      data: {
        total: 1,
        items: [
          {
            period: '2026-03',
            category: '금융',
            amount: 350000,
            baseline_avg: 300000,
            delta_pct: 16.6,
            anomaly_score: 0.16,
            reason: '전월 대비 증가',
          },
        ],
        assumptions: '',
      },
      isLoading: false,
    }))

    wrap(<InsightsPage />)

    expect(screen.getByText('+16.6%')).toBeInTheDocument()
    expect(screen.queryByText('++16.6%')).not.toBeInTheDocument()
  })
})
