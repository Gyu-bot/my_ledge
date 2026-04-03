import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryTimelineAreaChart } from './CategoryTimelineAreaChart';

vi.mock('recharts', async () => {
  const React = await import('react');

  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AreaChart: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="category-timeline-area-chart">{children}</div>
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
    Area: ({
      dataKey,
      fill,
      stackId,
      stroke,
      type,
    }: {
      dataKey: string;
      fill: string;
      stackId?: string;
      stroke?: string;
      type?: string;
    }) => (
      <div
        data-fill={fill}
        data-key={dataKey}
        data-stack={stackId}
        data-stroke={stroke}
        data-type={type}
        data-testid={`category-area-${dataKey}`}
      />
    ),
  };
});

describe('CategoryTimelineAreaChart', () => {
  it('renders a linear stacked area chart without a y-axis and shows tooltip line indicators', () => {
    render(
      <CategoryTimelineAreaChart
        categories={['식비', '교통']}
        data={[
          { period: '2026-01', values: { 식비: 120000, 교통: 40000 } },
          { period: '2026-02', values: { 식비: 90000, 교통: 55000 } },
        ]}
      />,
    );

    expect(screen.getByTestId('category-timeline-area-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('category-timeline-y-axis')).not.toBeInTheDocument();
    expect(screen.getByTestId('category-area-식비')).toHaveAttribute('data-stack', 'category-spend');
    expect(screen.getByTestId('category-area-교통')).toHaveAttribute('data-stack', 'category-spend');
    expect(screen.getByTestId('category-area-식비')).toHaveAttribute('data-type', 'linear');
    expect(screen.getByTestId('category-area-교통')).toHaveAttribute('data-type', 'linear');
    expect(screen.getByText('2026-01')).toBeInTheDocument();
    expect(screen.getByTestId('category-area-식비')).toBeInTheDocument();
    expect(screen.getByTestId('category-area-교통')).toBeInTheDocument();

    const tooltip = screen.getByTestId('category-timeline-tooltip');
    expect(within(tooltip).getAllByTestId('chart-tooltip-indicator')).toHaveLength(2);
  });
});
