import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AutoClassificationPage } from '../../pages/AutoClassificationPage'
import type {
  AutoClassificationSettings,
  CategoryClassificationRuleListResponse,
  LoanAccountsResponse,
  LoanMerchantRuleListResponse,
  MerchantAliasRuleListResponse,
  RecurringCategoryRuleListResponse,
  TransactionFilterOptionsResponse,
} from '../../types/transaction'

const mockUseWriteAccess = vi.fn<() => boolean>()
const mockUseAutoClassificationSettings = vi.fn()
const mockUseCategoryClassificationRules = vi.fn()
const mockUseLoanMerchantRules = vi.fn()
const mockUseMerchantAliasRules = vi.fn()
const mockUseRecurringCategoryRules = vi.fn()
const mockUseLoanAccounts = vi.fn<() => { data: LoanAccountsResponse }>()
const mockUseTransactionFilterOptions = vi.fn<() => { data: TransactionFilterOptionsResponse }>()
let patchSettingsMutate = vi.fn()
let upsertCategoryRuleMutate = vi.fn()
let applyCategoryRulesMutate = vi.fn()
let upsertLoanRuleMutate = vi.fn()
let applyLoanRulesMutate = vi.fn()
let upsertMerchantAliasRuleMutate = vi.fn()
let applyMerchantAliasRulesMutate = vi.fn()
let upsertRecurringRuleMutate = vi.fn()
let applyRecurringRulesMutate = vi.fn()

vi.mock('../../hooks/useWriteAccess', () => ({
  useWriteAccess: () => mockUseWriteAccess(),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionFilterOptions: () => mockUseTransactionFilterOptions(),
  useAutoClassificationSettings: () => mockUseAutoClassificationSettings(),
  useCategoryClassificationRules: () => mockUseCategoryClassificationRules(),
  useLoanMerchantRules: () => mockUseLoanMerchantRules(),
  useMerchantAliasRules: () => mockUseMerchantAliasRules(),
  useRecurringCategoryRules: () => mockUseRecurringCategoryRules(),
  useLoanAccounts: () => mockUseLoanAccounts(),
  usePatchAutoClassificationSettings: () => ({ mutateAsync: patchSettingsMutate, isPending: false }),
  useUpsertCategoryClassificationRule: () => ({ mutateAsync: upsertCategoryRuleMutate, isPending: false }),
  useApplyCategoryClassificationRules: () => ({ mutateAsync: applyCategoryRulesMutate, isPending: false }),
  useUpsertLoanMerchantRule: () => ({ mutateAsync: upsertLoanRuleMutate, isPending: false }),
  useApplyLoanMerchantRules: () => ({ mutateAsync: applyLoanRulesMutate, isPending: false }),
  useUpsertMerchantAliasRule: () => ({ mutateAsync: upsertMerchantAliasRuleMutate, isPending: false }),
  useApplyMerchantAliasRules: () => ({ mutateAsync: applyMerchantAliasRulesMutate, isPending: false }),
  useUpsertRecurringCategoryRule: () => ({ mutateAsync: upsertRecurringRuleMutate, isPending: false }),
  useApplyRecurringCategoryRules: () => ({ mutateAsync: applyRecurringRulesMutate, isPending: false }),
}))

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

const settings: AutoClassificationSettings = {
  apply_cost_rules_on_upload: false,
  apply_loan_rules_on_upload: false,
  apply_recurring_rules_on_upload: false,
}

const categoryRules: CategoryClassificationRuleListResponse = {
  items: [
    {
      id: 1,
      category_major: '통신',
      category_minor: '휴대폰',
      cost_kind: 'fixed',
      fixed_cost_necessity: 'essential',
      spend_necessity: 'essential',
      created_at: '2026-05-25T09:00:00',
      updated_at: '2026-05-25T09:00:00',
    },
  ],
}

const loanRules: LoanMerchantRuleListResponse = {
  items: [
    {
      id: 1,
      merchant: '국민은행',
      match_field: 'merchant',
      loan_account_id: 1,
      lender: '국민은행',
      product_name: '주택담보대출',
      display_name: '국민은행 주택담보대출',
      repayment_type: 'mixed',
      memo: '자동 원리금',
      created_at: '2026-05-25T09:00:00',
      updated_at: '2026-05-25T09:00:00',
    },
  ],
}

const merchantAliasRules: MerchantAliasRuleListResponse = {
  items: [
    {
      id: 1,
      alias_pattern: 'COUPANG',
      normalized_merchant: '쿠팡',
      created_at: '2026-05-25T09:00:00',
      updated_at: '2026-05-25T09:00:00',
    },
  ],
}

const recurringRules: RecurringCategoryRuleListResponse = {
  items: [
    {
      id: 1,
      category_major: '구독',
      category_minor: null,
      recurring_payment_kind: 'monthly_recurring',
      created_at: '2026-05-25T09:00:00',
      updated_at: '2026-05-25T09:00:00',
    },
  ],
}

