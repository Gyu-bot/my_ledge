import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomePage } from '../../features/home/HomePage'

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

vi.mock('../../hooks/useCanonicalViews', () => ({
  useCanonicalViewsDashboard: () =>
    query({
      monthly_cashflow: [],
      true_spendable_monthly: [
        {
          period: '2026-05',
          income_total: 5_000_000,
          observed_income_total: 5_000_000,
          loan_repayment_total: 1_420_000,
          fixed_commitment_total: 800_000,
          variable_total: 1_200_000,
          required_variable_total: 400_000,
          discretionary_variable_total: 800_000,
          spendable_before_variable_spend: 2_380_000,
          remaining_after_variable_spend: 1_180_000,
          income_basis: 'observed',
          is_income_estimated: false,
          estimated_income_total: null,
          income_estimate_month_count: 0,
          income_estimate_source: null,
          excluded_income_periods: [],
          estimated_spendable_before_variable_spend: null,
          estimated_remaining_after_variable_spend: null,
        },
        {
          period: '2026-06',
          income_total: 100_000,
          observed_income_total: 100_000,
          loan_repayment_total: 1_420_000,
          fixed_commitment_total: 800_000,
          variable_total: 600_000,
          required_variable_total: 400_000,
          discretionary_variable_total: 200_000,
          spendable_before_variable_spend: -2_120_000,
          remaining_after_variable_spend: 980_000,
          income_basis: 'estimated',
          is_income_estimated: true,
          estimated_income_total: 5_000_000,
          income_estimate_month_count: 6,
          income_estimate_source: 'trailing_6_outlier_adjusted_avg',
          excluded_income_periods: ['2026-01'],
          estimated_spendable_before_variable_spend: 2_780_000,
          estimated_remaining_after_variable_spend: 1_240_000,
        },
      ],
      loan_repayment_monthly: [],
      merchant_monthly_baseline: [],
      recurring_merchant_monthly: [],
      unclassified_work_queue: [{ transaction_id: 1 }, { transaction_id: 2 }, { transaction_id: 3 }],
    }),
}))

vi.mock('../../hooks/useAnalytics', () => ({
  useMonthlyCashflow: () =>
    query({
      items: [
        { period: '2026-05', income: 5_000_000, expense: -3_000_000, transfer: 0, net_cashflow: 2_000_000, savings_rate: 0.4 },
        { period: '2026-06', income: 5_000_000, expense: -3_400_000, transfer: 0, net_cashflow: 1_600_000, savings_rate: 0.32 },
      ],
    }),
  useSpendingAnomalies: () => query({ total: 2, items: [], assumptions: '' }),
  useRecurringPayments: () => query({ total: 14, items: [], assumptions: '' }),
  useIncomeStability: () => query({ items: [], avg: 0, stdev: 0, coefficient_of_variation: 0.08, assumptions: '' }),
  useDiscretionaryVelocity: () =>
    query({
      period: '2026-06',
      as_of_date: '2026-06-10',
      month_progress_ratio: 0.33,
      discretionary_spend: 820_000,
      baseline_spend_at_same_progress: 625_000,
      velocity_ratio: 1.31,
      risk_level: 'watch',
      confidence: 0.81,
      reasons: [],
      assumptions: [],
      unclassified_spend: 0,
      classification_coverage_ratio: 0.76,
    }),
}))

vi.mock('../../hooks/useAssets', () => ({
  useAssetSnapshots: () =>
    query({
      items: [
        { snapshot_date: '2026-06-07', asset_total: '684000000', liability_total: '263000000', net_worth: '421000000' },
      ],
      asset_items: [],
    }),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useRecurringCategoryRulesDryRun: () => query({ items: [{}, {}, {}, {}] }),
  useLoanTransactionMappings: () => query({ total: 5, page: 1, per_page: 1, items: [] }),
  useTransactionList: () =>
    query({
      total: 1,
      page: 1,
      per_page: 5,
      items: [
        {
          id: 1,
          date: '2026-06-09',
          merchant: '쿠팡이츠',
          effective_category_major: '식비',
          amount: -23_000,
        },
      ],
    }),
}))

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  it('히어로: 실질 가용액을 예상 값으로 보여주고 예상 배지를 단다', () => {
    renderHome()
    expect(screen.getByText('이번 달 쓸 수 있는 돈')).toBeInTheDocument()
    expect(screen.getByText('₩124만')).toBeInTheDocument() // estimated_remaining 우선
    expect(screen.getByText('예상')).toBeInTheDocument()
  })

  it('보조 KPI: 순자산/수입/지출/저축률', () => {
    renderHome()
    expect(screen.getByText('순자산')).toBeInTheDocument()
    expect(screen.getByText('₩4.21억')).toBeInTheDocument()
    expect(screen.getByText('이번 달 지출')).toBeInTheDocument()
    // 진행월(2026-06)은 수입 추정 중 → 저축률은 마감월(2026-05) 기준
    expect(screen.getByText('40.0%')).toBeInTheDocument()
    expect(screen.getByText('2026-05 마감 기준 · 목표 50%')).toBeInTheDocument()
    expect(screen.getByText('전월 대비 +13.3%')).toBeInTheDocument()
  })

  it('주의 신호: 이상 지출·반복 결제·수입 안정성·재량 속도', () => {
    renderHome()
    expect(screen.getByText('이상 지출 카테고리')).toBeInTheDocument()
    expect(screen.getByText('2건')).toBeInTheDocument()
    expect(screen.getByText('14건')).toBeInTheDocument()
    expect(screen.getByText('안정')).toBeInTheDocument()
    expect(screen.getByText('1.31x')).toBeInTheDocument()
    expect(screen.getByText('관찰')).toBeInTheDocument()
  })

  it('해야 할 일: 인박스 카운트 + 분류 커버리지', () => {
    renderHome()
    expect(screen.getByText('미분류 거래')).toBeInTheDocument()
    expect(screen.getByText('3건')).toBeInTheDocument()
    expect(screen.getByText('4건')).toBeInTheDocument()
    expect(screen.getByText('5건')).toBeInTheDocument()
    expect(screen.getByText('76%')).toBeInTheDocument()
  })

  it('최근 거래: 부호 병기 금액', () => {
    renderHome()
    expect(screen.getByText('쿠팡이츠')).toBeInTheDocument()
    expect(screen.getByText('-₩23,000')).toBeInTheDocument()
  })
})
