import { cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StackedBarChart } from '../../components/charts/StackedBarChart'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ content }: { content?: ReactNode }) => (
    <div data-testid="tooltip">
      {isValidElement(content)
        ? cloneElement(content as ReactElement<Record<string, unknown>>, {
            active: true,
            label: '26.01',
            payload: [
              { color: 'blue', name: '식비', payload: { total: 160000 }, value: 120000 },
              { color: 'green', name: '교통', payload: { total: 160000 }, value: 40000 },
            ],
          })
        : content}
    </div>
  ),
  XAxis: () => null,
  AreaChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: ({ dataKey }: { dataKey: string }) => <div data-testid="area-series">{dataKey}</div>,
  BarChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: ({ children, dataKey, stackId }: { children?: ReactNode; dataKey: string; stackId?: string }) => (
    <div data-testid="bar-series" data-stack-id={stackId}>
      {dataKey}
      {children}
    </div>
  ),
}))

describe('StackedBarChart', () => {
  it('renders the category timeline as stacked bars instead of an area chart', () => {
    render(
      <StackedBarChart
        items={[
          { period: '2026-01', category: '식비', amount: -120000 },
          { period: '2026-01', category: '교통', amount: -40000 },
          { period: '2026-02', category: '식비', amount: -90000 },
        ]}
      />,
    )

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('bar-series').map((series) => series.getAttribute('data-stack-id'))).toEqual([
      'spending',
      'spending',
      'spending',
    ])
  })

  it('adds monthly total labels and a tooltip total row', () => {
    render(
      <StackedBarChart
        items={[
          { period: '2026-01', category: '식비', amount: -120000 },
          { period: '2026-01', category: '교통', amount: -40000 },
        ]}
      />,
    )

    expect(screen.getByTestId('monthly-total-label')).toHaveTextContent('₩ 16만')
    expect(screen.getByTestId('tooltip')).toHaveTextContent('총액')
  })
})
