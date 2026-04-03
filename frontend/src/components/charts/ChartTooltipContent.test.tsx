import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartTooltipContent } from './ChartTooltipContent';

describe('ChartTooltipContent', () => {
  it('uses compact text sizing and shared color indicators', () => {
    render(
      <ChartTooltipContent
        items={[
          { color: '#223a5e', label: '수입', value: '3,200,000원' },
          { color: '#c96a1b', label: '지출', value: '802,000원' },
        ]}
        title="2026-03"
      />,
    );

    expect(screen.getByText('2026-03').className).toContain('text-xs');
    expect(screen.getAllByText(/원$/)[0].className).toContain('text-xs');
    expect(screen.getAllByTestId('chart-tooltip-indicator')).toHaveLength(2);
  });
});
