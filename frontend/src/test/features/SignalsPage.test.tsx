import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SignalsPage } from '../../features/signals/SignalsPage'

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

const reviewMutate = vi.fn()

vi.mock('../../hooks/useAnalytics', () => ({
  useMonthlyCashflow: () =>
    query({
      items: [
        { period: '2026-05', income: 5_000_000, expense: -3_000_000, transfer: 0, net_cashflow: 2_000_000, savings_rate: 0.4 },
        { period: '2026-06', income: 180_000, expense: -3_400_000, transfer: 0, net_cashflow: -3_220_000, savings_rate: -17.9 },
      ],
    }),
  useIncomeStability: () =>
    query({ items: [], avg: 5_050_000, stdev: 280_000, coefficient_of_variation: 0.055, comparison_mode: 'closed', reference_date: '2026-05-31', is_partial_period: false, assumptions: 'mock' }),
  useSpendingAnomalies: () =>
    query({
      total: 1, page: 1, per_page: 8,
      items: [
        { period: '2026-05', category: '식비', amount: 740_000, baseline_avg: 410_000, delta_pct: 80.5, anomaly_score: 3.2, reason: '기준선 대비 급증' },
      ],
      comparison_mode: 'closed', reference_date: '2026-05-31', is_partial_period: false, assumptions: 'mock',
    }),
  useDiscretionaryVelocity: () =>
    query({
      period: '2026-06', as_of_date: '2026-06-10', month_progress_ratio: 0.33,
      discretionary_spend: 820_000, baseline_spend_at_same_progress: 625_000,
      velocity_ratio: 1.31, risk_level: 'watch', confidence: 0.81,
      reasons: ['기준선보다 31% 빠릅니다'], assumptions: [], unclassified_spend: 0,
      classification_coverage_ratio: 0.76,
    }),
  usePurchaseGateCandidates: () =>
    query({
      total: 1, page: 1, per_page: 10,
      items: [
        {
          candidate_type: 'large_oneoff', candidate_types: ['large_oneoff', 'new_merchant'],
          transaction_id: 42, candidate_key: 'transaction:42', date: '2026-06-08',
          merchant: '애플스토어', amount: -1_890_000, category: '디지털',
          signals: { zscore: 3.2 }, risk_level: 'warning', review_priority: 'high',
          confidence: '0.8', suggested_review_window: '7d', review_status: 'pending',
          review_memo: null, reviewed_at: null, cooldown_until: null,
          reasons: ['최근 6개월 내 최대 단건 지출'], assumptions: [],
        },
      ],
      assumptions: [],
    }),
  useRecurringPayments: () =>
    query({
      total: 1, page: 1, per_page: 8,
      items: [
        {
          merchant: '넷플릭스', category: '구독', avg_amount: 17_000, interval_type: 'monthly',
          avg_interval_days: 30, occurrences: 12, confidence: 0.93, last_date: '2026-06-01',
          recurring_payment_kind: 'monthly_recurring',
          installment_count: 0, monthly_recurring_count: 12, not_recurring_count: 0, unclassified_count: 0,
          transaction_ids: [1],
        },
      ],
      assumptions: '월 단위 반복 휴리스틱',
    }),
  useCategoryMoM: () =>
    query({
      items: [
        { period: '2026-06', previous_period: '2026-05', category: '식비', current_amount: 740_000, previous_amount: 410_000, delta_amount: 330_000, delta_pct: 80.5 },
      ],
    }),
  useMerchantSpend: () =>
    query({ items: [{ merchant: '쿠팡이츠', amount: 320_000, count: 14, avg_amount: 22_857, last_seen_at: '2026-06-09' }] }),
  useReviewPurchaseGateCandidate: () => ({ mutate: reviewMutate, isPending: false, isError: false }),
}))

vi.mock('../../hooks/useCanonicalViews', () => ({
  useCanonicalViewsDashboard: () =>
    query({
      data_coverage: { first_transaction_date: '2025-03-12', last_transaction_date: '2026-06-10' },
      monthly_cashflow: [
        { period: '2026-05', is_complete_month: true },
        { period: '2026-06', is_complete_month: false },
      ],
      true_spendable_monthly: [],
      loan_repayment_monthly: [],
      merchant_monthly_baseline: [],
      recurring_merchant_monthly: [],
      unclassified_work_queue: [],
    }),
}))

vi.mock('../../hooks/useSettings', () => ({
  useAnalyticsSettings: () =>
    query({
      defaults: {}, saved: {},
      effective: {
        financial_targets: { emergency_fund_target_months: 3, savings_rate_target: 0.5, debt_strategy_preference: null },
      },
    }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({
  useWriteAccess: () => true,
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <SignalsPage />
    </MemoryRouter>,
  )
}

describe('SignalsPage', () => {
  it('KPI: 저축률(완성월 기준)·수입 변동성·이상 카운트·재량 속도', () => {
    renderPage()
    expect(screen.getByText('40.0%')).toBeInTheDocument() // 2026-06은 미완성 → 2026-05 기준
    expect(screen.getByText('안정')).toBeInTheDocument()
    expect(screen.getByText('1개')).toBeInTheDocument()
    expect(screen.getByText('1.31x')).toBeInTheDocument()
  })

  it('신호 피드: 이상 지출 카드(심각도·근거)와 상태 신호', () => {
    renderPage()
    expect(screen.getAllByText('식비').length).toBeGreaterThan(0) // 피드 카드 + MoM 목록
    expect(screen.getAllByText('확인 필요').length).toBeGreaterThan(0) // delta 80% ≥ 50%
    expect(screen.getByText(/지출에서 식비 보기/)).toBeInTheDocument()
    expect(screen.getByText(/저축률 40.0%/)).toBeInTheDocument()
  })

  it('구매 게이트 카드: 서버 영속 리뷰 액션 (스누즈 14일 = cooldown_days)', () => {
    renderPage()
    expect(screen.getByText('애플스토어')).toBeInTheDocument()
    expect(screen.getByText('큰 일회성')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('애플스토어 리뷰 메모'), { target: { value: '계획 구매' } })
    fireEvent.click(screen.getByRole('button', { name: '스누즈 14일' }))
    expect(reviewMutate).toHaveBeenCalledWith({
      candidateKey: 'transaction:42',
      data: { review_status: 'snoozed', memo: '계획 구매', cooldown_days: 14 },
    })
  })

  it('반복 결제는 조회 전용 + 분류 바꾸기 딥링크', () => {
    renderPage()
    expect(screen.getByText('넷플릭스')).toBeInTheDocument()
    expect(screen.getByText('분류 바꾸기').closest('a')).toHaveAttribute('href', '/data/transactions?view=groups')
  })

  it('기준 모드 전환: 부분 기간 선택 시 기준일 입력 노출', () => {
    renderPage()
    expect(screen.queryByLabelText('기준일')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '부분 기간' }))
    expect(screen.getByLabelText('기준일')).toBeInTheDocument()
  })
})
