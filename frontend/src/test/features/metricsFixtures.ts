// 합성 자료만 사용한다 (공개 저장소). 이름과 금액은 실제 장부와 무관하다.
import type {
  ComparisonBasis,
  ContributionResponse,
  MetricContract,
  MetricDataStatusResponse,
  MonthlyFlowMonth,
  ProjectionAccuracy,
  ReadReviewItemsResponse,
  SpendCubeResponse,
} from '../../types/metrics'

export function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: () => undefined }
}

export function failed(message = '500: boom') {
  return { data: undefined, isLoading: false, error: new Error(message), refetch: () => undefined }
}

export function loading() {
  return { data: undefined, isLoading: true, error: null, refetch: () => undefined }
}

export const AS_OF = {
  transaction_as_of: '2026-08-14',
  transaction_as_of_basis: 'max_effective_transaction_date',
  first_transaction_date: '2026-01-01',
  last_closed_period: '2026-07',
  in_progress_period: '2026-08',
  snapshot_as_of: { assets: '2026-07-31', loans: '2026-06-30', investments: null, insurance: null, profile: null },
}

export function dataStatusFixture(overrides: Partial<MetricDataStatusResponse> = {}): MetricDataStatusResponse {
  return {
    as_of: AS_OF,
    closed_periods: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-06', '2026-07'],
    in_progress_period: '2026-08',
    adjustability_undecided_total: 300_000,
    adjustability_undecided_share: 0.1,
    total_outflow: 3_000_000,
    excluded_currency: [],
    non_krw_transaction_count: 1,
    ...overrides,
  }
}

export function contractFixture(): MetricContract {
  return {
    definition: 'monthly_flow.v2',
    scope: '합성',
    inclusion: {
      basis_view: 'vw_metric_flow_lines',
      currency: 'KRW',
      excluded: [],
      sign_convention: '',
      refunds: '',
      transfers: '',
      loans: '',
      period_attribution: '',
    },
    as_of: AS_OF,
    adjustability_undecided_total: 300_000,
    adjustability_undecided_share: 0.1,
    non_krw_transaction_count: 1,
    field_scopes: {},
  }
}

export function monthFixture(period: string, status: 'closed' | 'in_progress', scale = 1): MonthlyFlowMonth {
  const s = (value: number) => value * scale
  return {
    period,
    month_status: status,
    income_total: s(1_000_000),
    committed_loan_total: s(200_000),
    committed_installment_total: s(50_000),
    committed_recurring_total: s(30_000),
    committed_total: s(280_000),
    ad_hoc_protected_total: s(120_000),
    ad_hoc_adjustable_total: s(90_000),
    undecided_total: s(60_000),
    total_outflow: s(550_000),
    living_spend: s(350_000),
    adjustable_spend: s(95_000),
    protected_spend: s(390_000),
    adjustability_undecided_total: s(65_000),
    adjustability_undecided_share: 0.1182,
    residual: s(450_000),
    residual_rate: status === 'closed' ? 0.45 : null,
    transfer_net: s(-100_000),
    transfer_activity_total: s(300_000),
    other_type_total: 0,
    refund_total: s(5_000),
    signed_total: s(350_000),
    transaction_count: 40,
    rows: [
      { section: 'income', row: 'income_undetermined', amount: s(1_000_000), signed_amount: s(1_000_000), transaction_count: 2 },
      { section: 'committed', row: 'committed_loan', amount: s(200_000), signed_amount: s(-200_000), transaction_count: 1 },
      { section: 'committed', row: 'committed_installment', amount: s(50_000), signed_amount: s(-50_000), transaction_count: 1 },
      { section: 'committed', row: 'committed_recurring', amount: s(30_000), signed_amount: s(-30_000), transaction_count: 1 },
      { section: 'ad_hoc', row: 'ad_hoc_protected', amount: s(120_000), signed_amount: s(-120_000), transaction_count: 5 },
      { section: 'ad_hoc', row: 'ad_hoc_adjustable', amount: s(90_000), signed_amount: s(-90_000), transaction_count: 6 },
      { section: 'undecided', row: 'undecided', amount: s(60_000), signed_amount: s(-60_000), transaction_count: 3 },
      { section: 'transfer', row: 'transfer_undetermined', amount: s(-100_000), signed_amount: s(-100_000), transaction_count: 2 },
    ],
    transfer_investment_net: s(-80_000),
    transfer_savings_net: 0,
    transfer_investment_savings_net: s(-80_000),
    transfer_internal_move_net: 0,
    transfer_undecided_net: s(-20_000),
    transfer_undecided_activity_total: s(20_000),
    transfer_undecided_share: 0.0667,
    transfer_rows: [
      { row: 'transfer_investment_savings', label: '투자·저축 이체', signed_amount: s(-80_000) },
      { row: 'transfer_internal_move', label: '그 밖의 계좌 간 이동', signed_amount: 0 },
      { row: 'transfer_undecided', label: '목적 미정 이체', signed_amount: s(-20_000) },
    ],
  }
}

export function cubeFixture(rows: Array<Partial<SpendCubeResponse['rows'][number]> & { amount: number }>, groupBy: SpendCubeResponse['group_by']): SpendCubeResponse {
  return {
    contract: contractFixture(),
    group_by: groupBy,
    total_amount: rows.reduce((sum, row) => sum + row.amount, 0),
    rows: rows.map((row) => ({
      period: null,
      effective_category_major: null,
      effective_category_minor: null,
      merchant: null,
      payment_form: null,
      commitment_kind: null,
      adjustability: null,
      flow_row: null,
      charge_total: row.amount,
      refund_total: 0,
      transaction_count: 1,
      ...row,
    })),
  }
}

