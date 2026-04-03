import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BreakdownPieChart } from './BreakdownPieChart';
import { CategoryDonutChart } from './CategoryDonutChart';
import { CategoryTimelineAreaChart } from './CategoryTimelineAreaChart';
import { HorizontalBarChart } from './HorizontalBarChart';
import { LineTrendChart } from './LineTrendChart';
import { MerchantTreemapChart } from './MerchantTreemapChart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({
    children,
    minWidth,
  }: {
    children: React.ReactNode;
    minWidth?: number;
  }) => (
    <div data-min-width={minWidth === undefined ? 'unset' : String(minWidth)} data-testid="responsive-container">
      {children}
    </div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => <div />,
  Tooltip: () => <div />,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => <div />,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  Treemap: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('mobile chart responsiveness', () => {
  it('does not force desktop min widths inside mobile card content', () => {
    const { rerender } = render(
      <BreakdownPieChart
        ariaLabel="결제수단 비중 차트"
        data={[{ label: '카드', amount: 100000, share: 100 }]}
      />,
    );
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-min-width', 'unset');

    rerender(
      <CategoryDonutChart
        data={[
          { category: '금융', amount: 100, share: 20 },
          { category: '식비', amount: 90, share: 18 },
        ]}
      />,
    );
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-min-width', 'unset');

    rerender(
      <CategoryTimelineAreaChart
        categories={['식비']}
        data={[{ period: '2026-03', values: { 식비: 120000 } }]}
      />,
    );
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-min-width', 'unset');

    rerender(
      <HorizontalBarChart
        ariaLabel="카테고리별 지출 차트"
        data={[{ label: '식비', amount: 120000 }]}
      />,
    );
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-min-width', 'unset');

    rerender(
      <LineTrendChart
        data={[
          { period: '2026-02', amount: 1000000 },
          { period: '2026-03', amount: 1200000 },
        ]}
      />,
    );
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-min-width', 'unset');

    rerender(
      <MerchantTreemapChart
        ariaLabel="거래처별 지출 트리맵"
        data={[{ name: '배달의민족', amount: 220000 }]}
      />,
    );
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-min-width', 'unset');
  });
});
