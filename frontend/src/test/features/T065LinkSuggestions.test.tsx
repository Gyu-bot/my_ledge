import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { transactionApi } from '../../api/transactions'
import { InstallmentCandidatesCard } from '../../features/data/InstallmentCandidatesCard'
import { LoanCandidateCard } from '../../features/workbench/LoanCandidateCard'
import type { InstallmentPlanCandidate, LoanAccountCandidate } from '../../types/transaction'

const access = vi.hoisted(() => ({ write: true }))
vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => access.write }))

const candidate: InstallmentPlanCandidate = {
  series_key: 'a'.repeat(64), observed_count: 3, first_observed_date: '2031-01-30',
  last_observed_date: '2031-03-30', first_payment_date: '2031-01-30', payment_method: '합성카드',
  merchant: '합성기기', monthly_amount: 51007, transaction_ids: [1, 2, 3],
  starts_at_data_window_edge: true, review_status: 'pending',
}
const account: LoanAccountCandidate = {
  loan_account_id: 9, lender: '합성기관', product_name: '합성상품', display_name_user: null,
  display_name: '합성계좌', loan_kind: 'unknown', loan_start_date: null, loan_maturity_date: null,
  as_of_date: null, latest_snapshot_date: null, latest_balance: null, latest_interest_rate: null,
  is_active: true, is_hidden: false, is_matured: false, is_stale: false, lifecycle_status: 'active',
  last_observed_balance: null, last_observed_principal: null, last_observed_snapshot_date: null,
  included_in_active_summary: false, excluded_from_summary_reason: null, stable_identity_status: 'stable', stable_identity_reason: null,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

afterEach(() => { vi.restoreAllMocks(); access.write = true })

describe('T065 사람이 확인하는 연결 제안', () => {
  it('prefills loan history, shows reasons, and sends a manual link only after click', async () => {
    const link = vi.spyOn(transactionApi, 'bulkLoanLink').mockResolvedValue({ updated: 1 })
    const onLinked = vi.fn()
    wrap(<LoanCandidateCard item={{ transaction_id: 1, date: '2031-05-20', merchant: '합성상환', amount: -51007, effective_category_major: '금융', suggested_loan_account_id: 9, suggestion_basis: 'history', suggestion_confidence: 'high', suggestion_reasons: ['same_payment_method', 'within_day_window', 'merchant_seen'] }} accounts={[account]} onLinked={onLinked} />)
    expect(screen.getByLabelText('대출 계좌')).toHaveValue('id:9')
    expect(screen.getByText(/이력 제안/)).toBeVisible()
    expect(screen.getByText(/출금 수단 일치/)).toBeVisible()
    expect(link).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '연결' }))
    await waitFor(() => expect(link).toHaveBeenCalledWith(expect.objectContaining({ transaction_ids: [1], loan_account_id: 9 })))
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith([{ merchant: '합성상환', accountId: 9, repayment: 'mixed' }]))
  })

  it('leaves ambiguous accounts empty and disables writes without a key', () => {
    access.write = false
    wrap(<LoanCandidateCard item={{ transaction_id: 1, date: '2031-05-20', merchant: '합성상환', amount: -51007, effective_category_major: '금융', suggestion_basis: 'history', suggestion_ambiguous: true, suggestion_confidence: 'low' }} accounts={[account]} />)
    expect(screen.getByText(/여러 계좌 일치/)).toBeVisible()
    expect(screen.getByLabelText('대출 계좌')).toHaveValue('')
    expect(screen.getByRole('button', { name: '연결' })).toBeDisabled()
  })

  it('requires total count and explicit confirmation before candidate creation', async () => {
    vi.spyOn(transactionApi, 'installmentPlanCandidates').mockResolvedValue({ items: [candidate] })
    const create = vi.spyOn(transactionApi, 'createPlanFromCandidate').mockResolvedValue({ id: 10, linked_installment_count: 3, total_installments: 6 } as Awaited<ReturnType<typeof transactionApi.createPlanFromCandidate>>)
    wrap(<InstallmentCandidatesCard />)
    await screen.findByText('합성기기')
    expect(screen.getByText(/이전 회차가 있을 수/)).toBeVisible()
    expect(screen.getByLabelText('총 할부 횟수')).toHaveValue(null)
    expect(create).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: '계획 생성 및 3건 연결' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('총 할부 횟수'), { target: { value: '6' } })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /관측 거래를 이 계획/ }))
    fireEvent.click(button)
    await waitFor(() => expect(create).toHaveBeenCalledWith(candidate.series_key, { display_name: candidate.merchant, total_installments: 6, first_payment_date: candidate.first_payment_date, transaction_ids: [1, 2, 3] }))
  })

  it('persists dismissal and restores a dismissed candidate explicitly', async () => {
    vi.spyOn(transactionApi, 'installmentPlanCandidates').mockImplementation(async (include) => ({ items: include ? [{ ...candidate, review_status: 'not_installment' }] : [candidate] }))
    const review = vi.spyOn(transactionApi, 'reviewInstallmentCandidate').mockResolvedValue({ series_key: candidate.series_key, review_status: 'not_installment' })
    wrap(<InstallmentCandidatesCard />)
    fireEvent.click(await screen.findByRole('button', { name: '할부 아님' }))
    await waitFor(() => expect(review).toHaveBeenCalledWith(candidate.series_key, 'not_installment'))
    fireEvent.click(screen.getByRole('checkbox', { name: '기각 후보 포함' }))
    fireEvent.click(await screen.findByRole('button', { name: '후보 복원' }))
    await waitFor(() => expect(review).toHaveBeenCalledWith(candidate.series_key, 'pending'))
  })
})
