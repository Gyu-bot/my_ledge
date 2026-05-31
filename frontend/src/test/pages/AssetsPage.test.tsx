import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AssetsPage } from '../../pages/AssetsPage'

const mockUseWriteAccess = vi.fn<() => boolean>()
const patchAssetLiquidityMock = vi.fn()
const patchLoanRepaymentMetadataMock = vi.fn()

vi.mock('../../hooks/useWriteAccess', () => ({
  useWriteAccess: () => mockUseWriteAccess(),
}))

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
      asset_items: [
        {
          id: 101,
          snapshot_date: '2026-04-07',
          side: 'asset',
          category: '예금',
          product_name: '생활비 통장',
          amount: '300.00',
          asset_total: '1300.00',
          liability_total: '250.00',
          net_worth: '1050.00',
          liquidity_tier: 'immediate',
          is_cash_equivalent: true,
        },
        {
          id: 102,
          snapshot_date: '2026-04-07',
          side: 'asset',
          category: '부동산',
          product_name: '거주 주택',
          amount: '1000.00',
          asset_total: '1300.00',
          liability_total: '250.00',
          net_worth: '1050.00',
          liquidity_tier: 'illiquid',
          is_cash_equivalent: false,
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
  useLiquidityHealth: () => ({
    data: {
      snapshot_date: '2026-04-07',
      cash_equivalent_total: '300.00',
      liquid_asset_total: '300.00',
      monthly_required_spend: '100.00',
      emergency_fund_months: 3,
      monthly_debt_payment: '50.00',
      monthly_income: '500.00',
      debt_payment_to_income_ratio: 0.1,
      confidence: 'high',
      assumptions: [],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useNetWorthBreakdown: () => ({
    data: {
      snapshot_date: '2026-04-07',
      items: [
        { side: 'asset', category: '현금성', amount: '300.00', share_of_total: 0.23 },
        { side: 'liability', category: '대출', amount: '250.00', share_of_total: 1 },
      ],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useLoanSummary: () => ({
    data: {
      snapshot_date: '2026-04-07',
      items: [
        {
          id: 201,
          loan_type: '주택담보대출',
          lender: '국민은행',
          product_name: '우리집 주담대',
          principal: '500.00',
          balance: '250.00',
          interest_rate: '3.50',
          monthly_payment: '50.00',
          monthly_payment_source: 'estimated_from_linked_transactions',
          repayment_method: 'principal_equal',
          repayment_method_source: 'derived_from_loan_account',
          loan_kind: 'equal_principal',
          start_date: '2021-06-01',
          maturity_date: '2051-05-31',
        },
      ],
      totals: { principal: '500.00', balance: '250.00' },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePatchAssetLiquidity: () => ({
    mutateAsync: patchAssetLiquidityMock,
    isPending: false,
  }),
  usePatchLoanRepaymentMetadata: () => ({
    mutateAsync: patchLoanRepaymentMetadataMock,
    isPending: false,
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

beforeEach(() => {
  mockUseWriteAccess.mockReturnValue(true)
  patchAssetLiquidityMock.mockReset()
  patchAssetLiquidityMock.mockResolvedValue({
    id: 101,
    snapshot_date: '2026-04-07',
    side: 'asset',
    category: '예금',
    product_name: '생활비 통장',
    amount: '300.00',
    liquidity_tier: 'near_liquid',
    is_cash_equivalent: false,
  })
  patchLoanRepaymentMetadataMock.mockReset()
  patchLoanRepaymentMetadataMock.mockResolvedValue({
    id: 201,
    snapshot_date: '2026-04-07',
    lender: '국민은행',
    product_name: '우리집 주담대',
    monthly_payment: '75.00',
    repayment_method: 'principal_equal',
  })
})

describe('AssetsPage', () => {
  it('keeps snapshot comparison copy on summary badges but not on KPI subtext', () => {
    const { container } = wrap(<AssetsPage />)

    expect(screen.getAllByText('2026-03-31 대비 · 7일')).toHaveLength(2)
    const kpiSubs = container.querySelectorAll('[data-testid="kpi-sub"]')
    expect(kpiSubs).toHaveLength(1)
    expect(kpiSubs[0]?.textContent).toBe('비상금 3.0개월')
    expect(screen.getByText('유동성 Health')).toBeInTheDocument()
  })

  it('shows asset and loan metadata as read-only text and routes editing to asset settings', () => {
    wrap(<AssetsPage />)

    expect(screen.getByText('생활비 통장')).toBeInTheDocument()
    expect(screen.getByText('즉시 사용')).toBeInTheDocument()
    expect(screen.getAllByText('현금성').length).toBeGreaterThan(0)
    expect(screen.getByText('원금 균등')).toBeInTheDocument()
    expect(screen.getByText('대출 성격 · 원금 균등 상환')).toBeInTheDocument()
    expect(screen.getByText('연결 거래 추정 · 완료월 중앙값')).toBeInTheDocument()
    expect(screen.getByText('계좌 성격 기준')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '자산 설정으로 이동' })).toHaveAttribute('href', '/operations/asset-settings')
    expect(screen.queryByLabelText('생활비 통장 유동성 등급')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('우리집 주담대 월상환액')).not.toBeInTheDocument()
    expect(patchAssetLiquidityMock).not.toHaveBeenCalled()
    expect(patchLoanRepaymentMetadataMock).not.toHaveBeenCalled()
  })
})
