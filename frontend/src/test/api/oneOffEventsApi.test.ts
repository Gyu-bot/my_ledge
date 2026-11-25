import { afterEach, describe, expect, it, vi } from 'vitest'
import { oneOffEventsApi } from '../../api/oneOffEvents'
import { transactionApi } from '../../api/transactions'

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as Window & { __MY_LEDGE_RUNTIME_CONFIG__?: unknown }).__MY_LEDGE_RUNTIME_CONFIG__
})

describe('일회성 지출 API 요청', () => {
  it('새 묶음 생성은 거래 목록을 받고, 소속 해제는 인증된 DELETE 본문을 보낸다', async () => {
    Object.assign(window, { __MY_LEDGE_RUNTIME_CONFIG__: { apiKey: 'synthetic-api-key' } })
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ id: 7 })))
    vi.stubGlobal('fetch', fetcher)
    await oneOffEventsApi.create({ name: '합성', transaction_ids: [2, 3] })
    await oneOffEventsApi.editMembers(7, 'DELETE', [3])
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/v1/one-off-events', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ name: '합성', transaction_ids: [2, 3] }),
    }))
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/v1/one-off-events/7/members', expect.objectContaining({
      method: 'DELETE', body: JSON.stringify({ transaction_ids: [3] }),
    }))
    const headers = new Headers(fetcher.mock.calls[1][1].headers)
    expect(headers.get('X-API-Key')).toBe('synthetic-api-key')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('경상 거래를 열 때 one_off=false를 명시한다', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [] }))
    vi.stubGlobal('fetch', fetcher)
    await transactionApi.list({ one_off: false, include_deleted: false })
    expect(fetcher).toHaveBeenCalledWith('/api/v1/transactions?one_off=false', expect.any(Object))
  })
})
