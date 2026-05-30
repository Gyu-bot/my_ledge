import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanonicalViewsPage } from '../../pages/CanonicalViewsPage'
import type { SchemaDocumentResponse } from '../../types/schema'

const mockUseSchemaDocument = vi.fn()
const mockUseCanonicalViewsDashboard = vi.fn()
const setMetaBadge = vi.fn()

vi.mock('../../hooks/useSchema', () => ({
  useSchemaDocument: () => mockUseSchemaDocument(),
}))

vi.mock('../../hooks/useCanonicalViews', () => ({
  useCanonicalViewsDashboard: () => mockUseCanonicalViewsDashboard(),
}))

vi.mock('../../components/layout/chromeContext', () => ({
  useChromeContext: () => ({ setMetaBadge }),
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const schema: SchemaDocumentResponse = {
  tables: [],
  views: [
    {
      name: 'vw_transactions_effective',
      kind: 'view',
      description: 'Canonical transaction read model.',
      recommended_for_ai: true,
      columns: [
        { name: 'id', type: 'INTEGER', nullable: false },
        { name: 'effective_category_major', type: 'VARCHAR(50)', nullable: false },
      ],
    },
    {
      name: 'vw_monthly_cashflow',
      kind: 'view',
      description: 'Canonical monthly cashflow aggregate.',
      recommended_for_ai: true,
      columns: [
        { name: 'income_total', type: 'INTEGER', nullable: false },
        { name: 'loan_repayment_total', type: 'INTEGER', nullable: false },
        { name: 'non_loan_expense_total', type: 'INTEGER', nullable: false },
        { name: 'discretionary_spend_total', type: 'INTEGER', nullable: false },
      ],
    },
    {
      name: 'vw_recurring_merchant_monthly',
      kind: 'view',
      description: 'Canonical recurring merchant aggregate.',
      recommended_for_ai: true,
      columns: [
        { name: 'period', type: 'TEXT', nullable: false },
        { name: 'merchant', type: 'TEXT', nullable: false },
        { name: 'monthly_spend', type: 'INTEGER', nullable: false },
      ],
    },
    {
      name: 'vw_unclassified_work_queue',
      kind: 'view',
      description: 'Canonical data-quality queue.',
      recommended_for_ai: true,
      columns: [
        { name: 'transaction_id', type: 'INTEGER', nullable: false },
        { name: 'needs_loan_link_review', type: 'BOOLEAN', nullable: false },
        { name: 'priority_score', type: 'INTEGER', nullable: false },
      ],
    },
  ],
}

const canonicalDashboard = {
  monthly_cashflow: [
    {
      period: '2026-04',
      income_total: 5000000,
      expense_total: 3200000,
      non_loan_expense_total: 2800000,
      transfer_activity_total: 250000,
      loan_repayment_total: 400000,
      fixed_total: 1600000,
      variable_total: 1200000,
      essential_fixed_total: 1100000,
      discretionary_fixed_total: 500000,
      essential_variable_total: 700000,
      discretionary_variable_total: 500000,
      required_spend_total: 1800000,
      discretionary_spend_total: 1000000,
      unclassified_expense_total: 300000,
      net_cashflow: 1800000,
      savings_rate: 0.36,
    },
    {
      period: '2026-05',
      income_total: 1521,
      expense_total: 3500000,
      non_loan_expense_total: 3000000,
      transfer_activity_total: 100000,
      loan_repayment_total: 500000,
      fixed_total: 1700000,
      variable_total: 1300000,
      essential_fixed_total: 1200000,
      discretionary_fixed_total: 500000,
      essential_variable_total: 800000,
      discretionary_variable_total: 500000,
      required_spend_total: 2000000,
      discretionary_spend_total: 1000000,
      unclassified_expense_total: 200000,
      net_cashflow: -1700000,
      savings_rate: 0.3269,
    },
  ],
  true_spendable_monthly: [
    {
      period: '2026-05',
      income_total: 1521,
      observed_income_total: 1521,
      loan_repayment_total: 500000,
      fixed_commitment_total: 1700000,
      variable_total: 1300000,
      required_variable_total: 800000,
      discretionary_variable_total: 500000,
      spendable_before_variable_spend: -2198479,
      remaining_after_variable_spend: -3498479,
      income_basis: 'estimated',
      is_income_estimated: true,
      estimated_income_total: 6881301,
      income_estimate_month_count: 5,
      income_estimate_source: 'trailing_6_outlier_adjusted_avg',
      excluded_income_periods: ['2026-02'],
      estimated_spendable_before_variable_spend: 4681301,
      estimated_remaining_after_variable_spend: 3381301,
    },
  ],
  loan_repayment_monthly: [
    {
      period: '2026-05',
      loan_account_id: 1,
      loan_display_name: '국민 주담대',
      loan_lender: '국민은행',
      loan_product_name: '주택담보대출',
      loan_kind: 'mortgage',
      loan_maturity_date: '2036-05-21',
      loan_repayment_type: 'principal_interest',
      repayment_total: 500000,
      transaction_count: 1,
    },
  ],
  merchant_monthly_baseline: [
    {
      period: '2026-05',
      merchant: '쿠팡',
      effective_category_major: '생활',
      effective_category_minor: '쇼핑',
      monthly_spend: 350000,
      transaction_count: 5,
      baseline_month_count: 3,
      trailing_3_month_avg: 220000,
      baseline_delta: 130000,
      baseline_delta_pct: 0.5909,
    },
  ],
  recurring_merchant_monthly: [
    {
      period: '2026-05',
      merchant: '넷플릭스',
      effective_category_major: '구독',
      effective_category_minor: 'OTT',
      recurring_payment_kind: 'monthly_recurring',
      monthly_spend: 17000,
      transaction_count: 1,
    },
  ],
  unclassified_work_queue: [
    {
      transaction_id: 42,
      date: '2026-05-20',
      type: '지출',
      merchant: '대출상환',
      effective_category_major: '금융',
      effective_category_minor: '대출',
      amount: -500000,
      amount_abs: 500000,
      needs_cost_kind: true,
      needs_fixed_cost_necessity: false,
      needs_spend_necessity: true,
      needs_recurring_payment_kind: true,
      needs_loan_link_review: true,
      merchant_expense_count: 2,
      priority_score: 585000,
      priority_reason: 'loan_link_review',
    },
  ],
}

beforeEach(() => {
  setMetaBadge.mockClear()
  mockUseSchemaDocument.mockReturnValue({
    data: schema,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
  mockUseCanonicalViewsDashboard.mockReturnValue({
    data: canonicalDashboard,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
})

describe('CanonicalViewsPage', () => {
  it('shows canonical view rows as dashboard values', () => {
    wrap(<CanonicalViewsPage />)

    expect(screen.getAllByText('2026-05').length).toBeGreaterThan(0)
    expect(screen.getAllByText('예상').length).toBeGreaterThan(0)
    expect(screen.getAllByText('₩ 688만').length).toBeGreaterThan(0)
    expect(screen.getByText('예상 · 실제 ₩ 1,521')).toBeInTheDocument()
    expect(screen.getByText('예상 · 관측 -₩ 350만')).toBeInTheDocument()
    expect(screen.getByText('최근 6개월 이상치 제외 평균 수입 기준')).toBeInTheDocument()
    expect(screen.getByText('제외 월')).toBeInTheDocument()
    expect(screen.getByText('2026-02')).toBeInTheDocument()
    expect(screen.getByText('국민 주담대')).toBeInTheDocument()
    expect(screen.getByText('쿠팡')).toBeInTheDocument()
    expect(screen.getByText('넷플릭스')).toBeInTheDocument()
    expect(screen.getByText('대출상환')).toBeInTheDocument()
    expect(screen.getByText('loan_link_review')).toBeInTheDocument()
  })

  it('links data-quality queue work to existing operations pages', () => {
    wrap(<CanonicalViewsPage />)

    expect(screen.getByRole('link', { name: '자동분류' })).toHaveAttribute(
      'href',
      '/operations/auto-classification',
    )
    expect(screen.getByRole('link', { name: '대출 연결' })).toHaveAttribute(
      'href',
      '/operations/loan-mapping',
    )
    expect(screen.getByRole('link', { name: '반복 결제 분류' })).toHaveAttribute(
      'href',
      '/operations/recurring-classification',
    )
  })
})
