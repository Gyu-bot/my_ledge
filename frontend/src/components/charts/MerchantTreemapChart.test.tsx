import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MerchantTreemapChart } from './MerchantTreemapChart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Treemap: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => <div />,
}));

describe('MerchantTreemapChart', () => {
  it('fills the available card width without forcing a square frame', () => {
    render(
      <MerchantTreemapChart
        ariaLabel="거래처별 지출 트리맵"
        data={[{ name: '배달의민족', amount: 220000 }]}
      />,
    );

    expect(screen.getByLabelText('거래처별 지출 트리맵')).toHaveClass('h-[40rem]');
    expect(screen.getByLabelText('거래처별 지출 트리맵')).toHaveClass('w-full');
    expect(screen.getByLabelText('거래처별 지출 트리맵')).not.toHaveClass('aspect-square');
    expect(screen.getByLabelText('거래처별 지출 트리맵')).not.toHaveClass('max-w-[40rem]');
  });
});
