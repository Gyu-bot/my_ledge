import { afterEach, expect, it, vi } from 'vitest'
import { spendingLimitsApi } from '../../api/spendingLimits'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('T062 reads use period and writes append an authenticated JSON revision', async () => {
  const runtimeWindow = window as Window & { __MY_LEDGE_RUNTIME_CONFIG__?: { apiKey: string } }
  runtimeWindow.__MY_LEDGE_RUNTIME_CONFIG__ = { apiKey: 'synthetic-key' }
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))
  vi.stubGlobal('fetch', fetchMock)
  const payload = { target_kind: 'adjustability' as const, target_value: 'adjustable', effective_from_period: '2031-01', amount: 0 }
  await spendingLimitsApi.reference('2030-12')
  await spendingLimitsApi.history()
  await spendingLimitsApi.create(payload)
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/read/spending-reference?period=2030-12', '/api/v1/spending-limits', '/api/v1/spending-limits'])
  const init = fetchMock.mock.calls[2][1] as RequestInit
  expect(init.method).toBe('POST')
  expect(init.body).toBe(JSON.stringify(payload))
  expect(new Headers(init.headers).get('X-API-Key')).toBe('synthetic-key')
  delete runtimeWindow.__MY_LEDGE_RUNTIME_CONFIG__
})
