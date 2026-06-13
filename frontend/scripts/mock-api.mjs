// 프론트엔드 단독 개발용 mock API — 백엔드 없이 홈/지출/자산·부채/신호를 띄운다.
// 사용: node scripts/mock-api.mjs  →  VITE_PROXY_TARGET=http://127.0.0.1:8943 npm run dev
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_API_PORT ?? 8943)

function months(count) {
  const now = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

const PERIODS = months(13)
const CURRENT = PERIODS[PERIODS.length - 1]
const CATEGORIES = ['식비', '주거/통신', '교통', '구독', '쇼핑', '금융', '의료', '문화']
const MERCHANTS = {
  식비: ['쿠팡이츠', 'GS25', '이마트', '배달의민족'],
  '주거/통신': ['SK텔레콤', '관리비', '한전'],
  교통: ['카카오T', '서울교통공사'],
  구독: ['넷플릭스', '유튜브 프리미엄', '쿠팡 와우'],
  쇼핑: ['쿠팡', '무신사'],
  금융: ['국민은행 대출이자', 'KB손해보험'],
  의료: ['연세약국'],
  문화: ['CGV', '스팀'],
}

function seeded(seed) {
  let value = seed
  return () => {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

// 결정적 거래 생성 (12개월 × ~40건)
const TRANSACTIONS = (() => {
  const rand = seeded(42)
  const rows = []
  let id = 1
  for (const period of PERIODS) {
    const isCurrent = period === CURRENT
    const dayCount = isCurrent ? 10 : 28
    // 월급
    if (!isCurrent || rand() > 0.7) {
      rows.push({ id: id++, date: `${period}-25`, merchant: '월급', category: '급여', amount: 5_050_000, type: '수입' })
    }
    if (!isCurrent && rand() > 0.5) {
      rows.push({ id: id++, date: `${period}-10`, merchant: '이자수익', category: '금융수입', amount: 45_000, type: '수입' })
    }
    for (let i = 0; i < 38; i += 1) {
      const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)]
      const merchantList = MERCHANTS[category]
      const merchant = merchantList[Math.floor(rand() * merchantList.length)]
      const day = String(1 + Math.floor(rand() * dayCount)).padStart(2, '0')
      const amount = -Math.round((4_000 + rand() * 120_000) / 100) * 100
      rows.push({ id: id++, date: `${period}-${day}`, merchant, category, amount, type: '지출' })
    }
  }
  return rows.map((row) => ({
    ...row,
    time: '12:00:00',
    category_major: row.category,
    category_minor: row.category === '식비' ? '배달' : null,
    category_major_user: null,
    category_minor_user: null,
    effective_category_major: row.category,
    effective_category_minor: row.category === '식비' ? '배달' : null,
    description: `${row.merchant}-원본`,
    currency: 'KRW',
    payment_method: '카드 A',
    cost_kind: null,
    fixed_cost_necessity: null,
    spend_necessity: null,
    cost_classification_source: null,
    recurring_payment_kind: null,
    memo: null,
    is_deleted: false,
    merged_into_id: null,
    is_edited: false,
    source: 'import',
    created_at: '',
    updated_at: '',
  }))
})()

function inRange(row, params) {
  const start = params.get('start_date')
  const end = params.get('end_date')
  if (start && row.date < start) return false
  if (end && row.date > end) return false
  return true
}

function byType(row, type) {
  if (!type || type === 'all') return true
  return row.type === type
}

const cashflow = {
  items: PERIODS.slice(-12).map((period) => {
    const rows = TRANSACTIONS.filter((row) => row.date.startsWith(period))
    const income = rows.filter((row) => row.type === '수입').reduce((sum, row) => sum + row.amount, 0)
    const expense = rows.filter((row) => row.type === '지출').reduce((sum, row) => sum + row.amount, 0)
    return {
      period, income, expense, transfer: 1_200_000,
      net_cashflow: income + expense,
      savings_rate: income > 0 ? (income + expense) / income : null,
    }
  }),
}

const trueSpendable = PERIODS.slice(-7).map((period) => {
  const isCurrent = period === CURRENT
  return {
    period,
    income_total: isCurrent ? 180_000 : 5_050_000,
    observed_income_total: isCurrent ? 180_000 : 5_050_000,
    loan_repayment_total: 1_420_000,
    fixed_commitment_total: 860_000,
    variable_total: isCurrent ? 640_000 : 1_750_000,
    required_variable_total: 420_000,
    discretionary_variable_total: isCurrent ? 220_000 : 1_330_000,
    spendable_before_variable_spend: isCurrent ? -2_100_000 : 2_770_000,
    remaining_after_variable_spend: isCurrent ? -2_740_000 : 1_020_000,
    income_basis: isCurrent ? 'estimated' : 'observed',
    is_income_estimated: isCurrent,
    estimated_income_total: isCurrent ? 5_010_000 : null,
    income_estimate_month_count: 6,
    income_estimate_source: isCurrent ? 'trailing_6_outlier_adjusted_avg' : null,
    excluded_income_periods: isCurrent ? [PERIODS[2]] : [],
    estimated_spendable_before_variable_spend: isCurrent ? 2_730_000 : null,
    estimated_remaining_after_variable_spend: isCurrent ? 1_243_000 : null,
    is_complete_month: !isCurrent,
  }
})

const canonicalDashboard = {
  data_coverage: { first_transaction_date: `${PERIODS[0]}-01`, last_transaction_date: `${CURRENT}-10` },
  monthly_cashflow: cashflow.items.map((item) => ({
    ...item,
    income_total: item.income,
    expense_total: -item.expense,
    is_complete_month: item.period !== CURRENT,
  })),
  true_spendable_monthly: trueSpendable,
  loan_repayment_monthly: [],
  merchant_monthly_baseline: [],
  recurring_merchant_monthly: [],
  unclassified_work_queue: Array.from({ length: 7 }, (_, index) => ({
    transaction_id: index + 1,
    date: `${CURRENT}-0${(index % 9) + 1}`,
    type: '지출',
    merchant: `미분류 거래처 ${index + 1}`,
    effective_category_major: '미분류',
    effective_category_minor: null,
    amount: -45_000,
    amount_abs: 45_000,
    needs_cost_kind: true,
    needs_fixed_cost_necessity: false,
    needs_spend_necessity: true,
    needs_recurring_payment_kind: index % 2 === 0,
    needs_loan_link_review: false,
    merchant_expense_count: 3,
    priority_score: 10 - index,
    priority_reason: '월 단위 반복 신호가 있는 미분류 지출',
  })),
}

const snapshots = {
  items: [
    { snapshot_date: `${PERIODS[7]}-01`, asset_total: '662000000', liability_total: '268000000', net_worth: '394000000' },
    { snapshot_date: `${CURRENT}-07`, asset_total: '684000000', liability_total: '263000000', net_worth: '421000000' },
  ],
  asset_items: [
    { id: 1, snapshot_date: `${CURRENT}-07`, side: 'asset', category: '자유입출금', product_name: '토스뱅크 통장', amount: '8100000', liquidity_tier: 'immediate', is_cash_equivalent: true },
    { id: 2, snapshot_date: `${CURRENT}-07`, side: 'asset', category: '투자성', product_name: 'ISA', amount: '10100000', liquidity_tier: 'near_liquid', is_cash_equivalent: true },
    { id: 3, snapshot_date: `${CURRENT}-07`, side: 'asset', category: '부동산', product_name: '아파트', amount: '650000000', liquidity_tier: 'illiquid', is_cash_equivalent: false },
    { id: 4, snapshot_date: `${CURRENT}-07`, side: 'asset', category: '전자금융', product_name: '카카오페이 머니', amount: '320000', liquidity_tier: null, is_cash_equivalent: null },
  ],
}

function categoryAggregate(params, level) {
  const type = params.get('type') ?? '지출'
  const totals = new Map()
  for (const row of TRANSACTIONS) {
    if (!inRange(row, params) || !byType(row, type)) continue
    const key = level === 'minor' ? (row.effective_category_minor ?? '미분류') : row.effective_category_major
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(row.amount))
  }
  return {
    items: [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount })),
  }
}