beforeEach(() => {
  mockUseWriteAccess.mockReturnValue(true)
  mockUseTransactionFilterOptions.mockReturnValue({
    data: {
      category_options: ['주거', '통신', '식비', '구독', '보험'],
      category_minor_options: ['월세', '관리비', '휴대폰', '외식', 'OTT', '미분류'],
      category_minor_options_by_major: {
        주거: ['월세', '관리비'],
        통신: ['휴대폰'],
        식비: ['외식'],
        구독: ['OTT'],
        보험: ['미분류'],
      },
      payment_method_options: [],
    },
  })
  mockUseAutoClassificationSettings.mockReturnValue({ data: settings, isLoading: false })
  mockUseCategoryClassificationRules.mockReturnValue({ data: categoryRules, isLoading: false })
  mockUseLoanMerchantRules.mockReturnValue({ data: loanRules, isLoading: false })
  mockUseMerchantAliasRules.mockReturnValue({ data: merchantAliasRules, isLoading: false })
  mockUseRecurringCategoryRules.mockReturnValue({ data: recurringRules, isLoading: false })
  mockUseLoanAccounts.mockReturnValue({
    data: {
      items: [
        {
          loan_account_id: 1,
          lender: '국민은행',
          product_name: '주택담보대출',
          display_name_user: null,
          display_name: '국민은행 주택담보대출',
          loan_kind: 'unknown',
          loan_start_date: '2021-06-01',
          loan_maturity_date: '2051-05-31',
          latest_snapshot_date: '2026-05-24',
          latest_balance: '200000000.00',
          latest_interest_rate: '3.4',
        },
      ],
    },
  })
  patchSettingsMutate = vi.fn().mockResolvedValue(settings)
  upsertCategoryRuleMutate = vi.fn().mockResolvedValue(categoryRules.items[0])
  applyCategoryRulesMutate = vi.fn().mockResolvedValue({ updated: 3 })
  upsertLoanRuleMutate = vi.fn().mockResolvedValue(loanRules.items[0])
  applyLoanRulesMutate = vi.fn().mockResolvedValue({ updated: 2 })
  upsertMerchantAliasRuleMutate = vi.fn().mockResolvedValue(merchantAliasRules.items[0])
  applyMerchantAliasRulesMutate = vi.fn().mockResolvedValue({ updated: 5 })
  upsertRecurringRuleMutate = vi.fn().mockResolvedValue(recurringRules.items[0])
  applyRecurringRulesMutate = vi.fn().mockResolvedValue({ updated: 4 })
})

