import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineRangeSlider } from '../TimelineRangeSlider';

describe('TimelineRangeSlider', () => {
  it('renders dual thumbs and normalizes an inverted selection', () => {
    const onChange = vi.fn();

    render(
      <TimelineRangeSlider
        months={['2026-01', '2026-02', '2026-03']}
        values={{ start_month: '2026-01', end_month: '2026-03' }}
        onChange={onChange}
        onReset={vi.fn()}
      />,
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