const ROUTES = [
  ['/api/v1/canonical-views/dashboard', () => canonicalDashboard],
  ['/api/v1/analytics/monthly-cashflow', () => cashflow],
  ['/api/v1/analytics/spending-anomalies', () => ({
    total: 2, page: 1, per_page: 8,
    items: [
      { period: PERIODS[11], category: '식비', amount: 740_000, baseline_avg: 410_000, delta_pct: 80.5, anomaly_score: 3.2, reason: '최근 3개월 기준선 대비 급증' },
      { period: PERIODS[11], category: '쇼핑', amount: 520_000, baseline_avg: 390_000, delta_pct: 33.3, anomaly_score: 1.8, reason: '기준선 상회' },
    ],
    comparison_mode: 'closed', reference_date: `${PERIODS[11]}-30`, is_partial_period: false,
    assumptions: '직전 마감월 전체 지출 기준',
  })],
  ['/api/v1/analytics/recurring-payments', () => ({
    total: 14, page: 1, per_page: 8,
    items: [
      { merchant: '넷플릭스', category: '구독', avg_amount: 17_000, interval_type: 'monthly', avg_interval_days: 30, occurrences: 12, confidence: 0.93, last_date: `${CURRENT}-01`, recurring_payment_kind: 'monthly_recurring', installment_count: 0, monthly_recurring_count: 12, not_recurring_count: 0, unclassified_count: 0, transaction_ids: [1] },
      { merchant: 'SK텔레콤', category: '주거/통신', avg_amount: 106_600, interval_type: 'monthly', avg_interval_days: 30, occurrences: 12, confidence: 0.97, last_date: `${CURRENT}-05`, recurring_payment_kind: 'monthly_recurring', installment_count: 0, monthly_recurring_count: 12, not_recurring_count: 0, unclassified_count: 0, transaction_ids: [2] },
      { merchant: '쿠팡 와우', category: '구독', avg_amount: 7_890, interval_type: 'monthly', avg_interval_days: 30, occurrences: 9, confidence: 0.88, last_date: `${CURRENT}-03`, recurring_payment_kind: null, installment_count: 0, monthly_recurring_count: 0, not_recurring_count: 0, unclassified_count: 9, transaction_ids: [3] },
    ],
    assumptions: '같은 거래처 30±5일 간격 3회 이상',
  })],
  ['/api/v1/analytics/income-stability', () => ({
    items: [], avg: 5_050_000, stdev: 280_000, coefficient_of_variation: 0.055,
    comparison_mode: 'closed', reference_date: `${PERIODS[11]}-30`, is_partial_period: false, assumptions: 'mock',
  })],
  ['/api/v1/analytics/discretionary-velocity', () => ({
    period: CURRENT, as_of_date: `${CURRENT}-10`, month_progress_ratio: 0.33,
    discretionary_spend: 820_000, baseline_monthly_spend: 1_890_000,
    baseline_spend_at_same_progress: 625_000,
    velocity_ratio: 1.31, risk_level: 'warning', confidence: 'medium',
    reasons: ['재량 지출이 같은 진행률의 기준선보다 31% 빠릅니다'], assumptions: [],
    unclassified_spend: 120_000, classification_coverage_ratio: 0.76,
  })],
  ['/api/v1/analytics/purchase-gate-candidates', () => ({
    total: 2, page: 1, per_page: 10,
    items: [
      {
        candidate_type: 'large_oneoff', candidate_types: ['large_oneoff', 'new_merchant'],
        transaction_id: 42, candidate_key: 'transaction:42', date: `${CURRENT}-08`,
        merchant: '애플스토어', amount: -1_890_000, category: '쇼핑',
        signals: { zscore: 3.2, baseline: 410000 }, risk_level: 'warning', review_priority: 'high',
        confidence: '0.8', suggested_review_window: '7d', review_status: 'pending',
        review_memo: null, reviewed_at: null, cooldown_until: null,
        reasons: ['최근 6개월 내 최대 단건 지출'], assumptions: [],
      },
      {
        candidate_type: 'merchant_spike', candidate_types: ['merchant_spike'],
        transaction_id: 51, candidate_key: 'transaction:51', date: `${CURRENT}-06`,
        merchant: '쿠팡', amount: -420_000, category: '쇼핑',
        signals: { ratio: 2.4 }, risk_level: 'high', review_priority: 'high',
        confidence: '0.7', suggested_review_window: '7d', review_status: 'pending',
        review_memo: null, reviewed_at: null, cooldown_until: null,
        reasons: ['거래처 월 누적이 기준선의 2.4배'], assumptions: [],
      },
    ],
    assumptions: [],
  })],
  ['/api/v1/analytics/category-mom', (params) => {
    const aggregate = categoryAggregate(params, 'major')
    return {
      items: aggregate.items.slice(0, 6).map(({ category, amount }, index) => {
        const previous = Math.round(amount * (0.7 + index * 0.1))
        return {
          period: CURRENT, previous_period: PERIODS[11], category,
          current_amount: amount, previous_amount: previous,
          delta_amount: amount - previous,
          delta_pct: previous > 0 ? ((amount - previous) / previous) * 100 : null,
        }
      }),
    }
  }],
  ['/api/v1/analytics/fixed-cost-summary', () => ({
    expense_total: 3_400_000, fixed_total: 1_200_000, variable_total: 1_800_000, fixed_ratio: 0.4,
    essential_fixed_total: 900_000, discretionary_fixed_total: 300_000,
    essential_variable_total: 600_000, discretionary_variable_total: 1_200_000,
    required_spend_total: 1_500_000, discretionary_spend_total: 1_500_000,
    unclassified_total: 400_000, unclassified_count: 12,
  })],
  ['/api/v1/analytics/fixed-cost-trend', () => ({
    items: PERIODS.slice(-6).map((period, index) => ({
      period, expense_total: 3_200_000 + index * 80_000,
      fixed_total: 1_150_000 + index * 20_000, variable_total: 1_650_000 + index * 40_000,
      essential_fixed_total: 880_000, discretionary_fixed_total: 290_000,
      essential_variable_total: 580_000, discretionary_variable_total: 1_080_000,
      required_spend_total: 1_460_000 + index * 10_000, discretionary_spend_total: 1_370_000 + index * 50_000,
      unclassified_total: 380_000, unclassified_count: 11, fixed_ratio: 0.41,
    })),
  })],
  ['/api/v1/analytics/merchant-spend', (params) => {
    const totals = new Map()
    for (const row of TRANSACTIONS) {
      if (row.type !== '지출' || !inRange(row, params)) continue
      const entry = totals.get(row.merchant) ?? { amount: 0, count: 0, last: row.date }
      entry.amount += Math.abs(row.amount)
      entry.count += 1
      if (row.date > entry.last) entry.last = row.date
      totals.set(row.merchant, entry)
    }
    const limit = Number(params.get('limit') ?? 8)
    return {
      items: [...totals.entries()]
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, limit)
        .map(([merchant, { amount, count, last }]) => ({
          merchant, amount, count, avg_amount: Math.round(amount / count), last_seen_at: last,
        })),
    }
  }],
  ['/api/v1/analytics/net-worth-breakdown', () => ({
    snapshot_date: `${CURRENT}-07`, asset_total: '684000000', negative_asset_excluded_total: '1200000',
    liability_total: '263000000', net_worth: '421000000',
    items: [
      { side: 'asset', category: '부동산', amount: '650000000', ratio: 0.95 },
      { side: 'asset', category: '투자성', amount: '25700000', ratio: 0.04 },
      { side: 'asset', category: '자유입출금', amount: '8300000', ratio: 0.01 },
      { side: 'liability', category: '주택담보대출', amount: '240000000', ratio: 0.91 },
      { side: 'liability', category: '신용대출', amount: '23000000', ratio: 0.09 },
    ],
  })],
  ['/api/v1/analytics/liquidity-health', () => ({
    snapshot_date: `${CURRENT}-07`, cash_equivalent_total: '18200000', asset_total: '684000000',
    negative_asset_excluded_total: '1200000', liability_total: '263000000', net_worth: '421000000',
    monthly_required_spend: '5300000', monthly_required_spend_source: 'derived_closed_month_transactions',
    emergency_fund_months: 3.4,
    emergency_fund_target_months: 4, target_progress_ratio: 0.85,
    monthly_debt_payment: '1420000', monthly_income: '5050000',
    monthly_income_source: 'derived_closed_month_transactions',
    derived_from_periods: PERIODS.slice(-6, -1),
    manual_input_overrides: [],
    debt_payment_ratio: 0.28, debt_to_asset_ratio: 0.38,
    confidence: 'medium', assumptions: ['negative_asset_rows_excluded', '현금성 분류 휴리스틱 적용'],
  })],
  ['/api/v1/assets/snapshots', () => snapshots],
  ['/api/v1/assets/net-worth-history', () => ({
    items: PERIODS.slice(-8).map((period, index) => ({
      snapshot_date: `${period}-01`,
      net_worth: String(380_000_000 + index * 6_000_000),
    })),
  })],
  ['/api/v1/assets/snapshot-compare', (params) => ({
    comparison_mode: params.get('comparison_mode') ?? 'latest_available_vs_previous_available',
    current: snapshots.items[1], baseline: snapshots.items[0],
    delta: { asset_total: '22000000', liability_total: '-5000000', net_worth: '27000000', asset_total_pct: 0.033, liability_total_pct: -0.018, net_worth_pct: 0.0685 },
    comparison_days: 37, is_partial: false, is_stale: false, can_compare: true,
    comparison_label: '이전 스냅샷 대비',
  })],
  ['/api/v1/loans/summary', () => ({
    snapshot_date: `${CURRENT}-07`, as_of_date: `${CURRENT}-07`,
    summary_scope: 'active_loans_only', excluded_historical_count: 0,
    totals: { principal: '300000000', balance: '263000000' },
    items: [
      { id: 1, loan_type: '은행 대출', lender: '국민은행', product_name: '주택담보대출', principal: '300000000', balance: '240000000', interest_rate: '3.85', monthly_payment: '1420000', repayment_method: 'principal_interest', monthly_payment_source: 'estimated_from_linked_transactions', repayment_method_source: 'derived_from_loan_account', loan_kind: 'equal_principal_interest', start_date: '2023-01-01', maturity_date: '2053-01-01' },
      { id: 2, loan_type: '신용 대출', lender: '카카오뱅크', product_name: '마이너스 통장', principal: '30000000', balance: '23000000', interest_rate: '5.2', monthly_payment: '98000', repayment_method: 'interest_only', monthly_payment_source: 'estimated_from_linked_transactions', repayment_method_source: 'derived_from_loan_account', loan_kind: 'overdraft', start_date: '2025-03-01', maturity_date: '2027-03-01' },
    ],
  })],
  ['/api/v1/investments/summary', () => ({
    snapshot_date: `${CURRENT}-07`,
    totals: { cost_basis: '120000000', market_value: '160000000' },
    items: [
      { product_type: '주식', broker: '증권사A', product_name: '미국주식 ETF', cost_basis: '60000000', market_value: '67200000', return_rate: '12.4', pct_of_investment_total: 0.42 },
      { product_type: '주식', broker: '증권사A', product_name: '국내주식', cost_basis: '40000000', market_value: '36800000', return_rate: '-3.1', pct_of_investment_total: 0.23 },
      { product_type: '펀드', broker: '증권사B', product_name: '인덱스 펀드', cost_basis: '20000000', market_value: '28800000', return_rate: '5.0', pct_of_investment_total: 0.18 },
    ],
  })],
  ['/api/v1/insurance/summary', () => ({
    snapshot_date: `${CURRENT}-07`,
    has_contract_snapshot: true,
    missing_reason: null,
    expected_source: 'BankSalad 4.보험현황',
    items: [
      { id: 1, snapshot_date: `${CURRENT}-07`, insurer: '한화생명', product_name: '종신보험', contract_status: '유지', total_paid: '8400000', contract_date: '2020-05-01', maturity_date: null },
      { id: 2, snapshot_date: `${CURRENT}-07`, insurer: '삼성화재', product_name: '실손의료보험', contract_status: '유지', total_paid: '3120000', contract_date: '2021-02-01', maturity_date: '2049-05-01' },
    ],
    monthly_premium_estimate: {
      period: PERIODS[11],
      amount: '214000',
      assumptions: ['최근 마감월 보험 카테고리 지출 기반', '환불/취소 상계 반영'],
      basis: { source: 'closed_month_insurance_category_spend' },
    },
  })],
  ['/api/v1/profile', () => ({
    snapshot_date: `${CURRENT}-07`, gender: '남', age: 34, credit_score_kcb: 942,
    has_snapshot: true, missing_reason: null, expected_source: 'BankSalad 1.고객정보', source_section_found: true,
    credit_score_history: [
      { snapshot_date: `${PERIODS[7]}-01`, credit_score_kcb: 921 },
      { snapshot_date: `${PERIODS[9]}-01`, credit_score_kcb: 931 },
      { snapshot_date: `${CURRENT}-07`, credit_score_kcb: 942 },
    ],
  })],
  ['/api/v1/settings/analytics', () => ({
    defaults: {
      financial_targets: { emergency_fund_target_months: 4, savings_rate_target: 0.5, debt_strategy_preference: 'avalanche' },
      spending_anomalies: { min_delta_amount: 100000, anomaly_threshold: 0.5, baseline_months: 3 },
      discretionary_velocity: { baseline_months: 6, outlier_policy: 'exclude_outliers', warning_velocity_ratio: 1.2, high_velocity_ratio: 1.5, minimum_classification_coverage: 0.7, baseline_mode: 'closed_months', excluded_category_names: [], excluded_merchants: [] },
      purchase_gate: { large_purchase_threshold: 100000, min_candidate_amount: 50000, new_merchant_lookback_months: 6, merchant_spike_ratio: 2, discretionary_spike_ratio: 1.5, review_cooldown_days: 14, candidate_risk_threshold: 'watch', enabled_candidate_types: ['large_oneoff', 'new_merchant', 'merchant_spike', 'discretionary_spike'], excluded_category_names: [], excluded_merchants: [] },
      recurring_dry_run: { min_occurrences: 2, min_distinct_months: 2, min_distinct_days: 2, max_amount_cv: 0.5, monthly_interval_days_min: 25, monthly_interval_days_max: 35, weekly_interval_days_min: 6, weekly_interval_days_max: 8, minimum_confidence: 0.7, default_apply_scope: 'all_matching', upload_auto_apply: false },
      asset_liability_health: { emergency_fund_included_tiers: ['immediate'], show_near_liquid_as_secondary: true, monthly_payment_estimate_lookback_months: 6, monthly_payment_min_observations: 2, debt_payment_confidence_requires_user_confirmation: true },
      bulk_operations: { require_preview: true, require_confirmation: true, show_undo_after_delete: true, max_bulk_rows_without_extra_confirmation: 100 },
    },
    saved: {},
    effective: {
      financial_targets: { emergency_fund_target_months: 4, savings_rate_target: 0.5, debt_strategy_preference: 'avalanche' },
      spending_anomalies: { min_delta_amount: 100000, anomaly_threshold: 0.5, baseline_months: 3 },
      discretionary_velocity: { baseline_months: 6, outlier_policy: 'exclude_outliers', warning_velocity_ratio: 1.2, high_velocity_ratio: 1.5, minimum_classification_coverage: 0.7, baseline_mode: 'closed_months', excluded_category_names: [], excluded_merchants: [] },
      purchase_gate: { large_purchase_threshold: 100000, min_candidate_amount: 50000, new_merchant_lookback_months: 6, merchant_spike_ratio: 2, discretionary_spike_ratio: 1.5, review_cooldown_days: 14, candidate_risk_threshold: 'watch', enabled_candidate_types: ['large_oneoff', 'new_merchant', 'merchant_spike', 'discretionary_spike'], excluded_category_names: [], excluded_merchants: [] },
      recurring_dry_run: { min_occurrences: 2, min_distinct_months: 2, min_distinct_days: 2, max_amount_cv: 0.5, monthly_interval_days_min: 25, monthly_interval_days_max: 35, weekly_interval_days_min: 6, weekly_interval_days_max: 8, minimum_confidence: 0.7, default_apply_scope: 'all_matching', upload_auto_apply: false },
      asset_liability_health: { emergency_fund_included_tiers: ['immediate'], show_near_liquid_as_secondary: true, monthly_payment_estimate_lookback_months: 6, monthly_payment_min_observations: 2, debt_payment_confidence_requires_user_confirmation: true },
      bulk_operations: { require_preview: true, require_confirmation: true, show_undo_after_delete: true, max_bulk_rows_without_extra_confirmation: 100 },
    },
  })],
  ['/api/v1/installments/forecast', () => ({
    monthly_summary: PERIODS.slice(-1).concat(months(7).slice(-6)).slice(0, 6).map((period, index) => ({
      period, observed_total: index === 0 ? 330_000 : 0,
      projected_total: index < 3 ? 330_000 : 0,
      missed_total: index === 1 ? 110_000 : 0,
    })),
    items: [],
  })],
  ['/api/v1/auto-classification/recurring-category-rules/dry-run', () => ({
    items: [
      { merchant: '넷플릭스', proposed_kind: 'monthly_recurring', confidence: 0.92, reason: '매월 같은 금액 12회 관측', category_hint: '구독', apply_scope_options: ['all_matching', 'future_only'], matched_transactions: [{ id: 1, date: `${PERIODS[10]}-15`, amount: -17000 }, { id: 2, date: `${PERIODS[11]}-15`, amount: -17000 }] },
      { merchant: '애플스토어', proposed_kind: 'installment', confidence: 0.85, reason: '3회 분할 결제 패턴', category_hint: '쇼핑', apply_scope_options: ['future_only'], matched_transactions: [{ id: 3, date: `${PERIODS[9]}-08`, amount: -330000 }] },
      { merchant: '쿠팡 와우', proposed_kind: 'monthly_recurring', confidence: 0.88, reason: '월 구독료 9회', category_hint: '구독', apply_scope_options: ['all_matching', 'future_only'], matched_transactions: [{ id: 4, date: `${PERIODS[11]}-03`, amount: -7890 }] },
    ],
  })],
  ['/api/v1/loan-transaction-links', () => ({ total: 5, page: 1, per_page: 1, items: [] })],
  ['/api/v1/transactions/by-category/timeline', (params) => {
    const type = params.get('type') ?? '지출'
    const items = []
    for (const row of TRANSACTIONS) {
      if (!inRange(row, params) || !byType(row, type)) continue
      items.push({ period: row.date.slice(0, 7), category: row.effective_category_major, amount: Math.abs(row.amount) })
    }
    const totals = new Map()
    for (const item of items) {
      const key = `${item.period}|${item.category}`
      totals.set(key, (totals.get(key) ?? 0) + item.amount)
    }
    return {
      items: [...totals.entries()].map(([key, amount]) => {
        const [period, category] = key.split('|')
        return { period, category, amount }
      }),
    }
  }],
  ['/api/v1/transactions/by-category', (params) => categoryAggregate(params, params.get('level') ?? 'major')],
  ['/api/v1/transactions/filter-options', () => ({
    category_options: CATEGORIES,
    category_minor_options: ['배달', '외식', '카페', '구독'],
    category_minor_options_by_major: { 식비: ['배달', '외식', '카페'], 구독: ['OTT', '음악'] },
    payment_method_options: ['카드 A', '카드 B', '현금'],
  })],
  ['/api/v1/loan-accounts', () => ({
    items: [
      { loan_account_id: 1, lender: '국민은행', product_name: '주택담보대출', display_name_user: '우리집 주담대', display_name: '우리집 주담대', loan_kind: 'equal_principal_interest', loan_start_date: '2023-01-01', loan_maturity_date: '2053-01-01', latest_snapshot_date: `${CURRENT}-07`, latest_balance: '240000000', latest_interest_rate: '3.85' },
      { loan_account_id: 2, lender: '카카오뱅크', product_name: '마이너스 통장', display_name_user: null, display_name: '카카오뱅크 마이너스 통장', loan_kind: 'overdraft', loan_start_date: '2025-03-01', loan_maturity_date: '2027-03-01', latest_snapshot_date: `${CURRENT}-07`, latest_balance: '23000000', latest_interest_rate: '5.2' },
    ],
  })],
  ['/api/v1/loan-transaction-links', (params) => {
    const linked = params.get('linked') ?? 'all'
    const candidates = TRANSACTIONS.filter((row) => row.type === '지출' && (row.merchant.includes('대출') || row.category === '금융')).slice(0, 18)
    const items = candidates
      .map((row, index) => ({
        transaction_id: row.id, date: row.date, time: row.time, type: row.type,
        effective_category_major: row.effective_category_major, effective_category_minor: row.effective_category_minor,
        description: row.description, merchant: row.merchant, amount: row.amount, currency: 'KRW',
        payment_method: row.payment_method, memo: null,
        link: index % 3 === 0 ? { transaction_id: row.id, loan_account_id: 1, lender: '국민은행', product_name: '주택담보대출', display_name_user: '우리집 주담대', display_name: '우리집 주담대', loan_kind: 'equal_principal_interest', repayment_type: 'mixed', source: 'manual', memo: null, created_at: '', updated_at: '' } : null,
      }))
      .filter((item) => linked === 'all' || (linked === 'linked' ? item.link : !item.link))
    const page = Number(params.get('page') ?? 1)
    const perPage = Number(params.get('per_page') ?? 40)
    return { total: items.length, page, per_page: perPage, items: items.slice((page - 1) * perPage, page * perPage) }
  }],
  ['/api/v1/installment-plans', () => ({
    items: [
      { id: 1, display_name: '맥북 6개월 할부', merchant: '애플스토어', payment_method: '카드 A', total_installments: 6, monthly_amount: 330000, first_payment_date: `${PERIODS[9]}-08`, memo: null, status: 'active', linked_installment_count: 2, created_at: '', updated_at: '' },
    ],
  })],
  ['/api/v1/installment-transaction-links', (params) => {
    const candidates = TRANSACTIONS.filter((row) => row.type === '지출' && row.merchant.includes('애플')).slice(0, 10)
    const items = candidates.map((row, index) => ({
      transaction_id: row.id, date: row.date, time: row.time, type: row.type,
      effective_category_major: row.effective_category_major, effective_category_minor: row.effective_category_minor,
      description: row.description, merchant: row.merchant, amount: row.amount, currency: 'KRW',
      payment_method: row.payment_method, memo: null, recurring_payment_kind: 'installment',
      link: index === 0 ? { transaction_id: row.id, installment_plan_id: 1, installment_plan_display_name: '맥북 6개월 할부', total_installments: 6, installment_number: 1, monthly_amount: 330000, due_date: `${PERIODS[9]}-08`, source: 'manual', memo: null, created_at: '', updated_at: '' } : null,
    }))
    const page = Number(params.get('page') ?? 1)
    const perPage = Number(params.get('per_page') ?? 40)
    return { total: items.length, page, per_page: perPage, items: items.slice((page - 1) * perPage, page * perPage) }
  }],
  ['/api/v1/auto-classification/settings', () => ({ apply_cost_rules_on_upload: true, apply_loan_rules_on_upload: true, apply_recurring_rules_on_upload: false })],
  ['/api/v1/auto-classification/category-rules', () => ({ items: [{ id: 1, category_major: '구독', category_minor: null, cost_kind: 'fixed', fixed_cost_necessity: 'discretionary', spend_necessity: 'discretionary', created_at: '', updated_at: '' }] })],
  ['/api/v1/auto-classification/merchant-alias-rules', () => ({ items: [{ id: 1, alias_pattern: '쿠팡이츠', normalized_merchant: '쿠팡이츠', created_at: '', updated_at: '' }] })],
  ['/api/v1/auto-classification/loan-merchant-rules', () => ({ items: [{ id: 1, merchant: '국민은행 대출이자', match_field: 'merchant', loan_account_id: 1, repayment_type: 'interest', lender: '국민은행', product_name: '주택담보대출', display_name: '우리집 주담대', memo: null, created_at: '', updated_at: '' }] })],
  ['/api/v1/auto-classification/recurring-category-rules', () => ({ items: [{ id: 1, category_major: '구독', category_minor: null, recurring_payment_kind: 'monthly_recurring', created_at: '', updated_at: '' }] })],
  ['/api/v1/schema', () => ({
    tables: [],
    views: [
      'vw_monthly_cashflow', 'vw_loan_repayment_monthly', 'vw_true_spendable_monthly', 'vw_merchant_monthly_baseline',
      'vw_recurring_merchant_monthly', 'vw_unclassified_work_queue', 'vw_loan_account_canonical', 'vw_income_monthly_by_category',
    ].map((name) => ({ name, kind: 'view', description: null, recommended_for_ai: true, columns: [{ name: 'period', type: 'text', nullable: false }, { name: 'amount', type: 'numeric', nullable: true }] })),
  })],
  ['/api/v1/transactions', (params) => {
    const type = params.get('type')
    const category = params.get('category_major')
    const search = params.get('search')
    const filtered = TRANSACTIONS
      .filter((row) => inRange(row, params) && byType(row, type))
      .filter((row) => !category || row.effective_category_major === category)
      .filter((row) => !search || row.merchant.includes(search) || row.description.includes(search))
      .sort((a, b) => b.date.localeCompare(a.date))
    const page = Number(params.get('page') ?? 1)
    const perPage = Number(params.get('per_page') ?? 20)
    return {
      total: filtered.length, page, per_page: perPage,
      items: filtered.slice((page - 1) * perPage, page * perPage),
    }
  }],
]

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const match = ROUTES.find(([prefix]) => url.pathname === prefix)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (!match) {
    res.statusCode = 404
    res.end(JSON.stringify({ detail: `mock 미구현: ${url.pathname}` }))
    return
  }
  res.end(JSON.stringify(match[1](url.searchParams)))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`mock API → http://127.0.0.1:${PORT}`)
})
