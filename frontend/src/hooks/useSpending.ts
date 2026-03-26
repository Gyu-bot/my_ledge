import { useMemo, useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  getTransactions,
  getTransactionsByCategory,
  getTransactionsByCategoryTimeline,
} from '../api/transactions';
import type { TransactionResponse } from '../types/transactions';
import type { CategoryTimelinePoint } from '../components/charts/CategoryTimelineAreaChart';
import type { TransactionFilterValues } from '../components/filters/TransactionFilterBar';

export interface SpendingBarDatum {
  label: string;
  amount: number;
}

export interface SpendingData {
  filters: TransactionFilterValues;
  category_timeline: {
    categories: string[];
    points: CategoryTimelinePoint[];
  };
  category_breakdown: SpendingBarDatum[];
  payment_methods: SpendingBarDatum[];
  transactions: TransactionResponse[];
  filter_options: {
    categories: string[];
    payment_methods: string[];
  };
}

const defaultFilters: TransactionFilterValues = {
  start_month: '',
  end_month: '',
  category_major: '',
  payment_method: '',
  search: '',
};
const MAX_TIMELINE_CATEGORIES = 5;

function toMonthRange(startMonth: string, endMonth: string) {
  const query: Record<string, string> = {};

  if (startMonth) {
    query.start_date = `${startMonth}-01`;
  }

  if (endMonth) {
    const [year, month] = endMonth.split('-').map(Number);
    const lastDate = new Date(year, month, 0).getDate();
    query.end_date = `${endMonth}-${`${lastDate}`.padStart(2, '0')}`;
  }

  return query;
}

function normalizeBarData(items: Array<{ amount: number; category?: string; payment_method?: string | null }>) {
  return items
    .map((item) => ({
      label: item.category ?? item.payment_method ?? '미지정',
      amount: Math.abs(item.amount),
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 8);
}

function summarizePaymentMethods(items: TransactionResponse[]) {
  const totals = new Map<string, number>();

  for (const item of items) {
    const key = item.payment_method ?? '미지정';
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(item.amount));
  }

  return normalizeBarData(
    Array.from(totals.entries()).map(([payment_method, amount]) => ({
      payment_method,
      amount,
    })),
  );
}

function buildCategoryTimeline(
  items: Array<{ period: string; category: string; amount: number }>,
): SpendingData['category_timeline'] {
  const totals = new Map<string, number>();
  const periods = Array.from(new Set(items.map((item) => item.period))).sort();

  for (const item of items) {
    totals.set(item.category, (totals.get(item.category) ?? 0) + Math.abs(item.amount));
  }

  const topCategories = Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_TIMELINE_CATEGORIES)
    .map(([category]) => category);

  const points = periods.map<CategoryTimelinePoint>((period) => {
    const values = Object.fromEntries(topCategories.map((category) => [category, 0]));
    let overflow = 0;

    for (const item of items) {
      if (item.period !== period) {
        continue;
      }

      const normalizedAmount = Math.abs(item.amount);
      if (topCategories.includes(item.category)) {
        values[item.category] = (values[item.category] ?? 0) + normalizedAmount;
      } else {
        overflow += normalizedAmount;
      }
    }

    if (overflow > 0) {
      values['기타'] = overflow;
    }

    return {
      period,
      values,
    };
  });

  const categories = points.reduce<string[]>((accumulator, point) => {
    for (const category of Object.keys(point.values)) {
      if (!accumulator.includes(category)) {
        accumulator.push(category);
      }
    }
    return accumulator;
  }, []);

  return {
    categories,
    points,
  };
}

export interface UseSpendingResult {
  data: SpendingData | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  updateFilters: (next: TransactionFilterValues) => void;
  resetFilters: () => void;
  isFetching?: boolean;
  refetch?: UseQueryResult<SpendingData, Error>['refetch'];
}

export function useSpending(): UseSpendingResult {
  const [filters, setFilters] = useState<TransactionFilterValues>(defaultFilters);

  const query = useQuery({
    queryKey: ['spending-page', filters],
    queryFn: async (): Promise<SpendingData> => {
      const dateRange = toMonthRange(filters.start_month, filters.end_month);

      const [categoryBreakdown, categoryTimeline, transactionList] = await Promise.all([
        getTransactionsByCategory({
          ...dateRange,
          level: 'major',
          type: '지출',
        }),
        getTransactionsByCategoryTimeline({
          ...dateRange,
          level: 'major',
          type: '지출',
        }),
        getTransactions({
          ...dateRange,
          category_major: filters.category_major || undefined,
          payment_method: filters.payment_method || undefined,
          search: filters.search || undefined,
          page: 1,
          per_page: 50,
          include_deleted: false,
          include_merged: false,
        }),
      ]);

      const visibleTransactions = transactionList.items.filter((item) => item.type === '지출');
      const categories = Array.from(new Set(categoryBreakdown.items.map((item) => item.category))).sort();
      const paymentMethodOptions = Array.from(
        new Set(
          transactionList.items
            .map((item) => item.payment_method)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort();

      return {
        filters,
        category_timeline: buildCategoryTimeline(categoryTimeline.items),
        category_breakdown: normalizeBarData(
          categoryBreakdown.items.map((item) => ({ category: item.category, amount: item.amount })),
        ),
        payment_methods: summarizePaymentMethods(visibleTransactions),
        transactions: visibleTransactions,
        filter_options: {
          categories,
          payment_methods: paymentMethodOptions,
        },
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const result = useMemo<UseSpendingResult>(
    () => ({
      ...query,
      updateFilters: (next) => setFilters(next),
      resetFilters: () => setFilters(defaultFilters),
    }),
    [query],
  );

  return result;
}
