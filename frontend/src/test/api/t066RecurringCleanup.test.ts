import { afterEach, describe, expect, it, vi } from 'vitest'
import { natureApi } from '../../api/nature'

afterEach(() => vi.unstubAllGlobals())

describe('T066 정기 지급 쓰기 API', () => {
  it('합치기 대상과 소스를 한 요청으로 보내며 일치 방식을 보존한다', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    const data = { target_id: 1, source_ids: [2, 3], merchant_match: 'prefix' as const, merchant: 'Synthetic Plan' }
    await natureApi.mergeCommitments(data)
    expect(fetcher).toHaveBeenCalledWith('/api/v1/nature/recurring-commitments/merge', expect.objectContaining({ method: 'POST', body: JSON.stringify(data) }))
    expect(new Headers(fetcher.mock.calls[0][1].headers).get('Content-Type')).toBe('application/json')
  })

  it('일괄 삭제는 단일 POST와 204를 사용한다', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(natureApi.bulkDeleteCommitments([1, 2])).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/api/v1/nature/recurring-commitments/bulk-delete', expect.objectContaining({ method: 'POST', body: JSON.stringify({ ids: [1, 2] }) }))
  })
})
