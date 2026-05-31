import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AssetSettingsPage } from '../../pages/AssetSettingsPage'

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
          liquidity_tier: 'immediate',
          is_cash_equivalent: true,
        },
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
          monthly_payment_source: 'estimated_from_linked_transactions',
          repayment_method_source: 'estimated_from_linked_transactions',
          loan_kind: 'equal_principal_interest',
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

describe('AssetSettingsPage', () => {
  it('saves editable liquidity metadata for each asset snapshot row', async () => {
    wrap(<AssetSettingsPage />)

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
    wrap(<AssetSettingsPage />)

    expect(screen.getByText('연결 거래 기준 월상환액')).toBeInTheDocument()
    expect(screen.getByText('₩ 50')).toBeInTheDocument()
    expect(screen.getByText('완료월 중앙값')).toBeInTheDocument()
    expect(screen.getByText('수동 월상환액')).toBeInTheDocument()

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

  it('does not mark an estimated monthly payment as manual when only saving repayment method', async () => {
    wrap(<AssetSettingsPage />)

    fireEvent.change(screen.getByLabelText('우리집 주담대 상환 방식'), {
      target: { value: 'principal_equal' },
    })
    fireEvent.click(screen.getByRole('button', { name: '우리집 주담대 상환 메타 저장' }))

    await waitFor(() => {
      expect(patchLoanRepaymentMetadataMock).toHaveBeenCalledWith({
        id: 201,
        data: {
          repayment_method: 'principal_equal',
        },
      })
    })
  })

  it('keeps read-only banner and disabled controls when write access is unavailable', () => {
    mockUseWriteAccess.mockReturnValue(false)

    wrap(<AssetSettingsPage />)

    expect(screen.getByText('읽기 전용 모드')).toBeInTheDocument()
    expect(screen.getByLabelText('생활비 통장 유동성 등급')).toBeDisabled()
    expect(screen.getByLabelText('생활비 통장 현금성 자산')).toBeDisabled()
    expect(screen.getByRole('button', { name: '생활비 통장 유동성 저장' })).toBeDisabled()
    expect(screen.getByLabelText('우리집 주담대 월상환액')).toBeDisabled()
    expect(screen.getByLabelText('우리집 주담대 상환 방식')).toBeDisabled()
    expect(screen.getByRole('button', { name: '우리집 주담대 상환 메타 저장' })).toBeDisabled()
  })
})
