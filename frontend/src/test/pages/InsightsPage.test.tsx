import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { InsightsPage } from '../../pages/InsightsPage'

const useMerchantSpendMock = vi.fn()
const useCategoryMoMMock = vi.fn()
const useRecurringPaymentsMock = vi.fn()
const useDiscretionaryVelocityMock = vi.fn()
const usePurchaseGateCandidatesMock = vi.fn()

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
  useRecurringPayments: (...args: unknown[]) => useRecurringPaymentsMock(...args),
  useSpendingAnomalies: (...args: unknown[]) => useSpendingAnomaliesMock(...args),
  useMerchantSpend: (params: unknown) => useMerchantSpendMock(params),
  useCategoryMoM: (params: unknown) => useCategoryMoMMock(params),
  useDiscretionaryVelocity: (...args: unknown[]) => useDiscretionaryVelocityMock(...args),
  usePurchaseGateCandidates: (...args: unknown[]) => usePurchaseGateCandidatesMock(...args),
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
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-08T09:00:00+09:00'))
    useMerchantSpendMock.mockImplementation(() => ({ data: { items: [] }, isLoading: false }))
    useCategoryMoMMock.mockImplementation(() => ({ data: { items: [] }, isLoading: false }))
    useRecurringPaymentsMock.mockImplementation(() => ({ data: { total: 0, items: [], assumptions: '' }, isLoading: false }))
    useSpendingAnomaliesMock.mockImplementation(() => ({ data: { total: 0, items: [], assumptions: '' }, isLoading: false }))
    useDiscretionaryVelocityMock.mockImplementation(() => ({ data: undefined, isLoading: false }))
    usePurchaseGateCandidatesMock.mockImplementation(() => ({ data: { total: 0, items: [], assumptions: '' }, isLoading: false }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requests merchant spend with the selected period option', () => {
    wrap(<InsightsPage />)

    expect(useMerchantSpendMock).toHaveBeenCalledWith(expect.objectContaining({ months: 3, limit: 5 }))
  })

  it('renders local controls for merchant period and category base month', () => {
    wrap(<InsightsPage />)

    expect(screen.getByLabelText('거래처 소비 기간')).toBeInTheDocument()
    expect(screen.getByLabelText('카테고리 기준월')).toBeInTheDocument()
    expect(screen.getByLabelText('이상 지출 기준')).toBeInTheDocument()
  })

  it('uses the last closed month by default and allows switching to partial mode', () => {
    wrap(<InsightsPage />)

    expect(useSpendingAnomaliesMock).toHaveBeenCalledWith({ page: 1, per_page: 10 })
    expect(screen.getAllByText('직전 마감월')).not.toHaveLength(0)

    fireEvent.change(screen.getByLabelText('이상 지출 기준'), { target: { value: 'partial' } })

    expect(useSpendingAnomaliesMock).toHaveBeenLastCalledWith({
      page: 1,
      per_page: 10,
      end_date: '2026-04-08',
    })
    expect(screen.getAllByText('부분 기간')).not.toHaveLength(0)
  })

  it('shows anomaly guidance text that matches the selected mode', () => {
    useSpendingAnomaliesMock.mockImplementation(() => ({
      data: { total: 0, items: [], assumptions: 'threshold는 anomaly_score 기준입니다.' },
      isLoading: false,
    }))

    wrap(<InsightsPage />)

    fireEvent.click(screen.getAllByRole('button', { name: '진단 기준' })[1])
    expect(screen.getAllByText('기본값은 직전 마감월 전체 지출을 기준으로 이상지출을 탐지합니다.')).not.toHaveLength(0)

    fireEvent.change(screen.getByLabelText('이상 지출 기준'), { target: { value: 'partial' } })
    expect(screen.getAllByText('부분 기간은 2026-04-08까지 누적 지출을 이전 월의 같은 일자 cutoff와 비교합니다.')).not.toHaveLength(0)
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

  it('shows recurring payment classification as a read-only insight result', () => {
    useRecurringPaymentsMock.mockImplementation(() => ({
      data: {
        total: 1,
        assumptions: '동일 거래처 기준',
        items: [
          {
            merchant: '통신사',
            category: '통신',
            avg_amount: 90000,
            interval_type: 'monthly',
            avg_interval_days: 31,
            occurrences: 2,
            confidence: 0.99,
            last_date: '2026-02-01',
            recurring_payment_kind: 'monthly_recurring',
            installment_count: 0,
            monthly_recurring_count: 2,
            unclassified_count: 0,
            transaction_ids: [11, 12],
          },
        ],
      },
      isLoading: false,
    }))

    wrap(<InsightsPage />)

    expect(screen.getByText('매월 반복')).toBeInTheDocument()
    expect(screen.getByText('매월 2 · 미분류 0')).toBeInTheDocument()
    expect(screen.queryByLabelText('통신사 반복결제 분류')).not.toBeInTheDocument()
  })

  it('renders discretionary spending velocity as a quiet signal', () => {
    useDiscretionaryVelocityMock.mockImplementation(() => ({
      data: {
        period: '2026-04',
        as_of_date: '2026-04-08',
        month_progress_ratio: 0.27,
        discretionary_spend: 210000,
        baseline_spend_at_same_progress: 180000,
        velocity_ratio: 1.17,
        risk_level: 'warning',
        confidence: 0.82,
        reasons: ['재량 지출이 진행률 대비 기준선보다 빠릅니다.'],
        assumptions: ['최근 6개 마감월 기준선'],
        unclassified_spend: 30000,
        classification_coverage_ratio: 0.74,
        income_basis: 'observed',
      },
      isLoading: false,
    }))

    wrap(<InsightsPage />)

    expect(screen.getByText('재량 지출 속도')).toBeInTheDocument()
    expect(screen.getByText('1.17x')).toBeInTheDocument()
    expect(screen.getByText('조용한 참고 신호')).toBeInTheDocument()
    expect(screen.getByText('분류 커버리지 74.0%')).toBeInTheDocument()
  })

  it('renders purchase gate candidates without presenting a buy decision', () => {
    usePurchaseGateCandidatesMock.mockImplementation(() => ({
      data: {
        total: 1,
        assumptions: '구매 허용/금지가 아니라 리뷰 후보만 제공합니다.',
        page: 1,
        per_page: 5,
        items: [
          {
            candidate_type: 'new_merchant',
            candidate_types: ['new_merchant', 'merchant_spike'],
            transaction_id: 42,
            candidate_key: 'new_merchant:42',
            merchant: '새거래처',
            date: '2026-04-07',
            amount: 145000,
            category: '생활',
            signals: { new_merchant: true, threshold_amount: 100000 },
            risk_level: 'watch',
            review_priority: 'medium',
            confidence: 'medium',
            suggested_review_window: '14일',
            review_status: 'pending',
            reasons: ['새 거래처의 큰 재량 지출 후보입니다.'],
            assumptions: ['기본 기준 100,000원'],
          },
        ],
      },
      isLoading: false,
    }))

    wrap(<InsightsPage />)

    expect(screen.getByText('구매 게이트 후보')).toBeInTheDocument()
    expect(screen.getByText('새거래처')).toBeInTheDocument()
    expect(screen.getByText('신규 거래처')).toBeInTheDocument()
    expect(screen.getByText('거래처 급증')).toBeInTheDocument()
    expect(screen.getByText('리뷰 후보')).toBeInTheDocument()
    expect(screen.getByText('new_merchant: true')).toBeInTheDocument()
    expect(screen.queryByText(/구매 허용|구매 금지/)).not.toBeInTheDocument()
  })
})
