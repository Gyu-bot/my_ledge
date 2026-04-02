import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineRangeSlider } from '../TimelineRangeSlider';

describe('TimelineRangeSlider', () => {
  it('renders dual thumbs, uses soft palette surfaces, and normalizes an inverted selection', () => {
    const onChange = vi.fn();

    const { container } = render(
      <TimelineRangeSlider
        months={['2026-01', '2026-02', '2026-03']}
        values={{ start_month: '2026-01', end_month: '2026-03' }}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-testid="timeline-slider-card"]')?.className).toContain(
      'bg-[color:var(--color-primary-soft)]/25',
    );
    expect(screen.getByTestId('timeline-track-base').className).toContain(
      'bg-[color:var(--color-primary-soft)]/70',
    );
    expect(screen.getByTestId('timeline-track-active').className).toContain(
      'bg-[color:var(--color-accent-soft)]',
    );

    fireEvent.change(screen.getByLabelText('시작 월 슬라이더'), {
      target: { value: '2' },
    });

    expect(screen.getByLabelText('시작 월 슬라이더')).toBeInTheDocument();
    expect(screen.getByLabelText('종료 월 슬라이더')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith({
      start_month: '2026-03',
      end_month: '2026-03',
    });
  });
});