describe('AutoClassificationPage', () => {
  it('shows category and loan merchant rules in one operations menu', () => {
    wrap(<AutoClassificationPage />)

    expect(screen.getByText('통신 / 휴대폰')).toBeInTheDocument()
    expect(screen.getAllByText('국민은행 주택담보대출').length).toBeGreaterThan(0)
    expect(screen.getAllByText('쿠팡').length).toBeGreaterThan(0)
    expect(screen.getAllByText('구독').length).toBeGreaterThan(0)
    expect(screen.getAllByText('매월 반복').length).toBeGreaterThan(0)
  })

  it('saves a category rule and applies existing transactions', async () => {
    wrap(<AutoClassificationPage />)

    fireEvent.change(screen.getByRole('combobox', { name: /^대분류$/ }), { target: { value: '주거' } })
    fireEvent.change(screen.getByRole('combobox', { name: /^소분류$/ }), { target: { value: '월세' } })
    fireEvent.change(screen.getByRole('combobox', { name: /^비용 성격$/ }), { target: { value: 'fixed' } })
    fireEvent.change(screen.getByRole('combobox', { name: /^필수\/재량$/ }), { target: { value: 'essential' } })
    fireEvent.click(screen.getByRole('button', { name: '분류 규칙 저장' }))
    fireEvent.click(screen.getByRole('button', { name: '고정비 규칙 일괄 적용' }))

    await waitFor(() => {
      expect(upsertCategoryRuleMutate).toHaveBeenCalledWith({
        category_major: '주거',
        category_minor: '월세',
        cost_kind: 'fixed',
        fixed_cost_necessity: 'essential',
        spend_necessity: 'essential',
      })
      expect(applyCategoryRulesMutate).toHaveBeenCalled()
    })
  })

  it('saves the pending category rule before bulk-applying rules', async () => {
    wrap(<AutoClassificationPage />)

    fireEvent.change(screen.getByRole('combobox', { name: /^대분류$/ }), { target: { value: '보험' } })
    fireEvent.change(screen.getByRole('combobox', { name: /^비용 성격$/ }), { target: { value: 'fixed' } })
    fireEvent.change(screen.getByRole('combobox', { name: /^필수\/재량$/ }), { target: { value: 'discretionary' } })
    fireEvent.click(screen.getByRole('button', { name: '고정비 규칙 일괄 적용' }))

    await waitFor(() => {
      expect(upsertCategoryRuleMutate).toHaveBeenCalledWith({
        category_major: '보험',
        category_minor: null,
        cost_kind: 'fixed',
        fixed_cost_necessity: 'discretionary',
        spend_necessity: 'discretionary',
      })
      expect(applyCategoryRulesMutate).toHaveBeenCalled()
    })
    expect(upsertCategoryRuleMutate.mock.invocationCallOrder[0]).toBeLessThan(
      applyCategoryRulesMutate.mock.invocationCallOrder[0],
    )
  })

  it('saves a merchant alias rule and applies existing transactions', async () => {
    wrap(<AutoClassificationPage />)

    expect(screen.getByText('원본 설명에 포함된 패턴을 분석용 거래처로 정리합니다. 이미 수정된 분석용 거래처는 보존합니다.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('거래처 포함 패턴'), { target: { value: 'STARBUCKS' } })
    fireEvent.change(screen.getByLabelText('정규 거래처'), { target: { value: '스타벅스' } })
    fireEvent.click(screen.getByRole('button', { name: '정규화 규칙 저장' }))
    fireEvent.click(screen.getByRole('button', { name: '거래처 정규화 일괄 적용' }))

    await waitFor(() => {
      expect(upsertMerchantAliasRuleMutate).toHaveBeenCalledWith({
        alias_pattern: 'STARBUCKS',
        normalized_merchant: '스타벅스',
      })
      expect(applyMerchantAliasRulesMutate).toHaveBeenCalled()
    })
  })

  it('uses category dropdowns and filters subcategories by selected major category', () => {
    wrap(<AutoClassificationPage />)

    const majorSelect = screen.getByRole('combobox', { name: /^대분류$/ })
    const minorSelect = screen.getByRole('combobox', { name: /^소분류$/ })

    expect(majorSelect.tagName).toBe('SELECT')
    expect(minorSelect.tagName).toBe('SELECT')
    expect(within(majorSelect).getByRole('option', { name: '주거' })).toBeInTheDocument()

    fireEvent.change(majorSelect, { target: { value: '주거' } })

    expect(within(minorSelect).getByRole('option', { name: '월세' })).toBeInTheDocument()
    expect(within(minorSelect).getByRole('option', { name: '관리비' })).toBeInTheDocument()
    expect(within(minorSelect).queryByRole('option', { name: '휴대폰' })).not.toBeInTheDocument()
  })

  it('saves a loan merchant rule and toggles upload automation', async () => {
    wrap(<AutoClassificationPage />)

    fireEvent.click(screen.getByLabelText('업로드 후 고정비 규칙 자동 적용'))
    fireEvent.change(screen.getByLabelText('대출 규칙 매칭 기준'), { target: { value: 'description' } })
    fireEvent.change(screen.getByLabelText('대출 규칙 매칭 값'), { target: { value: '국민은행 원리금 자동이체' } })
    fireEvent.change(screen.getByLabelText('대출 계좌'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '대출 매칭 규칙 저장' }))
    fireEvent.click(screen.getByRole('button', { name: '대출 매칭 규칙 일괄 적용' }))

    await waitFor(() => {
      expect(patchSettingsMutate).toHaveBeenCalledWith({ apply_cost_rules_on_upload: true })
      expect(upsertLoanRuleMutate).toHaveBeenCalledWith({
        merchant: '국민은행 원리금 자동이체',
        match_field: 'description',
        loan_account_id: 1,
        repayment_type: 'mixed',
        memo: null,
      })
      expect(applyLoanRulesMutate).toHaveBeenCalled()
    })
  })

  it('saves a recurring category rule and applies existing transactions', async () => {
    wrap(<AutoClassificationPage />)

    fireEvent.change(screen.getByLabelText('반복결제 대분류'), { target: { value: '구독' } })
    fireEvent.change(screen.getByLabelText('반복결제 소분류'), { target: { value: 'OTT' } })
    fireEvent.change(screen.getByLabelText('반복결제 성격'), { target: { value: 'monthly_recurring' } })
    fireEvent.click(screen.getByRole('button', { name: '반복결제 규칙 저장' }))
    fireEvent.click(screen.getByRole('button', { name: '반복결제 규칙 일괄 적용' }))

    await waitFor(() => {
      expect(upsertRecurringRuleMutate).toHaveBeenCalledWith({
        category_major: '구독',
        category_minor: 'OTT',
        recurring_payment_kind: 'monthly_recurring',
      })
      expect(applyRecurringRulesMutate).toHaveBeenCalled()
    })
  })

  it('toggles recurring rule automation on upload', async () => {
    wrap(<AutoClassificationPage />)

    fireEvent.click(screen.getByLabelText('업로드 후 반복결제 규칙 자동 적용'))

    await waitFor(() => {
      expect(patchSettingsMutate).toHaveBeenCalledWith({ apply_recurring_rules_on_upload: true })
    })
  })
})
