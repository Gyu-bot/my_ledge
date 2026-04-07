import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppSidebar } from '../../../components/layout/AppSidebar'

const wrap = (ui: React.ReactNode, path = '/') =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

describe('AppSidebar', () => {
  it('renders all nav items', () => {
    wrap(<AppSidebar />)
    expect(screen.getByTitle('개요')).toBeInTheDocument()
    expect(screen.getByTitle('지출 분석')).toBeInTheDocument()
    expect(screen.getByTitle('자산 현황')).toBeInTheDocument()
    expect(screen.getByTitle('인사이트')).toBeInTheDocument()
    expect(screen.getByTitle('거래 작업대')).toBeInTheDocument()
  })

  it('marks overview as active on root path', () => {
    wrap(<AppSidebar />, '/')
    const link = screen.getByTitle('개요').closest('a')
    expect(link?.className).toContain('bg-accent-dim')
  })
})
