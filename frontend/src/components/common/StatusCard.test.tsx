import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusCard } from './StatusCard';

describe('StatusCard', () => {
  it('uses a subtle gradient surface for highlighted KPI cards', () => {
    const { rerender } = render(
      <StatusCard
        detail="2026-03-24 기준"
        label="순자산"
        tone="primary"
        value="106,814,249원"
      />,
    );

    expect(screen.getByText('순자산').closest('.p-0')).toHaveClass(
      'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(231,237,245,0.9))]',
    );

    rerender(
      <StatusCard
        detail="순현금흐름 -4,210,654원"
        label="저축률"
        tone="accent"
        value="적자 구간"
      />,
    );

    expect(screen.getByText('저축률').closest('.p-0')).toHaveClass(
      'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,232,231,0.9))]',
    );
  });
});
