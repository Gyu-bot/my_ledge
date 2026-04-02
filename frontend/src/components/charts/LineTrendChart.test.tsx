import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LineTrendChart } from './LineTrendChart';

describe('LineTrendChart', () => {
  it('renders a single-point fallback instead of an empty chart area', () => {
    render(<LineTrendChart data={[{ period: '2026-03-24', amount: 106814249 }]} />);

    expect(screen.getByText('단일 스냅샷')).toBeInTheDocument();
    expect(screen.getByText(/추세 비교를 하려면 스냅샷이 더 필요합니다/i)).toBeInTheDocument();
    expect(screen.getByText('₩106,814,249')).toBeInTheDocument();
  });
});
