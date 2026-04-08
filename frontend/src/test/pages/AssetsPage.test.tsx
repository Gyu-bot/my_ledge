import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AssetsPage } from '../../pages/AssetsPage'

vi.mock('../../hooks/useAssets', () => ({
  useAssetSnapshots: () => ({
    data: {
      items: [
        {
          snapshot_date: '2026-04-07',
          asset_total: '1300.00',
          liability_total: '250.00',
          net_worth: '1050.00',
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useNetWorthHistory: () => ({
    data: { items: [{ snapshot_date: '2026-04-07', net_worth: '1050.00' }] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAssetSnapshotCompare: () => ({
    data: {
      comparison_mode: 'latest_available_vs_previous_available',
      current: {
        snapshot_date: '2026-04-07',
        asset_total: '1300.00',
        liability_total: '250.00',
        net_worth: '1050.00',
      },
      baseline: {
        snapshot_date: '2026-03-31',
        asset_total: '1000.00',
        liability_total: '200.00',
        net_worth: '800.00',
      },
      delta: {
        asset_total: '300.00',
        liability_total: '50.00',
        net_worth: '250.00',
        asset_total_pct: 0.3,
        liability_total_pct: 0.25,
        net_worth_pct: 0.3125,
      },
      comparison_days: 7,
      is_partial: true,
      is_stale: false,
      can_compare: true,
      comparison_label: '부분 기간',
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useInvestmentSummary: () => ({
    data: {
      snapshot_date: '2026-04-07',
      items: [],
      totals: { cost_basis: '1000.00', market_value: '1200.00' },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useLoanSummary: () => ({
    data: {
      snapshot_date: '2026-04-07',
      items: [],
      totals: { principal: '500.00', balance: '250.00' },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../components/layout/chromeContext', () => ({
  useChromeContext: () => ({ setMetaBadge: vi.fn() }),
}))

vi.mock('../../components/charts/LineAreaChart', () => ({
  LineAreaChart: () => <div>chart</div>,
}))

vi.mock('../../components/charts/HorizontalBarList', () => ({
  HorizontalBarList: () => <div>bars</div>,
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AssetsPage', () => {
  it('keeps snapshot comparison copy on summary badges but not on KPI subtext', () => {
    const { container } = wrap(<AssetsPage />)

    expect(screen.getAllByText('2026-03-31 대비 · 7일')).toHaveLength(2)
    const kpiSubs = container.querySelectorAll('[data-testid="kpi-sub"]')
    expect(kpiSubs).toHaveLength(1)
    expect(kpiSubs[0]?.textContent).toBe('원금 대비 +20.0%')
  })
})
