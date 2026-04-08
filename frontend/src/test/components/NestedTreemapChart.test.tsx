import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NestedTreemapChart } from '../../components/charts/NestedTreemapChart'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  Treemap: ({
    data,
    onClick,
  }: {
    data: Array<{ name: string; category?: string }>
    onClick?: (node: { name?: string; category?: string }) => void
  }) => (
    <div>
      {data.map((item) => (
        <button
          key={item.name}
          type="button"
          onClick={() => onClick?.(item)}
        >
          {item.name}
        </button>
      ))}
    </div>
  ),
}))

describe('NestedTreemapChart', () => {
  it('supports category and merchant view selectors without the old helper copy', () => {
    render(
      <NestedTreemapChart
        items={[
          {
            name: '식비',
            children: [
              { name: '마켓A', size: 120000, category: '식비' },
              { name: '카페B', size: 40000, category: '식비' },
            ],
          },
          {
            name: '교통',
            children: [{ name: '택시', size: 30000, category: '교통' }],
          },
        ]}
      />,
    )

    expect(screen.queryByText('카테고리 기준')).not.toBeInTheDocument()
    expect(screen.queryByText('선택한 카테고리 안에서 거래처별 비중을 확인합니다.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카테고리별' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '거래처별' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '거래처별' }))
    expect(screen.queryByRole('button', { name: '카테고리로 돌아가기' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '거래처별' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '카테고리별' })).toHaveAttribute('aria-pressed', 'false')
  })
})
