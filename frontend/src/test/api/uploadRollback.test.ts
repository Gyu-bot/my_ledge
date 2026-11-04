import { afterEach, expect, it, vi } from 'vitest'
import { uploadApi } from '../../api/upload'

it('uses the rollback endpoint and sends an explicit confirmation flag', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))
  vi.stubGlobal('fetch', fetchMock)
  await uploadApi.rollbackPoints()
  await uploadApi.rollback(42, false)
  await uploadApi.rollback(42, true)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/upload/rollback-points')
  expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/upload/42/rollback')
  expect(fetchMock.mock.calls[1][1].method).toBe('POST')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ accept_changes: false })
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ accept_changes: true })
})

afterEach(() => vi.unstubAllGlobals())
