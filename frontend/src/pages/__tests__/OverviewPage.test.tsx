import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OverviewPage } from '../OverviewPage';
import type { OverviewData } from '../../hooks/useOverview';

vi.mock('../../hooks/useOverview', () => ({
  useOverview: vi.fn(),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="monthly-cashflow-line-chart">{children}</div>
  ),
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="monthly-cashflow-chart">{children}</div>
  ),
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Bar: ({
    dataKey,
    radius,
    fill,
  }: {
    dataKey: string;
    radius?: number[];
    fill?: string;
  }) => (
    <div
      data-fill={fill}
      data-radius={radius?.join(',')}
      data-testid={`bar-series-${dataKey}`}
    />
  ),
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-series-${dataKey}`} />,
}));

import { useOverview } from '../../hooks/useOverview';

const mockedUseOverview = vi.mocked(useOverview);

function buildOverviewData(overrides: Partial<OverviewData> = {}): OverviewData {
  return {
    snapshot_date: '2026-03-24',
    summary_cards: [
      { label: '순자산', value: '106,814,249원', detail: '2026-03-24 기준' },
      { label: '이번 달 지출', value: '802,000원', detail: '전월 대비 -120,000원' },
      { label: '이번 달 수입', value: '3,200,000원', detail: '3월 누적 기준' },
      { label: '저축률', value: '42.5%', detail: '순현금흐름 1,360,000원' },
    ],
    monthly_cashflow: [
      {
        period: '2026-02',
        income: 3200000,
        expense: 910000,
        transfer: 400000,
        net_cashflow: 2290000,
        savings_rate: 71.6,
      },
      {
        period: '2026-03',
        income: 3200000,
        expense: 802000,
        transfer: 520000,
        net_cashflow: 2398000,
        savings_rate: 74.9,
      },
    ],
    signal_summaries: [
      { label: '이상 지출', value: '2건', detail: '교통비와 생활비에서 탐지' },
      { label: '반복 결제', value: '4건', detail: '월간 정기 결제 후보' },
      { label: '수입 안정성', value: '안정적', detail: '변동계수 0.08' },
    ],
    category_top5: [
      { category: '식비', amount: 280000, share: 34.9 },
      { category: '주거', amount: 220000, share: 27.4 },
      { category: '교통', amount: 110000, share: 13.7 },
      { category: '생활', amount: 95000, share: 11.8 },
      { category: '구독', amount: 97000, share: 12.1 },
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
    recent_upload_status: null,
    ...overrides,
  };
}

describe('OverviewPage', () => {
  it('renders KPI cards, monthly cashflow, signal summaries, category top 5, and recent transactions', () => {
    mockedUseOverview.mockReturnValue({
      data: buildOverviewData(),
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useOverview>);

    render(<OverviewPage />);

    expect(screen.getByRole('heading', { level: 2, name: '개요' })).toBeInTheDocument();
    expect(screen.getByText(/^순자산$/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '월간 현금흐름' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '주의 신호' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '카테고리 요약 Top 5' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '최근 거래' })).toBeInTheDocument();
    expect(screen.getAllByText('지하철')).toHaveLength(2);
  });

  it('renders monthly cashflow as income/expense bars with a net cashflow line and no transfer series', () => {
    mockedUseOverview.mockReturnValue({
      data: buildOverviewData(),
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useOverview>);

    render(<OverviewPage />);

    expect(
      screen.getByText('수입과 지출은 막대로, 순현금흐름은 선으로 월 단위 비교합니다.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('bar-series-income')).toBeInTheDocument();
    expect(screen.getByTestId('bar-series-expense')).toBeInTheDocument();
    expect(screen.getByTestId('line-series-net_cashflow')).toBeInTheDocument();
    expect(screen.getByTestId('bar-series-income')).toHaveAttribute('data-radius', '2,2,0,0');
    expect(screen.getByTestId('bar-series-expense')).toHaveAttribute('data-radius', '2,2,0,0');
    expect(screen.queryByTestId('bar-series-transfer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-series-transfer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-series-income')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-series-expense')).not.toBeInTheDocument();
  });

  it('gives recent transactions more width than category top 5 on desktop', () => {
    mockedUseOverview.mockReturnValue({
      data: buildOverviewData({
        summary_cards: [],
        monthly_cashflow: [],
        signal_summaries: [],
        category_top5: [
          { category: '식비', amount: 280000, share: 34.9 },
          { category: '주거', amount: 220000, share: 27.4 },
        ],
      }),
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useOverview>);

    render(<OverviewPage />);

    const recentTransactionsSection = screen
      .getByRole('heading', { level: 3, name: '최근 거래' })
      .closest('section');

    expect(recentTransactionsSection).toHaveClass(
      'xl:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.38fr)]',
    );
  });

  it('renders a loading state while overview data is pending', () => {
    mockedUseOverview.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useOverview>);

    render(<OverviewPage />);

    expect(screen.getByText(/개요 불러오는 중/i)).toBeInTheDocument();
  });

  it('renders an error state when overview data fails to load', () => {
    mockedUseOverview.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
    } as ReturnType<typeof useOverview>);

    render(<OverviewPage />);

    expect(screen.getByText(/개요 데이터를 불러올 수 없습니다/i)).toBeInTheDocument();
  });
});
