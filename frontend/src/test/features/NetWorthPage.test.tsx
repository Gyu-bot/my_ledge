import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NetWorthPage } from '../../features/networth/NetWorthPage'

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

vi.mock('../../hooks/useAssets', () => ({
  useAssetSnapshots: () =>
    query({
      items: [{ snapshot_date: '2026-06-07', asset_total: '684000000', liability_total: '263000000', net_worth: '421000000' }],
      asset_items: [
        { id: 1, snapshot_date: '2026-06-07', side: 'asset', category: '자유입출금', product_name: '토스뱅크', amount: '8100000', liquidity_tier: 'immediate', is_cash_equivalent: true },
        { id: 2, snapshot_date: '2026-06-07', side: 'asset', category: '부동산', product_name: '아파트', amount: '650000000', liquidity_tier: null, is_cash_equivalent: null },
      ],
    }),
  useNetWorthHistory: () =>
    query({ items: [
      { snapshot_date: '2026-05-01', net_worth: '394000000' },
      { snapshot_date: '2026-06-07', net_worth: '421000000' },
    ] }),
  useAssetSnapshotCompare: () =>
    query({
      comparison_mode: 'latest_available_vs_previous_available',
      current: { snapshot_date: '2026-06-07', asset_total: '684000000', liability_total: '263000000', net_worth: '421000000' },
      baseline: { snapshot_date: '2026-05-01', asset_total: '662000000', liability_total: '268000000', net_worth: '394000000' },
      delta: { asset_total: '22000000', liability_total: '-5000000', net_worth: '27000000', asset_total_pct: 0.033, liability_total_pct: -0.018, net_worth_pct: 0.0685 },
      comparison_days: 37,
      is_partial: false,
      is_stale: false,
      can_compare: true,
      comparison_label: '이전 스냅샷 대비',
    }),
  useNetWorthBreakdown: () =>
    query({
      snapshot_date: '2026-06-07',
      asset_total: '684000000',
      negative_asset_excluded_total: '1200000',
      liability_total: '263000000',
      net_worth: '421000000',
      items: [
        { side: 'asset', category: '부동산', amount: '650000000', ratio: 0.95 },
        { side: 'liability', category: '주택담보대출', amount: '240000000', ratio: 0.91 },
      ],
    }),
  useLiquidityHealth: () =>
    query({
      snapshot_date: '2026-06-07',
      cash_equivalent_total: '18200000',
      asset_total: '684000000',
      negative_asset_excluded_total: '1200000',
      liability_total: '263000000',
      net_worth: '421000000',
      monthly_required_spend: '5300000',
      emergency_fund_months: 3.4,
      emergency_fund_target_months: 4,
      target_progress_ratio: 0.85,
      monthly_debt_payment: '1420000',
      monthly_income: '5050000',
      debt_payment_ratio: 0.28,
      debt_to_asset_ratio: 0.38,
      confidence: 'medium',
      assumptions: ['negative_asset_rows_excluded'],
    }),
  useLoanSummary: () =>
    query({
      snapshot_date: '2026-06-07',
      totals: { principal: '300000000', balance: '263000000' },
      items: [
        {
          id: 1, loan_type: '은행 대출', lender: '국민은행', product_name: '주택담보대출',
          principal: '300000000', balance: '240000000', interest_rate: '3.85',
          monthly_payment: '1420000', repayment_method: 'principal_interest',
          monthly_payment_source: 'estimated_from_linked_transactions', repayment_method_source: 'derived_from_loan_account',
          loan_kind: 'equal_principal_interest', start_date: '2023-01-01', maturity_date: '2053-01-01',
        },
      ],
    }),
  useInvestmentSummary: () =>
    query({
      snapshot_date: '2026-06-07',
      totals: { cost_basis: '120000000', market_value: '160000000' },
      items: [
        { product_type: '주식', broker: '증권사A', product_name: '미국주식ETF', cost_basis: '60000000', market_value: '67200000', return_rate: '12.4', pct_of_investment_total: 0.42 },
      ],
    }),
  useInsuranceSummary: () =>
    query({
      snapshot_date: '2026-06-07',
      items: [
        { id: 1, snapshot_date: '2026-06-07', insurer: '한화생명', product_name: '종신보험', contract_status: '유지', total_paid: '8400000', contract_date: '2020-05-01', maturity_date: null },
      ],
      monthly_premium_estimate: { period: '2026-05', amount: '214000', assumptions: ['최근 마감월 보험 카테고리 지출 기반'] },
    }),
}))

