import { afterEach, describe, expect, it, vi } from 'vitest'
import { netWorthApi } from '../../api/netWorth'
import { natureApi } from '../../api/nature'

function stubFetch(status = 200) {
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(status === 204 ? new Response(null, { status }) : new Response(JSON.stringify({}), { status })),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('재무상태와 이체 목적 API (T061)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('대조·구간·비상금 경로: 구간은 두 날짜를 모두 주거나 모두 생략한다', async () => {
    const fetchMock = stubFetch()
    await netWorthApi.intervals()
    await netWorthApi.reconciliation(null)
    await netWorthApi.reconciliation({ start_date: '2026-05-31', end_date: '2026-06-30' })
    await netWorthApi.emergencyFund()
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/v1/metrics/net-worth/intervals?limit=60',
      '/api/v1/metrics/net-worth/reconciliation',
      '/api/v1/metrics/net-worth/reconciliation?start_date=2026-05-31&end_date=2026-06-30',
      '/api/v1/metrics/net-worth/emergency-fund',
    ])
  })

  it('이체 목적 규칙: 만들기·고치기·지우기의 메서드와 본문', async () => {
    const fetchMock = stubFetch()
    await natureApi.transferRules()
    await natureApi.createTransferRule({ match_scope: 'merchant', merchant: '가상증권', purpose: 'investment' })
    await natureApi.updateTransferRule(7, { purpose: 'savings' })
    const calls = fetchMock.mock.calls.map(([url, init]) => [String(url), (init as RequestInit).method ?? 'GET', (init as RequestInit).body ?? null])
    expect(calls).toEqual([
      ['/api/v1/transfer-purposes/rules', 'GET', null],
      ['/api/v1/transfer-purposes/rules', 'POST', JSON.stringify({ match_scope: 'merchant', merchant: '가상증권', purpose: 'investment' })],
      ['/api/v1/transfer-purposes/rules/7', 'PATCH', JSON.stringify({ purpose: 'savings' })],
    ])
    const deleteMock = stubFetch(204)
    await expect(natureApi.deleteTransferRule(7)).resolves.toBeUndefined()
    expect(deleteMock.mock.calls[0][0]).toBe('/api/v1/transfer-purposes/rules/7')
    expect((deleteMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })
})
