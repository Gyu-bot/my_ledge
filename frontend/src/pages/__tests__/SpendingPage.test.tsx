import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpendingPage } from '../SpendingPage';

vi.mock('../../hooks/useSpending', () => ({
  useSpending: vi.fn(),
}));

import { useSpending } from '../../hooks/useSpending';

const mockedUseSpending = vi.mocked(useSpending);

describe('SpendingPage', () => {
  it('renders spending filters, charts, and transaction table', () => {
    mockedUseSpending.mockReturnValue({
      data: {
        filters: {
          start_month: '2026-01',
          end_month: '2026-03',
          category_major: '',
          payment_method: '',
          search: '',
        },
        category_timeline: {
          categories: ['식비', '교통'],
          points: [
            { period: '2026-01', values: { 식비: 120000, 교통: 40000 } },
            { period: '2026-02', values: { 식비: 90000, 교통: 55000 } },
          ],
        },
        category_breakdown: [
          { label: '식비', amount: 240000 },
          { label: '교통', amount: 120000 },
        ],
        payment_methods: [
          { label: '카드 A', amount: 180000 },
          { label: '카드 B', amount: 90000 },
        ],
        transactions: [
          {
            id: 1,
            date: '2026-03-24',
            time: '08:30:00',
            type: '지출',
            category_major: '식비',
            category_minor: null,
            category_major_user: null,
            category_minor_user: null,
            effective_category_major: '식비',
            effective_category_minor: null,
            description: '점심',
            amount: -12000,
            currency: 'KRW',
            payment_method: '카드 A',
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: false,
            source: 'import',
            created_at: '2026-03-24T08:30:00',
            updated_at: '2026-03-24T08:30:00',
          },
        ],
        filter_options: {
          categories: ['식비', '교통'],
          payment_methods: ['카드 A', '카드 B'],
        },
      },
      isPending: false,
      isError: false,
      error: null,
      updateFilters: vi.fn(),
      resetFilters: vi.fn(),
    } as ReturnType<typeof useSpending>);

    render(<SpendingPage />);

    expect(screen.getByRole('heading', { level: 2, name: '지출 분석' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '월별 카테고리 추이' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '카테고리별 지출' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '결제수단별 지출' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '거래 내역' })).toBeInTheDocument();
  });
});
