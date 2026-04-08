import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NestedTreemapChart } from '../../components/charts/NestedTreemapChart'

describe('NestedTreemapChart', () => {
  it('starts at category level and drills down to merchants on category click', () => {
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
            children: [
              { name: '택시', size: 30000, category: '교통' },
            ],
          },
        ]}
      />,
    )

    expect(screen.getByText('카테고리 기준')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('식비 드릴다운'))

    expect(screen.getByText('식비 거래처')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카테고리로 돌아가기' })).toBeInTheDocument()
  })
})
