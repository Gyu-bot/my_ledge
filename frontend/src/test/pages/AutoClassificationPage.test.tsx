import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AutoClassificationPage } from '../../pages/AutoClassificationPage'
import type {
  AutoClassificationSettings,
  CategoryClassificationRuleListResponse,
  LoanAccountsResponse,
  LoanMerchantRuleListResponse,
} from '../../types/transaction'

const mockUseWriteAccess = vi.fn<() => boolean>()
const mockUseAutoClassificationSettings = vi.fn()
const mockUseCategoryClassificationRules = vi.fn()
const mockUseLoanMerchantRules = vi.fn()
const mockUseLoanAccounts = vi.fn<() => { data: LoanAccountsResponse }>()
let patchSettingsMutate = vi.fn()
let upsertCategoryRuleMutate = vi.fn()
let applyCategoryRulesMutate = vi.fn()
let upsertLoanRuleMutate = vi.fn()
let applyLoanRulesMutate = vi.fn()

vi.mock('../../hooks/useWriteAccess', () => ({
  useWriteAccess: () => mockUseWriteAccess(),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useAutoClassificationSettings: () => mockUseAutoClassificationSettings(),
  useCategoryClassificationRules: () => mockUseCategoryClassificationRules(),
  useLoanMerchantRules: () => mockUseLoanMerchantRules(),
  useLoanAccounts: () => mockUseLoanAccounts(),
  usePatchAutoClassificationSettings: () => ({ mutateAsync: patchSettingsMutate, isPending: false }),
  useUpsertCategoryClassificationRule: () => ({ mutateAsync: upsertCategoryRuleMutate, isPending: false }),
  useApplyCategoryClassificationRules: () => ({ mutateAsync: applyCategoryRulesMutate, isPending: false }),
  useUpsertLoanMerchantRule: () => ({ mutateAsync: upsertLoanRuleMutate, isPending: false }),
  useApplyLoanMerchantRules: () => ({ mutateAsync: applyLoanRulesMutate, isPending: false }),
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
}

const categoryRules: CategoryClassificationRuleListResponse = {
  items: [
    {
      id: 1,
      category_major: '통신',
      category_minor: '휴대폰',
      cost_kind: 'fixed',
      fixed_cost_necessity: 'essential',
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

beforeEach(() => {
  mockUseWriteAccess.mockReturnValue(true)
  mockUseAutoClassificationSettings.mockReturnValue({ data: settings, isLoading: false })
  mockUseCategoryClassificationRules.mockReturnValue({ data: categoryRules, isLoading: false })
  mockUseLoanMerchantRules.mockReturnValue({ data: loanRules, isLoading: false })
  mockUseLoanAccounts.mockReturnValue({
    data: {
      items: [
        {
          loan_account_id: 1,
          lender: '국민은행',
          product_name: '주택담보대출',
          display_name: '국민은행 주택담보대출',
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
})

describe('AutoClassificationPage', () => {
  it('shows category and loan merchant rules in one operations menu', () => {
    wrap(<AutoClassificationPage />)

    expect(screen.getByText('통신 / 휴대폰')).toBeInTheDocument()
    expect(screen.getAllByText('국민은행 주택담보대출').length).toBeGreaterThan(0)
  })

  it('saves a category rule and applies existing transactions', async () => {
    wrap(<AutoClassificationPage />)

    fireEvent.change(screen.getByLabelText('대분류'), { target: { value: '주거' } })
    fireEvent.change(screen.getByLabelText('소분류'), { target: { value: '월세' } })
    fireEvent.change(screen.getByLabelText('비용 성격'), { target: { value: 'fixed' } })
    fireEvent.change(screen.getByLabelText('고정비 필수 여부'), { target: { value: 'essential' } })
    fireEvent.click(screen.getByRole('button', { name: '고정비 규칙 저장' }))
    fireEvent.click(screen.getByRole('button', { name: '고정비 규칙 일괄 적용' }))

    await waitFor(() => {
      expect(upsertCategoryRuleMutate).toHaveBeenCalledWith({
        category_major: '주거',
        category_minor: '월세',
        cost_kind: 'fixed',
        fixed_cost_necessity: 'essential',
      })
      expect(applyCategoryRulesMutate).toHaveBeenCalled()
    })
  })

  it('saves a loan merchant rule and toggles upload automation', async () => {
    wrap(<AutoClassificationPage />)

    fireEvent.click(screen.getByLabelText('업로드 후 고정비 규칙 자동 적용'))
    fireEvent.change(screen.getByLabelText('거래처명'), { target: { value: '국민은행' } })
    fireEvent.change(screen.getByLabelText('대출 계좌'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '대출 거래처 규칙 저장' }))
    fireEvent.click(screen.getByRole('button', { name: '대출 거래처 규칙 일괄 적용' }))

    await waitFor(() => {
      expect(patchSettingsMutate).toHaveBeenCalledWith({ apply_cost_rules_on_upload: true })
      expect(upsertLoanRuleMutate).toHaveBeenCalledWith({
        merchant: '국민은행',
        loan_account_id: 1,
        repayment_type: 'mixed',
        memo: null,
      })
      expect(applyLoanRulesMutate).toHaveBeenCalled()
    })
  })
})
