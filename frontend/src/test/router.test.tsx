import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from '../router'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('router — 새 IA + 레거시 redirect', () => {
  it.each([
    ['/spending', '지출'],
    ['/net-worth', '자산·부채'],
    ['/signals', '신호'],
    ['/data/inbox', '데이터 · 인박스'],
    ['/data/settings', '데이터 · 설정'],
    ['/data/reference', '데이터 · 데이터 사전'],
  ])('%s → 페이지 타이틀 "%s"', (path, title) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  })

  it.each([
    ['/analysis/spending', '/spending'],
    ['/analysis/assets', '/net-worth'],
    ['/analysis/insights', '/signals'],
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

  it('레거시 반복 결제 분류는 거래 그룹 보기로 redirect', () => {
    const router = renderAt('/operations/recurring-classification')
    expect(router.state.location.pathname).toBe('/data/transactions')
    expect(router.state.location.search).toBe('?view=groups')
  })

  it('/data → /data/inbox', () => {
    const router = renderAt('/data')
    expect(router.state.location.pathname).toBe('/data/inbox')
  })
})