vi.mock('../../hooks/useProfile', () => ({
  useProfile: () =>
    query({
      snapshot_date: '2026-06-07',
      gender: '남',
      age: 34,
      credit_score_kcb: 942,
      credit_score_history: [
        { snapshot_date: '2026-05-01', credit_score_kcb: 931 },
        { snapshot_date: '2026-06-07', credit_score_kcb: 942 },
      ],
    }),
}))

vi.mock('../../hooks/useSettings', () => ({
  useAnalyticsSettings: () =>
    query({
      defaults: {},
      saved: {},
      effective: {
        financial_targets: { emergency_fund_target_months: 4, savings_rate_target: 0.5, debt_strategy_preference: 'avalanche' },
      },
    }),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useInstallmentForecast: () =>
    query({
      monthly_summary: [
        { period: '2026-07', observed_total: 0, projected_total: 330_000, missed_total: 0 },
        { period: '2026-08', observed_total: 0, projected_total: 330_000, missed_total: 110_000 },
      ],
      items: [],
    }),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <NetWorthPage />
    </MemoryRouter>,
  )
}

describe('NetWorthPage', () => {
  it('KPI: 순자산/총자산(음수 자산 제외 ⓘ)/총부채/현금성', () => {
    renderPage()
    expect(screen.getAllByText('₩4.21억').length).toBeGreaterThan(0) // KPI + 추이 차트 축 라벨
    expect(screen.getByText('₩6.84억')).toBeInTheDocument()
    expect(screen.getByLabelText('총자산 계산 기준 근거 보기')).toBeInTheDocument()
    expect(screen.getByText('비상금 3.4개월')).toBeInTheDocument()
  })

  it('비교 모드 선택과 비교 메타를 보여준다', () => {
    renderPage()
    expect(screen.getByRole('tablist', { name: '스냅샷 비교 모드' })).toBeInTheDocument()
    expect(screen.getByText(/2026-05-01 대비/)).toBeInTheDocument()
  })

  it('신용점수 카드: KCB 점수 + 프로필 메타', () => {
    renderPage()
    expect(screen.getByText('신용점수 (KCB)')).toBeInTheDocument()
    expect(screen.getByText('942')).toBeInTheDocument()
    expect(screen.getByText(/34세 · 남/)).toBeInTheDocument()
  })

  it('유동성: 비상금 목표 게이지 (3.4 / 4개월, 85%)', () => {
    renderPage()
    expect(screen.getByText('비상금 목표 3.4 / 4개월')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
  })

  it('대출 카드: 월 이자 추정(단리)과 정렬 기준(고금리순)', () => {
    renderPage()
    expect(screen.getByText(/정렬 고금리순/)).toBeInTheDocument()
    // 240,000,000 × 3.85% / 12 = 770,000
    expect(screen.getByText(/월 이자 추정 ₩77만/)).toBeInTheDocument()
  })

  it('투자(비중)와 보험(월 보험료 추정) 보드를 렌더한다', () => {
    renderPage()
    expect(screen.getByText('미국주식ETF')).toBeInTheDocument()
    expect(screen.getByText('종신보험')).toBeInTheDocument()
    expect(screen.getByText('₩214,000')).toBeInTheDocument()
  })

  it('할부 잔여 요약 (잔여 + 누락 배지)', () => {
    renderPage()
    expect(screen.getByText('할부 잔여')).toBeInTheDocument()
    expect(screen.getByText('₩77만')).toBeInTheDocument()
    expect(screen.getByText('누락 ₩11만')).toBeInTheDocument()
  })
})
