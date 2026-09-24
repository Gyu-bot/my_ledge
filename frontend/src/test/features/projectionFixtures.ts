import type { MonthlyProjection } from '../../types/canonicalViews'

export function projectionFixture(): MonthlyProjection {
  return {
    period: '2026-06',
    as_of_date: '2026-06-10',
    observed_through: '2026-06-10',
    observed_income: 100_000,
    expected_remaining_income: 3_000_000,
    projected_month_income: 3_100_000,
    observed_net_expense: 800_000,
    expected_remaining_expense: 900_000,
    known_expected_remaining_expense: 900_000,
    net_after_known_remaining_expense: 1_400_000,
    projected_month_expense: 1_700_000,
    observed_net_cashflow: -700_000,
    projected_month_end_net: 1_400_000,
    confidence: 'medium',
    included_periods: ['2026-03', '2026-04', '2026-05'],
    excluded_periods: ['2026-02'],
    missing_reasons: [],
    warnings: [],
    limitations: ['보험금과 일회성 수입은 반복 예상에 포함하지 않음'],
    income_sources: [{
      source_key: 'income:샘플 회사',
      merchant: '샘플 회사',
      expected_amount: 3_000_000,
      observed_amount: 0,
      remaining_amount: 3_000_000,
      expected_day: 25,
      expected_date: null,
      expected_date_from: '2026-06-24',
      expected_date_to: '2026-06-26',
      status: 'expected',
      confidence: 'medium',
      history_periods: ['2026-03', '2026-04', '2026-05'],
      excluded_periods: ['2026-02'],
      matched_transaction_ids: [],
      reason: '완료월의 같은 입금처와 예정일 범위를 대조',
    }],
    expense_components: [
      { kind: 'loan', expected_remaining: 400_000, known_expected_remaining: 400_000, basis: '연결 거래 제외 후 예정 대출', confidence: 'medium', missing_reasons: [], warnings: [], sources: [] },
      { kind: 'installment', expected_remaining: 100_000, known_expected_remaining: 100_000, basis: '이번 달 관측 할부 차감 후', confidence: 'medium', missing_reasons: [], warnings: [], sources: [] },
      { kind: 'recurring', expected_remaining: 100_000, known_expected_remaining: 100_000, basis: '남은 날짜의 과거 결제와 이번 달 납부를 대조', confidence: 'medium', missing_reasons: [], warnings: [], sources: [] },
      { kind: 'variable', expected_remaining: 300_000, known_expected_remaining: 300_000, basis: '충분히 수집된 완료월 변동 지출', confidence: 'medium', missing_reasons: [], warnings: [], sources: [] },
    ],
    coverage: {
      basis: '업로드 수집 범위 기준',
      latest_upload_date: '2026-06-10',
      first_observed_date: '2026-02-17',
      last_observed_date: '2026-06-10',
      adequately_covered_periods: ['2026-03', '2026-04', '2026-05'],
      excluded_periods: ['2026-02'],
      missing_periods: ['2026-01'],
    },
  }
}

export function lowConfidenceProjectionFixture(): MonthlyProjection {
  const projection = projectionFixture()
  const warnings = [
    '샘플 보험: 안정적인 이력이 2개월뿐이어서 추정 신뢰도가 낮습니다.',
    '샘플 통신: 이번 달 납부가 월 지출 기준을 초과했습니다.',
  ]
  return {
    ...projection,
    confidence: 'low',
    warnings,
    expense_components: projection.expense_components.map((component) => component.kind !== 'recurring' ? component : {
      ...component,
      confidence: 'low',
      warnings,
      sources: [
        {
          source_key: 'expense:샘플 보험', merchant: '샘플 보험',
          expected_monthly_amount: 100_000, observed_payment_amount: 100_000,
          observed_refund_amount: 20_000, observed_net_expense: 80_000,
          expected_remaining: 0, additional_observed_amount: 0,
          confidence: 'low', status: 'review',
          basis: '이번 달 납부와 남은 날짜의 과거 결제를 대조하고 환급은 실적에만 반영',
          history_periods: ['2026-04', '2026-05'], excluded_periods: ['2026-03'],
          warnings: ['안정적인 이력이 2개월뿐이어서 추정 신뢰도가 낮습니다.'],
        },
        {
          source_key: 'expense:샘플 구독', merchant: '샘플 구독',
          expected_monthly_amount: 120_000, observed_payment_amount: 20_000,
          observed_refund_amount: 0, observed_net_expense: 20_000,
          expected_remaining: 100_000, additional_observed_amount: 0,
          confidence: 'medium', status: 'expected',
          basis: '월 중간 일부 납부 후 남은 날짜에 관측된 과거 결제를 반영',
          history_periods: ['2026-03', '2026-04', '2026-05'], excluded_periods: [], warnings: [],
        },
        {
          source_key: 'expense:샘플 통신', merchant: '샘플 통신',
          expected_monthly_amount: 30_000, observed_payment_amount: 45_000,
          observed_refund_amount: 0, observed_net_expense: 45_000,
          expected_remaining: 0, additional_observed_amount: 15_000,
          confidence: 'low', status: 'review',
          basis: '월 지출 기준을 넘은 관측 납부는 실적에만 반영',
          history_periods: ['2026-03', '2026-04', '2026-05'], excluded_periods: [],
          warnings: ['이번 달 납부가 월 지출 기준을 초과했습니다.'],
        },
      ],
    }),
  }
}
