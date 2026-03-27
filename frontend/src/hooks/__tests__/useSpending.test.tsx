import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/transactions', () => ({
  getTransactions: vi.fn(),
  getTransactionsByCategory: vi.fn(),
  getTransactionsByCategoryTimeline: vi.fn(),
}));

import {
  getTransactions,
  getTransactionsByCategory,
  getTransactionsByCategoryTimeline,
} from '../../api/transactions';
import {
  useSpendingPeriodData,
  useSpendingDailyCalendarData,
  useSpendingPageState,
  useSpendingTimelineData,
  useSpendingTransactionsData,
} from '../useSpending';

const mockedGetTransactions = vi.mocked(getTransactions);
const mockedGetTransactionsByCategory = vi.mocked(getTransactionsByCategory);
const mockedGetTransactionsByCategoryTimeline = vi.mocked(getTransactionsByCategoryTimeline);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useSpendingPageState', () => {
  it('keeps transaction accordion open when page changes', () => {
    const { result } = renderHook(() => useSpendingPageState());

    act(() => {
      result.current.updateTransactionsAccordionOpen(true);
    });

    act(() => {
      result.current.updateTransactionsPage(2);
    });

    expect(result.current.transactions_accordion_open).toBe(true);
    expect(result.current.transactions_page).toBe(2);
  });

  it('tracks the shared include-income toggle', () => {
    const { result } = renderHook(() => useSpendingPageState());

    act(() => {
      result.current.updateIncludeIncome(true);
    });

    expect(result.current.include_income).toBe(true);
  });
});

describe('useSpendingDailyCalendarData', () => {
  it('preserves signed daily totals so refunds offset spending', async () => {
    mockedGetTransactions.mockResolvedValue({
      total: 5,
      page: 1,
      per_page: 200,
      items: [
        {
          id: 55,
          date: '2026-03-05',
          time: '16:32:09',
          type: '지출',
          category_major: '식비',
          category_minor: '미분류',
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '식비',
          effective_category_minor: '미분류',
          description: '우아한형제들',
          amount: -18900,
          currency: 'KRW',
          payment_method: '현대카드',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-26T14:16:36.843486Z',
          updated_at: '2026-03-26T14:16:36.843486Z',
        },
        {
          id: 56,
          date: '2026-03-05',
          time: '15:26:00',
          type: '지출',
          category_major: '보험',
          category_minor: '미분류',
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '보험',
          effective_category_minor: '미분류',
          description: '카카오페이손해보험',
          amount: -6200,
          currency: 'KRW',
          payment_method: '카카오페이',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-26T14:16:36.843486Z',
          updated_at: '2026-03-26T14:16:36.843486Z',
        },
        {
          id: 57,
          date: '2026-03-05',
          time: '12:26:46',
          type: '지출',
          category_major: '생활/잡화',
          category_minor: '미분류',
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '생활/잡화',
          effective_category_minor: '미분류',
          description: '씨유 현풍서한이다음점',
          amount: -7700,
          currency: 'KRW',
          payment_method: 'KB국민',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-26T14:16:36.843486Z',
          updated_at: '2026-03-26T14:16:36.843486Z',
        },
        {
          id: 58,
          date: '2026-03-05',
          time: '09:23:42',
          type: '지출',
          category_major: '생활/잡화',
          category_minor: '미분류',
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '생활/잡화',
          effective_category_minor: '미분류',
          description: '씨유 현풍서한이다음점',
          amount: -5500,
          currency: 'KRW',
          payment_method: 'KB국민',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-26T14:16:36.843486Z',
          updated_at: '2026-03-26T14:16:36.843486Z',
        },
        {
          id: 59,
          date: '2026-03-05',
          time: '00:00:00',
          type: '지출',
          category_major: '문화/여가',
          category_minor: '미분류',
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '문화/여가',
          effective_category_minor: '미분류',
          description: '놀유니버스티켓문화비',
          amount: 52800,
          currency: 'KRW',
          payment_method: 'Amex',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-26T14:16:36.843486Z',
          updated_at: '2026-03-26T14:16:36.843486Z',
        },
      ],
    });

    const { result } = renderHook(
      () =>
        useSpendingDailyCalendarData(
          {
            start_month: '2026-03',
            end_month: '2026-03',
          },
          false,
          '2026-03',
        ),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.items).toContainEqual({
      date: '2026-03-05',
      amount: 14500,
    });
    expect(result.current.data?.total_amount).toBe(14500);
  });

  it('includes income rows in transaction results when requested', async () => {
    mockedGetTransactions.mockResolvedValue({
      total: 2,
      page: 1,
      per_page: 200,
      items: [
        {
          id: 1,
          date: '2026-03-05',
          time: '09:00:00',
          type: '지출',
          category_major: '식비',
          category_minor: '미분류',
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '식비',
          effective_category_minor: '미분류',
          description: '점심',
          amount: -12000,
          currency: 'KRW',
          payment_method: '카드',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-26T14:16:36.843486Z',
          updated_at: '2026-03-26T14:16:36.843486Z',
        },
        {
          id: 2,
          date: '2026-03-05',
          time: '10:00:00',
          type: '수입',
          category_major: '급여',
          category_minor: '미분류',
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '급여',
          effective_category_minor: '미분류',
          description: '환급',
          amount: 8000,
          currency: 'KRW',
          payment_method: '계좌',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-26T14:16:36.843486Z',
          updated_at: '2026-03-26T14:16:36.843486Z',
        },
      ],
    });

    const { result } = renderHook(
      () =>
        useSpendingTransactionsData(
          {
            start_month: '2026-03',
            end_month: '2026-03',
            category_major: '',
            payment_method: '',
            search: '',
          },
          true,
          1,
          20,
        ),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.transactions).toHaveLength(2);
    expect(result.current.data?.transactions_total).toBe(2);
  });
});

describe('spending payload hardening', () => {
  it('falls back to an empty timeline when category timeline items are missing', async () => {
    mockedGetTransactionsByCategoryTimeline.mockResolvedValue({} as never);

    const { result } = renderHook(
      () =>
        useSpendingTimelineData({
          start_month: '',
          end_month: '',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toEqual({
      available_months: [],
      category_timeline: {
        categories: [],
        points: [],
      },
    });
  });

  it('falls back to empty period breakdowns when category or transaction items are missing', async () => {
    mockedGetTransactionsByCategory.mockResolvedValue({} as never);
    mockedGetTransactions.mockResolvedValue({
      total: 0,
      page: 1,
      per_page: 200,
    } as never);

    const { result } = renderHook(
      () =>
        useSpendingPeriodData(
          {
            start_month: '',
            end_month: '',
          },
          '',
        ),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toEqual({
      category_breakdown: [],
      subcategory_breakdown: [],
      payment_methods: [],
      merchant_breakdown: [],
      filter_options: {
        categories: [],
        subcategory_major_categories: [],
        payment_methods: [],
      },
    });
  });
});
