// 프론트엔드 단독 개발용 mock API — 백엔드 없이 홈 프로토타입을 띄운다.
// 사용: node scripts/mock-api.mjs  →  VITE_PROXY_TARGET=http://127.0.0.1:8765 npm run dev
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_API_PORT ?? 8765)

function months(count) {
  const now = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

const PERIODS = months(12)
const CURRENT = PERIODS[PERIODS.length - 1]

const cashflow = {
  items: PERIODS.map((period, index) => {
    const income = period === CURRENT ? 180_000 : 5_050_000 + (index % 3) * 120_000
    const expense = -(2_900_000 + ((index * 7) % 5) * 260_000 + (index === 9 ? 900_000 : 0))
    return {
      period,
      income,
      expense,
      transfer: 1_200_000,
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
  }
})

const canonicalDashboard = {
  monthly_cashflow: [],
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
    { snapshot_date: PERIODS[5] + '-01', asset_total: '662000000', liability_total: '268000000', net_worth: '394000000' },
    { snapshot_date: `${CURRENT}-07`, asset_total: '684000000', liability_total: '263000000', net_worth: '421000000' },
  ],
  asset_items: [],
}

const transactions = {
  total: 2219,
  page: 1,
  per_page: 5,
  items: [
    { id: 1, date: `${CURRENT}-09`, merchant: '쿠팡이츠', effective_category_major: '식비', amount: -23_000 },
    { id: 2, date: `${CURRENT}-08`, merchant: '월급', effective_category_major: '급여', amount: 180_000 },
    { id: 3, date: `${CURRENT}-08`, merchant: 'SK텔레콤', effective_category_major: '통신', amount: -106_600 },
    { id: 4, date: `${CURRENT}-07`, merchant: 'GS25', effective_category_major: '편의점', amount: -4_500 },
    { id: 5, date: `${CURRENT}-06`, merchant: '넷플릭스', effective_category_major: '구독', amount: -17_000 },
  ].map((tx) => ({
    ...tx,
    time: '12:00:00',
    type: tx.amount > 0 ? '수입' : '지출',
    category_major: tx.effective_category_major,
    category_minor: null,
    category_major_user: null,
    category_minor_user: null,
    effective_category_minor: null,
    description: tx.merchant,
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
  })),
}

const ROUTES = [
  ['/api/v1/canonical-views/dashboard', canonicalDashboard],
  ['/api/v1/analytics/monthly-cashflow', cashflow],
  ['/api/v1/analytics/spending-anomalies', { total: 2, page: 1, per_page: 1, items: [], comparison_mode: 'closed', reference_date: `${CURRENT}-01`, is_partial_period: false, assumptions: 'mock' }],
  ['/api/v1/analytics/recurring-payments', { total: 14, page: 1, per_page: 1, items: [], assumptions: 'mock' }],
  ['/api/v1/analytics/income-stability', { items: [], avg: 5_050_000, stdev: 280_000, coefficient_of_variation: 0.055, comparison_mode: 'closed', reference_date: `${CURRENT}-01`, is_partial_period: false, assumptions: 'mock' }],
  ['/api/v1/analytics/discretionary-velocity', { period: CURRENT, as_of_date: `${CURRENT}-10`, month_progress_ratio: 0.33, discretionary_spend: 820_000, baseline_spend_at_same_progress: 625_000, velocity_ratio: 1.31, risk_level: 'watch', confidence: 0.81, reasons: ['재량 지출이 같은 진행률의 기준선보다 31% 빠릅니다'], assumptions: [], unclassified_spend: 120_000, classification_coverage_ratio: 0.76 }],
  ['/api/v1/assets/snapshots', snapshots],
  ['/api/v1/auto-classification/recurring-category-rules/dry-run', { items: [{ merchant: '넷플릭스' }, { merchant: '유튜브 프리미엄' }, { merchant: '쿠팡 와우' }] }],
  ['/api/v1/loan-transaction-links', { total: 5, page: 1, per_page: 1, items: [] }],
  ['/api/v1/transactions', transactions],
]

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  const match = ROUTES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}?`))
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (!match) {
    res.statusCode = 404
    res.end(JSON.stringify({ detail: `mock 미구현: ${pathname}` }))
    return
  }
  res.end(JSON.stringify(match[1]))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`mock API → http://127.0.0.1:${PORT}`)
})
