import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CategoryBreakdownCard } from './CategoryBreakdownCard';

vi.mock('../../api/dashboard', () => ({
  getCategoryBreakdown: vi.fn(),
}));

import { getCategoryBreakdown } from '../../api/dashboard';

const mockedGetCategoryBreakdown = vi.mocked(getCategoryBreakdown);

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CategoryBreakdownCard
        data={[
          { category: '식비', amount: 120000, share: 60 },
          { category: '교통', amount: 80000, share: 40 },
        ]}
        referenceMonth="2026-03"
      />
    </QueryClientProvider>,
  );
}

describe('CategoryBreakdownCard', () => {
  beforeEach(() => {
    mockedGetCategoryBreakdown.mockReset();
    mockedGetCategoryBreakdown.mockResolvedValue({
      items: [
        { category: '식비', amount: -150000 },
        { category: '교통', amount: -100000 },
      ],
    });
  });

  it('renders the all-period view by default', () => {
    renderCard();

    expect(screen.getAllByText('조회 기간 전체').length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: '카테고리 비중 적용 기간' })).toHaveTextContent(
      '조회 기간 전체',
    );
    expect(screen.queryByLabelText('시작 월')).not.toBeInTheDocument();
    expect(screen.getByLabelText('카테고리 비중 차트')).toBeInTheDocument();
    expect(mockedGetCategoryBreakdown).not.toHaveBeenCalled();
  });

  it('requests the expected date range when a preset is selected', async () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: '기간 변경' }));
    fireEvent.click(screen.getByRole('button', { name: '최근 3개월' }));

    await waitFor(() => {
      expect(mockedGetCategoryBreakdown).toHaveBeenCalledWith({
        start_date: '2026-01-01',
        end_date: '2026-03-31',
      });
    });

    expect(screen.getByRole('group', { name: '카테고리 비중 적용 기간' })).toHaveTextContent(
      '2026-01',
    );
    expect(screen.getByRole('group', { name: '카테고리 비중 적용 기간' })).toHaveTextContent(
      '2026-03',
    );
  });

  it('applies a custom month range with month-based boundaries', async () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: '기간 변경' }));
    fireEvent.change(screen.getByLabelText('시작 월'), { target: { value: '2026-01' } });
    fireEvent.change(screen.getByLabelText('종료 월'), { target: { value: '2026-02' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));

    await waitFor(() => {
      expect(mockedGetCategoryBreakdown).toHaveBeenCalledWith({
        start_date: '2026-01-01',
        end_date: '2026-02-28',
      });
    });

    expect(screen.getByRole('group', { name: '카테고리 비중 적용 기간' })).toHaveTextContent(
      '2026-01',
    );
    expect(screen.getByRole('group', { name: '카테고리 비중 적용 기간' })).toHaveTextContent(
      '2026-02',
    );
  });

  it('shows a validation message when the custom range is reversed', async () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: '기간 변경' }));
    fireEvent.change(screen.getByLabelText('시작 월'), { target: { value: '2026-03' } });
    fireEvent.change(screen.getByLabelText('종료 월'), { target: { value: '2026-01' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(screen.getByText('시작 월은 종료 월보다 늦을 수 없습니다.')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedGetCategoryBreakdown).not.toHaveBeenCalled();
    });
  });
});
