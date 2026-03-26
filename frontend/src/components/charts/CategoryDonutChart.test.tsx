import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategoryDonutChart } from './CategoryDonutChart';

describe('CategoryDonutChart', () => {
  it('renders the donut chart without the long legend list', () => {
    render(
      <CategoryDonutChart
        data={[
          { category: '금융', amount: 100, share: 20 },
          { category: '식비', amount: 90, share: 18 },
          { category: '미분류', amount: 80, share: 16 },
          { category: '주거/통신', amount: 70, share: 14 },
          { category: '데이트', amount: 60, share: 12 },
          { category: '문화/여가', amount: 50, share: 10 },
          { category: '교통/차량', amount: 40, share: 8 },
        ]}
      />,
    );

    expect(screen.getByLabelText('카테고리 비중 차트')).toBeInTheDocument();
    expect(screen.queryByText('금융')).not.toBeInTheDocument();
    expect(screen.queryByText('기타')).not.toBeInTheDocument();
  });
});
