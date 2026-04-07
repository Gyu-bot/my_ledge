import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from '../../../components/layout/AppLayout'

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

    expect(screen.getByText('지출 분석')).toBeInTheDocument()
    expect(screen.getByText('stub page')).toBeInTheDocument()
    expect(screen.getByLabelText('메뉴 열기')).toBeInTheDocument()
  })
})
