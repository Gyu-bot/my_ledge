import { afterEach, describe, expect, it, vi } from 'vitest'
import { tossIntegrationApi } from '../../api/tossIntegration'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('Toss integration API', () => {
  it('상태 GET과 확인 여부를 담은 인증 POST를 구분하며 토스 키는 보내지 않는다', async () => {
    vi.stubEnv('VITE_API_KEY', 'application-write-key')
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    await tossIntegrationApi.status()
    await tossIntegrationApi.sync({ confirm_single_account_mapping: false })
    await tossIntegrationApi.sync({ confirm_single_account_mapping: true })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/integrations/toss/status')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/integrations/toss/sync')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"confirm_single_account_mapping":false}' })
    expect(fetchMock.mock.calls[2][1].body).toBe('{"confirm_single_account_mapping":true}')
    expect(fetchMock.mock.calls[1][1].headers.get('X-API-Key')).toBe('application-write-key')
    expect(fetchMock.mock.calls[1][1].headers.get('Content-Type')).toBe('application/json')
  })
})
