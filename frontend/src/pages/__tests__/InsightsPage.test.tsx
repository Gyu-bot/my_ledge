import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InsightsPage } from '../InsightsPage';

vi.mock('../../hooks/useInsights', () => ({
  useInsights: vi.fn(),
}));

import { useInsights } from '../../hooks/useInsights';

const mockedUseInsights = vi.mocked(useInsights);

describe('InsightsPage', () => {
  it('renders insight summaries, recurring payments, anomalies, and assumptions', () => {
    mockedUseInsights.mockReturnValue({
      data: {
        summary_cards: [
          { label: '저축률', value: '42.5%', detail: '최근 월 순현금흐름 기준' },
          { label: '수입 변동성', value: '0.08', detail: '낮은 변동성' },
          { label: '이상 카테고리 수', value: '2개', detail: '최근 비교 구간 기준' },
        ],
        key_insights: [
          {
            title: '현금흐름은 안정적입니다',
            description: '최근 3개월 평균 순현금흐름이 플러스이고 저축률도 유지되고 있습니다.',
          },
          {
            title: '반복 결제가 늘고 있습니다',
            description: '구독과 주거 비용이 월간 고정비로 강하게 관측됩니다.',
          },
        ],
        assumptions: [
          'income-stability: 표본 3개월 기준으로 계산했습니다.',
          'spending-anomalies: 최근 비교 가능한 월 평균을 baseline으로 사용했습니다.',
        ],
        recurring_payments: [
          {
            description: '넷플릭스',
            category: '구독',
            avg_amount: 17000,
            interval_type: 'monthly',
            avg_interval_days: 30,
            occurrences: 4,
            confidence: 0.92,
            last_date: '2026-03-12',
          },
        ],
        spending_anomalies: [
          {
            period: '2026-03',
            category: '교통',
            amount: 180000,
            baseline_avg: 90000,
            delta_pct: 100,
            anomaly_score: 0.88,
            reason: '전월 평균 대비 2배 증가',
          },
        ],
        merchant_spend: [
          {
            merchant: '배달의민족',
            amount: 220000,
            count: 12,
            avg_amount: 18333.33,
            last_seen_at: '2026-03-25T12:30:00',
          },
        ],
        category_mom: [
          {
            period: '2026-03',
            previous_period: '2026-02',
            category: '교통',
            current_amount: 180000,
            previous_amount: 90000,
            delta_amount: 90000,
            delta_pct: 100,
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useInsights>);

    render(<InsightsPage />);

    expect(screen.getByRole('heading', { level: 2, name: '인사이트' })).toBeInTheDocument();
    expect(screen.getByText(/^저축률$/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '핵심 인사이트' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '반복 결제' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '이상 지출' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Assumptions' })).toBeInTheDocument();
    expect(screen.getByText('넷플릭스')).toBeInTheDocument();
  });

  it('renders a loading state while insights data is pending', () => {
    mockedUseInsights.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useInsights>);

    render(<InsightsPage />);

    expect(screen.getByText(/인사이트 불러오는 중/i)).toBeInTheDocument();
  });

  it('renders an error state when insights data fails to load', () => {
    mockedUseInsights.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
    } as ReturnType<typeof useInsights>);

    render(<InsightsPage />);

    expect(screen.getByText(/인사이트 데이터를 불러올 수 없습니다/i)).toBeInTheDocument();
  });
});
