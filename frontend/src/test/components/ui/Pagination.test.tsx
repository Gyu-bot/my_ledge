import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Pagination } from '../../../components/ui/Pagination'

describe('Pagination', () => {
  it('shows current page info', () => {
    render(<Pagination page={1} perPage={20} total={347} onPageChange={vi.fn()} />)
    expect(screen.getByText(/1–20 \/ 347건/)).toBeInTheDocument()
  })

  it('calls onPageChange when next button clicked', () => {
    const onChange = vi.fn()
    render(<Pagination page={1} perPage={20} total={347} onPageChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '›' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('disables prev on first page', () => {
    render(<Pagination page={1} perPage={20} total={40} onPageChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '‹' })).toBeDisabled()
  })

  it('uses the dedicated pagination token size for summary and controls', () => {
    render(<Pagination page={2} perPage={20} total={347} onPageChange={vi.fn()} />)

    expect(screen.getByText(/21–40 \/ 347건/).className).toContain('text-pagination')
    expect(screen.getByRole('button', { name: '‹' }).className).toContain('text-pagination')
    expect(screen.getByRole('button', { name: '2' }).className).toContain('text-pagination')
  })
})
