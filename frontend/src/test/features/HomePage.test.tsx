import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomePage } from '../../features/home/HomePage'
import { lowConfidenceProjectionFixture, projectionFixture } from './projectionFixtures'

let monthProjection = projectionFixture()
let emptyDatabase = false

vi.mock('../../ds/charts/CashflowChart', () => ({
  CashflowChart: ({ items }: { items: { income: number }[] }) => <div data-testid="observed-chart">{JSON.stringify(items)}</div>,
}))

beforeEach(() => { monthProjection = projectionFixture(); emptyDatabase = false })

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

vi.mock('../../hooks/useSettings', () => ({
  useAnalyticsSettings: () =>
    query({
      defaults: {},
      saved: {},
      effective: {
        financial_targets: {
          emergency_fund_target_months: 3,
          savings_rate_target: 0.5,
          debt_strategy_preference: null,
        },
      },
    }),
}))

vi.mock('../../hooks/useCanonicalViews', () => ({
  useCanonicalViewsDashboard: () =>
    query({
      month_projection: monthProjection,
      unclassified_work_queue_total: emptyDatabase ? 0 : 127,
      data_coverage: { first_transaction_date: '2025-03-12', last_transaction_date: '2026-06-10' },
      monthly_cashflow: emptyDatabase ? [] : [
        { period: '2026-05', is_complete_month: true },
        { period: '2026-06', is_complete_month: false },
      ],
      true_spendable_monthly: emptyDatabase ? [] : [
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
      unclassified_work_queue: emptyDatabase ? [] : [{ transaction_id: 1 }, { transaction_id: 2 }, { transaction_id: 3 }],
    }),
}))

vi.mock('../../hooks/useAnalytics', () => ({
  useMonthlyCashflow: () =>
    query({
      items: emptyDatabase ? [] : [
        { period: '2026-05', income: 5_000_000, expense: 3_000_000, transfer: 0, net_cashflow: 2_000_000, savings_rate: 0.4 },
        { period: '2026-06', income: 100_000, expense: 800_000, transfer: 0, net_cashflow: -700_000, savings_rate: null },
      ],
    }),
  useSpendingAnomalies: () => query({ total: 2, items: [], assumptions: '', reference_date: '2026-05-31' }),
  useRecurringPayments: () => query({ total: 14, items: [], assumptions: '' }),
  useIncomeStability: () => query({ items: [], avg: 0, stdev: 0, coefficient_of_variation: 0.08, assumptions: '', reference_date: '2026-05-31' }),
  useDiscretionaryVelocity: () =>
    query({
      period: '2026-06',
      as_of_date: '2026-06-10',
      month_progress_ratio: 0.33,
      discretionary_spend: 820_000,
      baseline_monthly_spend: 1_890_000,
      baseline_spend_at_same_progress: 625_000,
      velocity_ratio: 1.31,
      risk_level: 'watch',
      confidence: 'medium',
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
  it('빈 DB가 기본 projection 객체를 반환해도 시작하기를 표시한다', () => {
    emptyDatabase = true
    monthProjection = {
      ...monthProjection,
      observed_income: 0,
      observed_net_expense: 0,
      observed_net_cashflow: 0,
      expected_remaining_income: 0,
      projected_month_income: 0,
      income_sources: [],
      coverage: { ...monthProjection.coverage, first_observed_date: null, last_observed_date: null },
    }
    renderHome()
    expect(screen.getByText('시작하기')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '가져오기에서 업로드 시작' })).toHaveAttribute('href', '/data/import')
    expect(screen.queryByText('월말 예상 순현금흐름')).not.toBeInTheDocument()
  })

  it('거래가 아직 없어도 설정한 수입 예상이 있으면 전망을 표시한다', () => {
    emptyDatabase = true
    monthProjection = { ...monthProjection, coverage: { ...monthProjection.coverage, first_observed_date: null, last_observed_date: null } }
    renderHome()
    expect(screen.queryByText('시작하기')).not.toBeInTheDocument()
    expect(screen.getByText('월말 예상 순현금흐름')).toBeInTheDocument()
    expect(screen.getByText('샘플 회사')).toBeInTheDocument()
  })

  it('대표 예정일이 있어도 분할 입금 범위를 함께 표시한다', () => {
    monthProjection.income_sources[0].expected_date = '2026-06-25'
    renderHome()
    expect(screen.getByText(/예정일 2026-06-25 · 입금 범위 2026-06-24 ~ 2026-06-26/)).toBeInTheDocument()
  })

  it('관측 순현금흐름과 남은 지출을 포함한 월말 전망을 분리하고 음수 부호를 보존한다', () => {
    renderHome()
    expect(screen.getByText('월말 예상 순현금흐름')).toBeInTheDocument()
    expect(screen.getAllByText('+₩140만').length).toBeGreaterThan(0)
    expect(screen.getAllByText('-₩70만').length).toBeGreaterThan(0)
    expect(screen.queryByText('이번 달 쓸 수 있는 돈')).not.toBeInTheDocument()
    expect(screen.queryByText('₩124만')).not.toBeInTheDocument()
    expect(screen.getByText('이번 달 관측 수입')).toBeInTheDocument()
    expect(screen.getByText('월 예상 수입 +₩310만')).toBeInTheDocument()
  })

  it('잔여 지출 부족은 0원이나 월말 예상액으로 표시하지 않는다', () => {
    monthProjection = { ...monthProjection, expected_remaining_expense: null, projected_month_expense: null, projected_month_end_net: null, confidence: 'unavailable', missing_reasons: ['변동 지출 이력 부족'] }
    renderHome()
    expect(screen.getByText('입력 부족')).toBeInTheDocument()
    expect(screen.getByText('산출 제한: 변동 지출 이력 부족')).toBeInTheDocument()
    expect(screen.getByText('일부 항목의 추정만 반영한 차액 +₩140만')).toBeInTheDocument()
    expect(screen.getByText('월말 전망 아님 · 추정하지 못한 지출은 차감되지 않았습니다.')).toBeInTheDocument()
    expect(screen.queryByText('예상 · 신뢰도 낮음')).not.toBeInTheDocument()
  })

  it('반복지출 이력이 약해도 계산된 월말 전망과 낮은 신뢰도를 함께 표시한다', () => {
    monthProjection = lowConfidenceProjectionFixture()
    renderHome()
    const hero = screen.getByText('월말 예상 순현금흐름').parentElement!
    expect(within(hero).getByText('+₩140만')).toBeInTheDocument()
    expect(within(hero).getByText('예상 · 신뢰도 낮음')).toBeInTheDocument()
    expect(within(hero).getByText(/확인이 필요한 가정을 포함한 추정/)).toBeInTheDocument()
    expect(screen.queryByText('입력 부족')).not.toBeInTheDocument()
    expect(screen.queryByText(/산출 제한:/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('전망 확인 사항')).toHaveTextContent('2건')
  })

  it('반복결제 상세에서 실제 납부와 환급, 남은 예상, 기준 초과 결제를 구분한다', () => {
    monthProjection = lowConfidenceProjectionFixture()
    renderHome()
    const summary = screen.getByText('반복결제 거래처별 근거 3곳 · 확인 필요 2곳')
    fireEvent.click(summary)
    expect(summary.closest('details')).toHaveAttribute('open')
    const sources = within(screen.getByRole('list', { name: '반복결제 거래처별 전망' }))
    const insurance = within(sources.getByText('샘플 보험').closest('li')!)
    expect(insurance.getByText('이번 달 납부').parentElement).toHaveTextContent('₩100,000')
    expect(insurance.getByText('이번 달 환급').parentElement).toHaveTextContent('₩20,000')
    expect(insurance.getByText('남은 예상').parentElement).toHaveTextContent('₩0')
    expect(insurance.getByText('관측 순지출').parentElement).toHaveTextContent('+₩80,000')
    expect(insurance.getByText('근거 월 2026-04, 2026-05 · 제외 월 2026-03')).toBeInTheDocument()
    expect(insurance.getByText('안정적인 이력이 2개월뿐이어서 추정 신뢰도가 낮습니다.')).toBeInTheDocument()
    const subscription = within(sources.getByText('샘플 구독').closest('li')!)
    expect(subscription.getByText('남은 예상').parentElement).toHaveTextContent('₩100,000')
    expect(subscription.getByText('추가 지출 예상')).toBeInTheDocument()
    expect(sources.getByText('기준 초과 결제 ₩15,000 · 이번 달 실적에 반영')).toBeInTheDocument()
    expect(screen.getByText(/환급을 새로 낼 금액으로 더하지 않습니다/)).toBeInTheDocument()
    expect(screen.queryByText('납부 완료')).not.toBeInTheDocument()
  })

  it('추가 예상이 없는 거래처도 납부 완료로 단정하지 않고 환급 순지출의 음수를 보존한다', () => {
    monthProjection = lowConfidenceProjectionFixture()
    const recurring = monthProjection.expense_components.find((component) => component.kind === 'recurring')!
    recurring.sources[0] = { ...recurring.sources[0], observed_payment_amount: 0, observed_refund_amount: 20_000, observed_net_expense: -20_000, status: 'observed' }
    renderHome()
    fireEvent.click(screen.getByText('반복결제 거래처별 근거 3곳 · 확인 필요 1곳'))
    const insurance = within(screen.getByText('샘플 보험').closest('li')!)
    expect(insurance.getByText('추가 예상 없음')).toBeInTheDocument()
    expect(insurance.getByText('관측 순지출').parentElement).toHaveTextContent('-₩20,000')
    expect(insurance.getByText('남은 예상').parentElement).toHaveTextContent('₩0')
    expect(screen.queryByText('납부 완료')).not.toBeInTheDocument()
  })

  it('거래처별 추정 근거가 전혀 없으면 월 기준액과 잔여액을 0원으로 표시하지 않는다', () => {
    monthProjection = lowConfidenceProjectionFixture()
    const recurring = monthProjection.expense_components.find((component) => component.kind === 'recurring')!
    recurring.sources[0] = { ...recurring.sources[0], expected_monthly_amount: null, expected_remaining: null, confidence: 'unavailable' }
    monthProjection = { ...monthProjection, expected_remaining_expense: null, projected_month_expense: null, projected_month_end_net: null, confidence: 'unavailable' }
    renderHome()
    fireEvent.click(screen.getByText('반복결제 거래처별 근거 3곳 · 확인 필요 2곳'))
    const insurance = within(screen.getByText('샘플 보험').closest('li')!)
    expect(insurance.getByText('월 지출 기준').parentElement).toHaveTextContent('산출 불가')
    expect(insurance.getByText('남은 예상').parentElement).toHaveTextContent('산출 불가')
    expect(insurance.getByText('남은 예상').parentElement).not.toHaveTextContent('₩0')
  })

  it('같은 달 실적과 전망을 함께 비교하고 차트 데이터는 실적 그대로 보존한다', () => {
    renderHome()
    const table = screen.getByRole('table', { name: '2026-06 관측과 전망 비교' })
    expect(within(table).getByText('관측 실적')).toBeInTheDocument()
    expect(within(table).getByText('월말 전망')).toBeInTheDocument()
    expect(screen.getByTestId('observed-chart')).toHaveTextContent('100000')
    expect(screen.getByTestId('observed-chart')).not.toHaveTextContent('3100000')
    expect(screen.getByText('이번 달 누적 / 전월 전체 -73.3%')).toBeInTheDocument()
    expect(screen.getByText('40.0%')).toBeInTheDocument()
    expect(screen.getByText('2026-05 마감 기준 · 목표 50%')).toBeInTheDocument()
  })

  it('입금 일정 범위와 근거, 지출별 잔여액, 누락 월을 노출한다', () => {
    renderHome()
    expect(screen.getByText('샘플 회사')).toBeInTheDocument()
    expect(screen.getByText(/입금 범위 2026-06-24 ~ 2026-06-26/)).toBeInTheDocument()
    expect(screen.getByText(/최신 업로드 2026-06-10/)).toBeInTheDocument()
    expect(screen.getByText('완료월의 같은 입금처와 예정일 범위를 대조')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '남은 예상 지출' })).getByText('대출')).toBeInTheDocument()
    expect(screen.getByText('2026-01')).toBeInTheDocument()
    expect(screen.getByText(/현재 계좌 잔액과는 별개이며/)).toBeInTheDocument()
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

  it('주의 신호는 항목별 실제 조회 기간을 표시하고 신호 화면의 현재 전환 기능을 안내한다', () => {
    renderHome()
    expect(screen.getByText('항목별 기준')).toBeInTheDocument()
    expect(screen.getByText('직전 마감월 · 2026-05')).toBeInTheDocument()
    expect(screen.getByText('직전 마감월까지 · 2026-05-31 기준')).toBeInTheDocument()
    expect(screen.getByText('2026-06 진행월 · 2026-06-10 기준')).toBeInTheDocument()
    expect(screen.getByText('전체 이력 · 현재 구독 수 아님')).toBeInTheDocument()
    expect(screen.queryByText('직전 마감월 기준')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '주의 신호 기준 근거 보기' }))
    expect(screen.getByText(/신호 화면에서 마감월·부분 기간 기준을 전환할 수 있습니다/)).toBeInTheDocument()
    expect(screen.queryByText(/제공할 예정/)).not.toBeInTheDocument()
  })

  it('수입 계산 근거에서 축약 전 정확한 관측·잔여·월 예상액을 확인할 수 있다', () => {
    monthProjection = { ...monthProjection, observed_income: 17, expected_remaining_income: 3_123_456, projected_month_income: 3_123_473 }
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: '월 예상 수입 계산 근거 보기' }))
    expect(screen.getByText('₩3,123,473')).toBeInTheDocument()
    expect(screen.getByText('₩3,123,456')).toBeInTheDocument()
    expect(screen.getAllByText('₩17').length).toBeGreaterThan(0)
    expect(screen.getByText('월 예상 수입 = 관측 수입 + 남은 예상 수입')).toBeInTheDocument()
  })

  it('해야 할 일: 인박스 카운트 + 분류 커버리지', () => {
    renderHome()
    expect(screen.getByText('분류 품질 검토')).toBeInTheDocument()
    expect(screen.getByText('127건')).toBeInTheDocument()
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
