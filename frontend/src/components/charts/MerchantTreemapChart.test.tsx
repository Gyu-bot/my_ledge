import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MerchantTreemapChart } from './MerchantTreemapChart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Treemap: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => <div />,
}));

describe('MerchantTreemapChart', () => {
  it('uses a larger square chart frame', () => {
    render(
      <MerchantTreemapChart
        ariaLabel="거래처별 지출 트리맵"
        data={[{ name: '배달의민족', amount: 220000 }]}
      />,
    );

    expect(screen.getByLabelText('거래처별 지출 트리맵')).toHaveClass('aspect-square');
    expect(screen.getByLabelText('거래처별 지출 트리맵')).toHaveClass('max-w-[40rem]');
  });
});
