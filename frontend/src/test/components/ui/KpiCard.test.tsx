import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiCard } from '../../../components/ui/KpiCard'

describe('KpiCard', () => {
  it('renders label and value', () => {
    render(<KpiCard label="순자산" value="₩42,500,000" />)
    expect(screen.getByText('순자산')).toBeInTheDocument()
    expect(screen.getByText('₩42,500,000')).toBeInTheDocument()
  })

  it('renders sub text when provided', () => {
    render(<KpiCard label="저축률" value="61.6%" sub="목표 초과" />)
    expect(screen.getByText('목표 초과')).toBeInTheDocument()
  })

  it('does not render sub when not provided', () => {
    const { container } = render(<KpiCard label="label" value="value" />)
    expect(container.querySelector('[data-testid="kpi-sub"]')).toBeNull()
  })
})
