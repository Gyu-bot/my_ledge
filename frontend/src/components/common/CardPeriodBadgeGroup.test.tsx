import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardPeriodBadgeGroup } from './CardPeriodBadgeGroup';

describe('CardPeriodBadgeGroup', () => {
  it('keeps range badges on a single line', () => {
    render(
      <CardPeriodBadgeGroup
        ariaLabel="테스트 기간"
        end="2026-03"
        start="2026-01"
      />,
    );

    const group = screen.getByRole('group', { name: '테스트 기간' });
    expect(group.className).toContain('flex-nowrap');
    expect(group.className).toContain('whitespace-nowrap');
  });
});
