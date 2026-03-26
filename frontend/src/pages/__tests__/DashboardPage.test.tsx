import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPage } from '../DashboardPage';

vi.mock('../../hooks/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('../../components/dashboard/CategoryBreakdownCard', () => ({
  CategoryBreakdownCard: () => <div>카테고리 비중 카드</div>,
}));

import { useDashboard } from '../../hooks/useDashboard';

const mockedUseDashboard = vi.mocked(useDashboard);

describe('DashboardPage', () => {
  it('renders summary cards, a monthly trend chart, and recent transactions', () => {
    mockedUseDashboard.mockReturnValue({
      data: {
        snapshot_date: '2026-03-24',
        summary_cards: [
          { label: '순자산', value: '₩106.8M', detail: '최신 스냅샷 기준' },
          { label: '총자산', value: '₩341.4M', detail: '전체 계좌 합산' },
          { label: '총부채', value: '₩234.6M', detail: '현재 잔액 기준' },
          { label: '이번 달 지출', value: '₩80K', detail: '2026년 3월' },
        ],
        monthly_spend: [
          { period: '2026-02', amount: -50 },
          { period: '2026-03', amount: -80 },
        ],
        category_breakdown: [
          { category: '교통', amount: 80, share: 61.5 },
          { category: '식비', amount: 50, share: 38.5 },
        ],
        recent_transactions: [
          {
            id: 1,
            date: '2026-03-24',
            time: '08:30:00',
            type: '지출',
            category_major: '교통',
            category_minor: null,
            category_major_user: null,
            category_minor_user: null,
            effective_category_major: '교통',
            effective_category_minor: null,
            description: '지하철',
            amount: -1450,
            currency: 'KRW',
            payment_method: '카드 A',
            cost_kind: null,
            fixed_cost_necessity: null,
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: false,
            source: 'import',
            created_at: '2026-03-24T08:30:00',
            updated_at: '2026-03-24T08:30:00',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useDashboard>);

    render(<DashboardPage />);

    expect(screen.getByText(/^순자산$/)).toBeInTheDocument();
    expect(screen.getByText(/월별 지출 추이/)).toBeInTheDocument();
    expect(screen.getByText(/카테고리 비중 카드/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '최근 거래' })).toBeInTheDocument();
    expect(screen.getAllByText(/지하철/i)).toHaveLength(2);
  });

  it('renders a loading state while the dashboard query is pending', () => {
    mockedUseDashboard.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useDashboard>);

    render(<DashboardPage />);

    expect(screen.getByText(/대시보드 불러오는 중/i)).toBeInTheDocument();
  });

  it('renders an error state when the dashboard query fails', () => {
    mockedUseDashboard.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
    } as ReturnType<typeof useDashboard>);

    render(<DashboardPage />);

    expect(screen.getByText(/대시보드 데이터를 불러올 수 없습니다/i)).toBeInTheDocument();
  });
});
