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
    expect(within(tooltip).getByText('3월 4일').className).toContain('chart-tooltip-label')
    expect(within(tooltip).getByText('-₩12,000').className).toContain('chart-tooltip-value')
    expect(within(screen.getByTestId('day-cell-04')).getByText('4').className).toContain('text-text-faint')

    fireEvent.mouseLeave(targetDay)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focus(targetDay)
    expect(screen.getByRole('tooltip')).toHaveTextContent('3월 4일')
  })

  it('renders a larger status dot for populated days', () => {
    const { container } = render(
      <DailyCalendar
        month="2026-03"
        data={[{ date: '2026-03-04', amount: -12000 }]}
      />,
    )

    const dot = container.querySelector('[data-testid="day-cell-04"] span[style]')
    if (!(dot instanceof HTMLElement)) {
      throw new Error('Expected populated day dot to exist')
    }
    expect(dot.className).toContain('w-[6px]')
    expect(dot.className).toContain('h-[6px]')
  })
})
