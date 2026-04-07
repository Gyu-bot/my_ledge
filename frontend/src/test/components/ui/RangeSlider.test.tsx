import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RangeSlider } from '../../../components/ui/RangeSlider'

const MONTHS = ['2025-01', '2025-02', '2025-03', '2025-04']

describe('RangeSlider', () => {
  it('reflects parent value updates instead of holding stale internal state', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <RangeSlider months={MONTHS} value={['2025-02', '2025-04']} onChange={onChange} />,
    )

    expect(screen.getAllByText('2025-02').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2025-04').length).toBeGreaterThan(0)

    rerender(
      <RangeSlider months={MONTHS} value={['2025-01', '2025-03']} onChange={onChange} />,
    )

    expect(screen.getAllByText('2025-01').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2025-03').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('2025-02')).toHaveLength(0)
  })

  it('emits the updated range immediately when the user changes the start month', () => {
    const onChange = vi.fn()
    const { container } = render(
      <RangeSlider months={MONTHS} value={['2025-02', '2025-04']} onChange={onChange} />,
    )

    const ranges = container.querySelectorAll('input[type="range"]')
    fireEvent.change(ranges[0], { target: { value: '0' } })

    expect(onChange).toHaveBeenCalledWith(['2025-01', '2025-04'])
  })
})
