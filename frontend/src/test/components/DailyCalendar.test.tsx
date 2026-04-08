import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DailyCalendar } from '../../components/ui/DailyCalendar'

describe('DailyCalendar', () => {
  it('shows a detail popover when a populated day is hovered or focused', () => {
    render(
      <DailyCalendar
        month="2026-03"
        data={[
          { date: '2026-03-04', amount: -12000 },
          { date: '2026-03-09', amount: -4500 },
        ]}
      />,
    )

    const targetDay = screen.getByRole('button', { name: '4일: ₩12,000' })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.mouseEnter(targetDay)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('3월 4일')
    expect(tooltip).toHaveTextContent('-₩12,000')
    expect(within(screen.getByTestId('day-cell-04')).getByRole('tooltip')).toBeInTheDocument()
    expect(tooltip.className).toContain('chart-tooltip-shell')

    fireEvent.mouseLeave(targetDay)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focus(targetDay)
    expect(screen.getByRole('tooltip')).toHaveTextContent('3월 4일')
  })
})
