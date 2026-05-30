import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
          repayment_method: 'principal_interest',
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

  it('saves editable liquidity metadata for each asset snapshot row', async () => {
    wrap(<AssetsPage />)

    fireEvent.change(screen.getByLabelText('생활비 통장 유동성 등급'), {
      target: { value: 'near_liquid' },
    })
    fireEvent.click(screen.getByLabelText('생활비 통장 현금성 자산'))
    fireEvent.click(screen.getByRole('button', { name: '생활비 통장 유동성 저장' }))

    await waitFor(() => {
      expect(patchAssetLiquidityMock).toHaveBeenCalledWith({
        id: 101,
        data: {
          liquidity_tier: 'near_liquid',
          is_cash_equivalent: false,
        },
      })
    })
  })

  it('saves editable monthly payment and repayment method for each loan row', async () => {
    wrap(<AssetsPage />)

    fireEvent.change(screen.getByLabelText('우리집 주담대 월상환액'), {
      target: { value: '75' },
    })
    fireEvent.change(screen.getByLabelText('우리집 주담대 상환 방식'), {
      target: { value: 'principal_equal' },
    })
    fireEvent.click(screen.getByRole('button', { name: '우리집 주담대 상환 메타 저장' }))

    await waitFor(() => {
      expect(patchLoanRepaymentMetadataMock).toHaveBeenCalledWith({
        id: 201,
        data: {
          monthly_payment: '75',
          repayment_method: 'principal_equal',
        },
      })
    })
  })

  it('disables asset and loan metadata editing when write access is unavailable', () => {
    mockUseWriteAccess.mockReturnValue(false)

    wrap(<AssetsPage />)

    expect(screen.getByText('읽기 전용 모드')).toBeInTheDocument()
    expect(screen.getByLabelText('생활비 통장 유동성 등급')).toBeDisabled()
    expect(screen.getByLabelText('생활비 통장 현금성 자산')).toBeDisabled()
    expect(screen.getByRole('button', { name: '생활비 통장 유동성 저장' })).toBeDisabled()
    expect(screen.getByLabelText('우리집 주담대 월상환액')).toBeDisabled()
    expect(screen.getByLabelText('우리집 주담대 상환 방식')).toBeDisabled()
    expect(screen.getByRole('button', { name: '우리집 주담대 상환 메타 저장' })).toBeDisabled()
  })
})
