import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryTimelineAreaChart } from './CategoryTimelineAreaChart';

vi.mock('recharts', async () => {
  const React = await import('react');

  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="category-timeline-bar-chart">{children}</div>
    ),
    CartesianGrid: () => <div data-testid="category-timeline-grid" />,
    XAxis: () => <div data-testid="category-timeline-x-axis" />,
    YAxis: () => <div data-testid="category-timeline-y-axis" />,
    Tooltip: ({
      content,
    }: {
      content?:
        | React.ReactElement
        | ((props: {
            active?: boolean;
            label?: string;
            payload?: Array<{ name: string; value: number; color: string }>;
          }) => React.ReactNode);
    }) => {
      const props = {
        active: true,
        label: '2026-01',
        payload: [
          { name: '식비', value: 120000, color: '#223a5e' },
          { name: '교통', value: 40000, color: '#b6413b' },
        ],
      };

      if (typeof content === 'function') {
        return <div data-testid="category-timeline-tooltip">{content(props)}</div>;
      }

      if (React.isValidElement(content)) {
        return (
          <div data-testid="category-timeline-tooltip">
            {React.cloneElement(
              content as React.ReactElement<Record<string, unknown>>,
              props as Record<string, unknown>,
            )}
          </div>
        );
      }

      return <div data-testid="category-timeline-tooltip" />;
    },
    Bar: ({
      dataKey,
      stackId,
      fill,
      radius,
    }: {
      dataKey: string;
      stackId?: string;
      fill: string;
      radius?: number[];
    }) => (
      <div
        data-fill={fill}
        data-key={dataKey}
        data-radius={radius?.join(',')}
        data-stack={stackId}
        data-testid={`category-bar-${dataKey}`}
      />
    ),
  };
});

describe('CategoryTimelineAreaChart', () => {
  it('renders a stacked bar chart without a y-axis and shows tooltip line indicators', () => {
    render(
      <CategoryTimelineAreaChart
        categories={['식비', '교통']}
        data={[
          { period: '2026-01', values: { 식비: 120000, 교통: 40000 } },
          { period: '2026-02', values: { 식비: 90000, 교통: 55000 } },
        ]}
      />,
    );

    expect(screen.getByTestId('category-timeline-bar-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('category-timeline-y-axis')).not.toBeInTheDocument();
    expect(screen.getByTestId('category-bar-식비')).toHaveAttribute('data-stack', 'category-spend');
    expect(screen.getByTestId('category-bar-교통')).toHaveAttribute('data-stack', 'category-spend');
    expect(screen.getByText('2026-01')).toBeInTheDocument();
    expect(screen.getByTestId('category-bar-식비')).toBeInTheDocument();
    expect(screen.getByTestId('category-bar-교통')).toBeInTheDocument();

    const tooltip = screen.getByTestId('category-timeline-tooltip');
    expect(tooltip.querySelectorAll('.h-px.w-3\\.5')).toHaveLength(2);
  });
});
