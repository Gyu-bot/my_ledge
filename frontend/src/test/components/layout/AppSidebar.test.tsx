import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppSidebar } from '../../../components/layout/AppSidebar'

const wrap = (ui: React.ReactNode, path = '/') =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

describe('AppSidebar', () => {
  it('renders all nav items', () => {
    wrap(<AppSidebar collapsed={false} onToggle={() => {}} />)
    expect(screen.getByRole('link', { name: '개요' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '지출 분석' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '자산 현황' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '인사이트' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '거래 작업대' })).toBeInTheDocument()
  })

  it('marks overview as active on root path', () => {
    wrap(<AppSidebar collapsed={false} onToggle={() => {}} />, '/')
    const link = screen.getByRole('link', { name: '개요' })
    expect(link?.className).toContain('bg-accent-dim')
  })

  it('starts in icon-only mode when collapsed', () => {
    wrap(<AppSidebar collapsed onToggle={() => {}} />)

    expect(screen.queryByText('지출 분석')).not.toBeInTheDocument()
    expect(screen.queryByText('분석')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '지출 분석' })).toHaveAttribute('title', '지출 분석')
  })
})
