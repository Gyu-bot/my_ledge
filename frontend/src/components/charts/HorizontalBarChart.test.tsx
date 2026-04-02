import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HorizontalBarChart } from './HorizontalBarChart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Bar: ({
    radius,
    fill,
  }: {
    radius: number[];
    fill: string;
  }) => <div data-fill={fill} data-radius={radius.join(',')} data-testid="horizontal-bar-series" />,
}));

describe('HorizontalBarChart', () => {
  it('uses the shared low-roundness radius and updated primary fill', () => {
    render(
      <HorizontalBarChart
        ariaLabel="결제수단 차트"
        data={[
          { label: '카드 A', amount: 100000 },
          { label: '카드 B', amount: 80000 },
        ]}
      />,
    );

    const bar = screen.getByTestId('horizontal-bar-series');
    expect(bar).toHaveAttribute('data-fill', '#2563eb');
    expect(bar).toHaveAttribute('data-radius', '0,2,2,0');
  });
});
