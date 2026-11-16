import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from '../router'

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('router — 새 IA + 레거시 redirect', () => {
  it.each([
    ['/', '월 결산'],
    ['/analysis', '지출 분석'],
    ['/net-worth', '재무상태'],
    ['/commitments', '약정 현황'],
    ['/data/inbox', '작업대 · 분류'],
    ['/data/nature', '작업대 · 기본값·정기 지급'],
    ['/data/transfers', '작업대 · 이체 목적'],
    ['/data/status', '작업대 · 자료 현황'],
    ['/data/settings', '작업대 · 설정'],
    ['/data/reference', '작업대 · 데이터 사전'],
  ])('%s → 페이지 타이틀 "%s"', (path, title) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it.each([
    ['/analysis/spending', '/analysis'],
    ['/analysis/assets', '/net-worth'],
    ['/analysis/insights', '/analysis'],
    ['/signals', '/analysis'],
    ['/income', '/'],
    ['/transfers', '/'],
    ['/operations/workbench', '/data/transactions'],
    ['/operations/loan-mapping', '/data/loans'],
    ['/operations/installments', '/data/installments'],
    ['/operations/asset-settings', '/data/assets'],
    ['/operations/auto-classification', '/data/rules'],
    ['/operations/canonical-views', '/data/reference'],
  ])('레거시 %s → %s redirect', (from, to) => {
    const router = renderAt(from)
    expect(router.state.location.pathname).toBe(to)
  })

  it('레거시 반복 결제 분류는 정기 지급 묶음으로 redirect (거래마다 반복 여부를 묻지 않는다)', () => {
    const router = renderAt('/operations/recurring-classification')
    expect(router.state.location.pathname).toBe('/data/nature')
    expect(router.state.location.search).toBe('?tab=recurring')
  })

  it('예전 거래 그룹 보기 주소도 정기 지급 묶음으로 간다', async () => {
    const router = renderAt('/data/transactions?view=groups')
    await waitFor(() => expect(router.state.location.pathname).toBe('/data/nature'))
    expect(router.state.location.search).toBe('?tab=recurring')
  })

  it.each([
    ['/spending', '/analysis', ''],
    ['/spending?lens=composition', '/analysis', ''],
    ['/spending?lens=merchants', '/analysis', ''],
    ['/spending?lens=calendar', '/analysis', ''],
    ['/spending?lens=trend', '/', ''],
    ['/spending?lens=fixed', '/', ''],
    ['/spending?lens=income', '/', ''],
    ['/spending?lens=composition&category=%EC%83%98%ED%94%8C', '/analysis', '?category=%EC%83%98%ED%94%8C'],
  ])('예전 지출 탭 %s → %s', (from, pathname, search) => {
    const router = renderAt(from)
    expect(router.state.location.pathname).toBe(pathname)
    expect(router.state.location.search).toBe(search)
  })

  it('/data → /data/inbox', () => {
    const router = renderAt('/data')
    expect(router.state.location.pathname).toBe('/data/inbox')
  })
})
