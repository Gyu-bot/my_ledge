import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppTopbar } from '../../../components/layout/AppTopbar'

const renderTopbar = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppTopbar onMobileMenuOpen={() => {}} />
    </MemoryRouter>,
  )

describe('AppTopbar', () => {
  it('renders breadcrumb and title for a canonical route', () => {
    renderTopbar('/analysis/spending')

    expect(screen.getByText('분석')).toBeInTheDocument()
    expect(screen.getByText('지출 분석')).toBeInTheDocument()
  })

  it('uses roomier breadcrumb spacing and a brighter MyLedge brand label', () => {
    const { container } = renderTopbar('/')

    const header = container.querySelector('header')
    expect(header?.className).toContain('h-16')
    expect(header?.className).toContain('py-3')
    expect(screen.getByText('MyLedge').className).toContain('text-text-secondary')
  })
})
