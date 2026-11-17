import { afterEach, describe, expect, it, vi } from 'vitest'
import { transactionApi } from '../../api/transactions'

afterEach(() => vi.unstubAllGlobals())

describe('T065 후보 확인 API 계약', () => {
  it('reads discovery and includes persisted dismissals only on request', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await transactionApi.installmentPlanCandidates(true)
    expect(fetcher).toHaveBeenCalledWith('/api/v1/installment-plan-candidates?include_dismissed=true', expect.any(Object))
  })

  it.each([
    ['loan', '/transactions/loan-links/accept-suggestions', { items: [{ transaction_id: 1, loan_account_id: 2 }] }],
    ['installment', '/transactions/installment-links/accept-suggestions', { items: [{ transaction_id: 1, installment_plan_id: 2, installment_number: 3 }] }],
  ] as const)('posts explicit %s confirmation targets', async (kind, path, data) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ updated: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    if (kind === 'loan') await transactionApi.acceptLoanSuggestions({ items: [...data.items] })
    else await transactionApi.acceptInstallmentSuggestions({ items: [...data.items] })
    expect(fetcher).toHaveBeenCalledWith(`/api/v1${path}`, expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }))
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('Content-Type')).toBe('application/json')
  })

  it('sends dismissal, restore and required human plan fields', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await transactionApi.reviewInstallmentCandidate('a'.repeat(64), 'not_installment')
    await transactionApi.reviewInstallmentCandidate('a'.repeat(64), 'pending')
    const data = { display_name: '합성계획', total_installments: 6, first_payment_date: '2031-01-30', transaction_ids: [1, 2, 3] }
    await transactionApi.createPlanFromCandidate('a'.repeat(64), data)
    expect(fetcher).toHaveBeenNthCalledWith(1, expect.stringContaining('/review'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ review_status: 'not_installment' }) }))
    expect(fetcher).toHaveBeenNthCalledWith(2, expect.stringContaining('/review'), expect.objectContaining({ body: JSON.stringify({ review_status: 'pending' }) }))
    expect(fetcher).toHaveBeenNthCalledWith(3, expect.stringContaining('/create-plan'), expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }))
  })
})
