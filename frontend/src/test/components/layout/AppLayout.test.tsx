import { act, useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from '../../../components/layout/AppLayout'
import { useChromeContext } from '../../../components/layout/chromeContext'

function BadgePage() {
  const { setMetaBadge } = useChromeContext()
  useEffect(() => {
    setMetaBadge(<span>메타 12건</span>)
    return () => setMetaBadge(null)
  }, [setMetaBadge])
  return <div>badge page</div>
}

describe('AppLayout', () => {
  it('renders the chrome with the current route title', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppLayout />,
          children: [{ path: 'analysis/spending', element: <div>stub page</div> }],
        },
      ],
      { initialEntries: ['/analysis/spending'] },
    )

    render(<RouterProvider router={router} />)

    expect(screen.getAllByText('지출 분석').length).toBeGreaterThan(0)
    expect(screen.getByText('stub page')).toBeInTheDocument()
    expect(screen.getByLabelText('메뉴 열기')).toBeInTheDocument()
  })

  it('toggles the desktop sidebar open from icon-only mode', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppLayout />,
          children: [{ path: 'analysis/assets', element: <div>asset page</div> }],
        },
      ],
      { initialEntries: ['/analysis/assets'] },
    )

    render(<RouterProvider router={router} />)

    expect(screen.queryByText('거래 작업대')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '사이드바 펼치기' }))

    expect(screen.getByText('거래 작업대')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toBeInTheDocument()
  })

  it('mounts and clears topbar meta badges across canonical route lifecycle', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppLayout />,
          children: [
            { path: 'operations/workbench', element: <BadgePage /> },
            { path: 'analysis/assets', element: <div>asset page</div> },
          ],
        },
      ],
      { initialEntries: ['/operations/workbench'] },
    )

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('메타 12건')).toBeInTheDocument()

    await act(async () => {
      await router.navigate('/analysis/assets')
    })

    await waitFor(() => {
      expect(screen.queryByText('메타 12건')).not.toBeInTheDocument()
    })
    expect(screen.getAllByText('자산 현황').length).toBeGreaterThan(0)
  })
})
