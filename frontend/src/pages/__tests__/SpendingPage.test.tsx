import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpendingPage } from '../SpendingPage';

vi.mock('../../hooks/useSpending', () => ({
  useSpendingPageState: vi.fn(),
  useSpendingDailyCalendarData: vi.fn(),
  useSpendingPeriodData: vi.fn(),
  useSpendingTimelineData: vi.fn(),
  useSpendingTransactionsData: vi.fn(),
  getSystemMonth: vi.fn(() => '2026-03'),
  resolvePreferredMonth: vi.fn(() => '2026-03'),
}));

import {
  useSpendingDailyCalendarData,
  useSpendingPageState,
  useSpendingPeriodData,
  useSpendingTimelineData,
  useSpendingTransactionsData,
} from '../../hooks/useSpending';

const mockedUseSpendingPageState = vi.mocked(useSpendingPageState);
const mockedUseSpendingDailyCalendarData = vi.mocked(useSpendingDailyCalendarData);
const mockedUseSpendingPeriodData = vi.mocked(useSpendingPeriodData);
const mockedUseSpendingTimelineData = vi.mocked(useSpendingTimelineData);
const mockedUseSpendingTransactionsData = vi.mocked(useSpendingTransactionsData);

describe('SpendingPage', () => {
  it('renders spending filters, charts, and transaction table', () => {
    mockedUseSpendingPageState.mockReturnValue({
      timeline_filters: {
        start_month: '2026-01',
        end_month: '2026-03',
      },
      detail_filters: {
        start_month: '2026-01',
        end_month: '2026-03',
      },
      subcategory_major_filter: '',
      include_income: false,
      daily_calendar_month: '2026-03',
      transactions_page: 1,
      transactions_per_page: 20,
      transactions_accordion_open: true,
      updateTimelineFilters: vi.fn(),
      resetTimelineFilters: vi.fn(),
      updateDetailFilters: vi.fn(),
      resetDetailFilters: vi.fn(),
      updateSubcategoryMajorFilter: vi.fn(),
      updateIncludeIncome: vi.fn(),
      updateDailyCalendarMonth: vi.fn(),
      updateTransactionsPage: vi.fn(),
      updateTransactionsAccordionOpen: vi.fn(),
    });

    mockedUseSpendingTimelineData.mockReturnValue({
      data: {
        available_months: ['2026-01', '2026-02', '2026-03'],
        category_timeline: {
          categories: ['식비', '교통'],
          points: [
            { period: '2026-01', values: { 식비: 120000, 교통: 40000 } },
            { period: '2026-02', values: { 식비: 90000, 교통: 55000 } },
          ],
        },
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSpendingTimelineData>);

    mockedUseSpendingPeriodData.mockReturnValue({
      data: {
        category_breakdown: [
          { label: '식비', amount: 240000, share: 66.7 },
          { label: '교통', amount: 120000, share: 33.3 },
        ],
        subcategory_breakdown: [
          { label: '식비 / 점심', amount: 150000, share: 41.7 },
          { label: '식비 / 커피', amount: 90000, share: 25 },
        ],
        merchant_breakdown: [
          { name: '점심', amount: 150000 },
          { name: '카페', amount: 90000 },
        ],
        filter_options: {
          subcategory_major_categories: ['식비', '교통'],
        },
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSpendingPeriodData>);

    mockedUseSpendingDailyCalendarData.mockReturnValue({
      data: {
        available_months: ['2026-02', '2026-03'],
        selected_month: '2026-03',
        items: [
          { date: '2026-03-01', amount: 12000 },
          { date: '2026-03-03', amount: 34000 },
        ],
        total_amount: 46000,
        max_amount: 34000,
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSpendingDailyCalendarData>);

    mockedUseSpendingTransactionsData.mockReturnValue({
      data: {
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
            effective_category_minor: '점심',
            description: '점심',
            amount: -12000,
            currency: 'KRW',
            payment_method: '카드 A',
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: false,
            source: 'import',
            cost_kind: null,
            fixed_cost_necessity: null,
            created_at: '2026-03-24T08:30:00',
            updated_at: '2026-03-24T08:30:00',
          },
        ],
        transactions_total: 42,
        transactions_page: 1,
        transactions_per_page: 20,
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useSpendingTransactionsData>);

    render(<SpendingPage />);

    expect(screen.getByRole('heading', { level: 2, name: '지출 분석' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '월별 카테고리 추이' })).toBeInTheDocument();
    expect(screen.getByText(/시계열 기간/)).toBeInTheDocument();
    expect(screen.getByText('아래 카드부터 월 필터 적용')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '카테고리별 지출' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '하위 카테고리별 지출' })).toBeInTheDocument();
    expect(screen.getByLabelText('상위 카테고리 필터')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '월별 고정비/변동비 추이' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '고정비 필수/비필수 비율' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '변동비 비율' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '거래처별 Tree Map' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '일별 지출액' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기간 적용' })).toBeInTheDocument();
    expect(screen.queryByText('카테고리', { selector: 'span' })).not.toBeInTheDocument();
    expect(screen.queryByText('결제수단', { selector: 'span' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('거래 설명 검색')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '수입 포함' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '거래내역 수입 포함' })).toBeInTheDocument();
    expect(screen.getByText('2026-03 기준')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '거래 내역' })).toBeInTheDocument();
    expect(screen.getByText('거래 내역 접기')).toBeInTheDocument();
    expect(screen.getByText('1 / 3 페이지')).toBeInTheDocument();

    expect(
      within(screen.getByTestId('monthly-category-timeline-card')).queryByText(/시계열 기간/),
    ).not.toBeInTheDocument();
  });
});
