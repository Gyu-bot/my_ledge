import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { OverviewPage } from '../../pages/OverviewPage'

vi.mock('../../hooks/useAnalytics', () => ({
  useMonthlyCashflow: () => ({ data: undefined, isLoading: true, error: null }),
  useIncomeStability: () => ({ data: undefined, isLoading: true, error: null }),
  useRecurringPayments: () => ({ data: undefined, isLoading: true, error: null }),
  useSpendingAnomalies: () => ({ data: undefined, isLoading: true, error: null }),
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

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('OverviewPage', () => {
  it('renders KPI section titles', () => {
    wrap(<OverviewPage />)
    expect(screen.getByText('순자산')).toBeInTheDocument()
    expect(screen.getByText('이번 달 지출')).toBeInTheDocument()
    expect(screen.getByText('이번 달 수입')).toBeInTheDocument()
    expect(screen.getByText('저축률')).toBeInTheDocument()
  })

  it('renders section cards', () => {
    wrap(<OverviewPage />)
    expect(screen.getByText('월간 현금흐름')).toBeInTheDocument()
    expect(screen.getByText('주의 신호')).toBeInTheDocument()
    expect(screen.getByText('카테고리 Top 5')).toBeInTheDocument()
    expect(screen.getByText('최근 거래')).toBeInTheDocument()
  })
})