export function basisFixture(overrides: Partial<ComparisonBasis> = {}): ComparisonBasis {
  return {
    definition: 'comparison.v1',
    target_period: '2026-07',
    target_month_status: 'closed',
    target_coverage: 'observed',
    target_start_date: '2026-07-01',
    target_end_date: '2026-07-31',
    baseline_method: 'median_of_recent_closed_months',
    baseline_unavailable_reason: null,
    baseline_method_label: '최근 6개 마감월 중앙값',
    baseline_months_requested: 6,
    baseline_periods: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-06'],
    baseline_month_count: 5,
    baseline_status: 'fewer_than_requested',
    baseline_limited_by: 'data_start',
    baseline_start_date: null,
    baseline_start_period: null,
    first_data_period: '2026-01',
    first_data_period_starts_mid_month: false,
    skipped_periods: [{ period: '2026-05', reason: 'no_data' }],
    partial_month_handling: 'closed_month_full',
    elapsed_day: null,
    partial_month_note: '대상 월이 마감월이라 월 전체를 비교했습니다.',
    ratio_metrics_available: true,
    previous_full_month_delta_available: true,
    zero_vs_no_data_rule: '',
    median_rule: '',
    ...overrides,
  }
}

export function contributionsFixture(adjustability: 'all' | 'protected' | 'adjustable' = 'all'): ContributionResponse {
  return {
    contract: contractFixture(),
    comparison: basisFixture(),
    adjustability,
    level: 'category',
    category: null,
    ordering: 'abs_change_amount_desc',
    target_total: 550_000,
    baseline_total: 500_000,
    change_total: 50_000,
    items: [
      { category: '샘플 식비', merchant: null, cadence: 'monthly', window: 'monthly', target_amount: 200_000, target_period_amount: 200_000, baseline_amount: 140_000, change_amount: 60_000, baseline_observed_month_count: 5, baseline_zero_month_count: 0, active_months_in_window: 6, baseline_note: null },
      { category: '샘플 교통', merchant: null, cadence: 'monthly', window: 'monthly', target_amount: 40_000, target_period_amount: 40_000, baseline_amount: 50_000, change_amount: -10_000, baseline_observed_month_count: 5, baseline_zero_month_count: 0, active_months_in_window: 6, baseline_note: null },
    ],
    twelve_month_window: {
      rule: '',
      target_window_start_period: '2025-08',
      target_window_end_period: '2026-07',
      baseline_window_start_period: '2024-08',
      baseline_window_end_period: '2025-07',
      target_window_complete: false,
      baseline_window_available: false,
      baseline_window_unavailable_reason: 'data_start',
    },
    twelve_month_items: [],
  }
}

export function reviewItemsFixture(): ReadReviewItemsResponse {
  return {
    surface: 'review_items',
    surface_label: '사후 검토할 거래',
    status: 'classification_incomplete',
    status_label: '분류가 덜 되어 계산이 불완전함',
    status_reasons: [{ code: 'adjustability_undecided', label: '조정 가능성이 미정인 지출이 있음', periods: ['2026-07'], detail: null }],
    basis: { definition: 'review_items.v1', scope: '', rules: {}, assumptions: ['구매 단위 검출기는 예전 재량 분류(spend_necessity)를 읽는다.'] },
    data: {
      period: '2026-07',
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      total: 2,
      truncated: false,
      comparison: null,
      items: [
        {
          subject: 'transaction', subject_label: '거래', period: '2026-07', date: '2026-07-20', transaction_id: 901,
          category: '샘플 쇼핑', merchant: '샘플 상점', amount: 300_000, baseline_amount: null, change_amount: null,
          review_status: 'pending',
          listed_because: [{ source: 'purchase_review_candidate', source_label: '구매 단위 사후 검토 후보', code: 'large_oneoff', code_label: '큰 일회성 지출', detail: '큰 지출 기준을 넘었습니다.', signals: { large_oneoff_threshold: 100_000 } }],
        },
        {
          subject: 'category_month', subject_label: '카테고리·월', period: '2026-07', date: null, transaction_id: null,
          category: '샘플 식비', merchant: null, amount: 200_000, baseline_amount: 140_000, change_amount: 60_000,
          review_status: null,
          listed_because: [{ source: 'spending_anomaly', source_label: '카테고리 지출 변화', code: 'category_increase', code_label: '카테고리 지출 증가', detail: '지출 급증 (+43%)', signals: { anomaly_score: 3.2 } }],
        },
      ],
    },
  }
}

export function accuracyFixture(): ProjectionAccuracy {
  return {
    definition: '지난 마감월마다 같은 전망을 다시 돌려 실제 잔여(residual)와 비교',
    reference_period: '2026-08',
    evaluated_periods: ['2026-05', '2026-06', '2026-07'],
    as_of_days: [5, 10, 15, 20, 25],
    current_band: 'day_11_20',
    bands: [
      { band: 'day_01_10', as_of_days: [5, 10], points: 6, withheld_points: 0, evaluated_points: 6, net_median_signed_error: -120_000, net_median_absolute_error: 120_000, net_median_signed_error_pct_of_income: -12, expense_median_signed_error: -20_000 },
      { band: 'day_11_20', as_of_days: [15, 20], points: 6, withheld_points: 2, evaluated_points: 4, net_median_signed_error: 40_000, net_median_absolute_error: 50_000, net_median_signed_error_pct_of_income: 4, expense_median_signed_error: -5_000 },
      { band: 'day_21_31', as_of_days: [25], points: 3, withheld_points: 0, evaluated_points: 3, net_median_signed_error: 10_000, net_median_absolute_error: 10_000, net_median_signed_error_pct_of_income: 1, expense_median_signed_error: 0 },
    ],
    limitations: ['분류는 현재 값으로 재생함'],
  }
}
