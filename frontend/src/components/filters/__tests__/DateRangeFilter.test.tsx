import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateRangeFilter } from '../DateRangeFilter';

describe('DateRangeFilter', () => {
  it('keeps month inputs shrinkable on mobile and only splits into two columns on medium screens', () => {
    render(
      <DateRangeFilter
        startMonth="2026-01"
        endMonth="2026-03"
        onStartMonthChange={vi.fn()}
        onEndMonthChange={vi.fn()}
      />,
    );

    const startInput = screen.getByLabelText('시작 월');
    const endInput = screen.getByLabelText('종료 월');
    const grid = startInput.closest('.grid');

    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('md:grid-cols-2');
    expect(startInput).toHaveClass('min-w-0');
    expect(endInput).toHaveClass('min-w-0');
    expect(startInput.parentElement).toHaveClass('min-w-0');
    expect(endInput.parentElement).toHaveClass('min-w-0');
  });

  it('uses select-based month pickers when month options are provided', () => {
    render(
      <DateRangeFilter
        monthOptions={['2026-01', '2026-02', '2026-03']}
        startMonth="2026-01"
        endMonth="2026-03"
        onStartMonthChange={vi.fn()}
        onEndMonthChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: '시작 월' })).toHaveClass('min-w-0');
    expect(screen.getByRole('combobox', { name: '종료 월' })).toHaveClass('min-w-0');
    expect(screen.queryByDisplayValue('2026-01')).not.toBeInTheDocument();
  });
});
