import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useApplySourcePolicy } from '../../hooks/useSourcePolicy'
import { sourcePolicy, sourcePreview } from '../features/sourcePolicyFixtures'

vi.mock('../../api/sourcePolicy', () => ({ sourcePolicyApi: { apply: vi.fn().mockResolvedValue({ revision: 2, global_source: 'banksalad_snapshot', investment_source: 'toss_securities_api', stale_after_days: 7, account_overrides: [] }) } }))

describe('source policy cache', () => {
  it('소스 적용 후 선택 소스·자산·분석·canonical 캐시를 갱신하고 정책 응답을 저장한다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const keys = [['assets', 'selected-investments', 'latest'], ['assets', 'snapshots'], ['analytics', 'summary'], ['canonical-views', 'dashboard']]
    keys.forEach((key) => client.setQueryData(key, { previous: true }))
    client.setQueryData(['assets', 'source-policy'], sourcePolicy)
    client.setQueryData(['profile'], { untouched: true })
    function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }
    const { result } = renderHook(useApplySourcePolicy, { wrapper: Wrapper })
    await act(async () => { await result.current.mutateAsync({ policy: sourcePreview.policy, preview_token: sourcePreview.preview_token, confirmed: true }) })
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
    expect(client.getQueryData(['assets', 'source-policy'])).toMatchObject({ revision: 2, investment_source: 'toss_securities_api' })
    expect(client.getQueryState(['profile'])?.isInvalidated).toBe(false)
    client.clear()
  })
})
