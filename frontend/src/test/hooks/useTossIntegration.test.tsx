import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { tossIntegrationApi } from '../../api/tossIntegration'
import { useSyncTossIntegration, tossIntegrationKey } from '../../hooks/useTossIntegration'

vi.mock('../../api/tossIntegration', () => ({ tossIntegrationApi: { sync: vi.fn() } }))

describe('Toss integration cache', () => {
  it.each([true, false])('요청 성공 여부(%s)와 관계없이 상태와 선택 자산 캐시를 갱신한다', async (success) => {
    if (success) vi.mocked(tossIntegrationApi.sync).mockResolvedValue({ run_id: 1, status: 'failed', error_code: 'access_denied', observed_at: null, holdings_count: 0, mapping_connected: false })
    else vi.mocked(tossIntegrationApi.sync).mockRejectedValue(new Error('409'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const keys = [tossIntegrationKey, ['assets', 'selected-investments', 'latest'], ['assets', 'source-policy']]
    keys.forEach((key) => client.setQueryData(key, { previous: true }))
    client.setQueryData(['profile'], { untouched: true })
    function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
    const { result } = renderHook(useSyncTossIntegration, { wrapper: Wrapper })
    await act(async () => { await result.current.mutateAsync({ confirm_single_account_mapping: false }).catch(() => undefined) })
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
    expect(client.getQueryState(['profile'])?.isInvalidated).toBe(false)
    client.clear()
  })
})
