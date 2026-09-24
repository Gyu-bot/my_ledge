import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePatchAssetLiquidity, usePatchLoanRepaymentMetadata } from '../../hooks/useAssets'

vi.mock('../../api/assets', () => ({ assetApi: { patchAssetLiquidity: vi.fn().mockResolvedValue({}), patchLoanRepaymentMetadata: vi.fn().mockResolvedValue({}) } }))

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const keys = [['assets', 'loans'], ['assets', 'liquidityHealth'], ['canonical-views', 'dashboard'], ['analytics', 'summary'], ['transactions', 'loanAccounts']]
  for (const key of [...keys, ['profile']]) client.setQueryData(key, { value: 'prior' })
  function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
  return { client, keys, Wrapper }
}

describe('asset metadata dependent queries', () => {
  it('대출 자동 복귀 후 요약·현금흐름·계좌 캐시를 함께 갱신 대상으로 표시한다', async () => {
    const { client, keys, Wrapper } = harness()
    const { result } = renderHook(usePatchLoanRepaymentMetadata, { wrapper: Wrapper })
    await act(async () => { await result.current.mutateAsync({ id: 1, data: { monthly_payment_mode: 'automatic' } }) })
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
    expect(client.getQueryState(['profile'])?.isInvalidated).toBe(false)
    client.clear()
  })

  it('현금성 변경 후 비상금과 canonical 값의 캐시를 갱신한다', async () => {
    const { client, keys, Wrapper } = harness()
    const { result } = renderHook(usePatchAssetLiquidity, { wrapper: Wrapper })
    await act(async () => { await result.current.mutateAsync({ id: 1, data: { is_cash_equivalent: null } }) })
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
    client.clear()
  })
})
