import { afterEach, describe, expect, it, vi } from 'vitest'
import { sourcePolicyApi } from '../../api/sourcePolicy'
import { sourcePreview } from '../features/sourcePolicyFixtures'

afterEach(() => vi.unstubAllGlobals())
describe('source policy API contract', () => {
  it('정책 GET, 시점 조회, 미리보기 POST와 확인 PATCH를 정확히 구분한다', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    await sourcePolicyApi.get()
    await sourcePolicyApi.selected('2026-09-24')
    await sourcePolicyApi.preview(sourcePreview.policy)
    const apply = { policy: sourcePreview.policy, preview_token: sourcePreview.preview_token, confirmed: true as const }
    await sourcePolicyApi.apply(apply)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/assets/source-policy')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/investments/selected?as_of_date=2026-09-24')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/assets/source-policy/preview')
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ policy: sourcePreview.policy }) })
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify(apply) })
    expect(fetchMock.mock.calls[3][1].headers.get('Content-Type')).toBe('application/json')
  })
})
