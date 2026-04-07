import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, hasWriteAccess } from '../../lib/apiClient'

describe('apiClient runtime config contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (window as Window & {
      __MY_LEDGE_RUNTIME_CONFIG__?: { apiKey?: string; apiBaseUrl?: string }
    }).__MY_LEDGE_RUNTIME_CONFIG__
  })

  it('prefers __MY_LEDGE_RUNTIME_CONFIG__ apiKey and apiBaseUrl', async () => {
    ;(window as Window & {
      __MY_LEDGE_RUNTIME_CONFIG__?: { apiKey?: string; apiBaseUrl?: string }
    }).__MY_LEDGE_RUNTIME_CONFIG__ = {
      apiKey: 'runtime-key',
      apiBaseUrl: '/runtime-api',
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/health')

    expect(fetchMock).toHaveBeenCalledWith(
      '/runtime-api/health',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('X-API-Key')).toBe('runtime-key')
    expect(hasWriteAccess()).toBe(true)
  })
})
