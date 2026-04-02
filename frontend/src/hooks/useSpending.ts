import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { QueryParams } from '../api/client';
import { ensureArray } from '../lib/collections';
import {
  getTransactions,
  getTransactionsByCategory,
  getTransactionsByCategoryTimeline,
} from '../api/transactions';
import type { TransactionResponse } from '../types/transactions';
import type { CategoryTimelinePoint } from '../components/charts/CategoryTimelineAreaChart';
import type { TransactionFilterValues } from '../components/filters/TransactionFilterBar';
import type { TimelineRangeFilterValues } from '../components/filters/TimelineRangeSlider';

export interface SpendingBarDatum {
  label: string;
  amount: number;
}

export interface SpendingBreakdownDatum extends SpendingBarDatum {
  share: number;
}

export interface MerchantTreemapDatum extends Record<string, string | number> {
  name: string;
  amount: number;
}

export interface SpendingPageState {
  timeline_filters: TimelineRangeFilterValues;
  detail_filters: TransactionFilterValues;
  subcategory_major_filter: string;
  include_income: boolean;
  daily_calendar_month: string;
  transactions_page: number;
  transactions_per_page: number;
  transactions_accordion_open: boolean;
  updateTimelineFilters: (next: TimelineRangeFilterValues) => void;
  resetTimelineFilters: () => void;
  updateDetailFilters: (next: TransactionFilterValues) => void;
  resetDetailFilters: () => void;
  updateSubcategoryMajorFilter: (next: string) => void;
  updateIncludeIncome: (next: boolean) => void;
  updateDailyCalendarMonth: (next: string) => void;
  updateTransactionsPage: (next: number) => void;
  updateTransactionsAccordionOpen: (next: boolean) => void;
}

export interface SpendingTimelineData {
  available_months: string[];
  category_timeline: {
    categories: string[];
    points: CategoryTimelinePoint[];
  };
}

export interface SpendingPeriodData {
  category_breakdown: SpendingBreakdownDatum[];
  subcategory_breakdown: SpendingBreakdownDatum[];
  payment_methods: SpendingBreakdownDatum[];
  merchant_breakdown: MerchantTreemapDatum[];
  filter_options: {
    categories: string[];
    subcategory_major_categories: string[];
    payment_methods: string[];
  };
}

export interface SpendingTransactionsData {
  transactions: TransactionResponse[];
  transactions_total: number;
  transactions_page: number;
  transactions_per_page: number;
}

export interface SpendingDailySpendItem {
  date: string;
  amount: number;
}

export interface SpendingDailyCalendarData {
  available_months: string[];
  selected_month: string;
  items: SpendingDailySpendItem[];
  total_amount: number;
  max_amount: number;
}

function shouldIncludeTransaction(type: string, includeIncome: boolean) {
  return type === '지출' || (includeIncome && type === '수입');
}

const defaultTimelineFilters: TimelineRangeFilterValues = {
  start_month: '',
  end_month: '',
};

const MAX_TIMELINE_CATEGORIES = 5;
const MAX_BREAKDOWN_ITEMS = 8;
const MAX_TREEMAP_ITEMS = 12;

export function getSystemMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');

  return `${year}-${month}`;
}

export function createDefaultDetailFilters(month = getSystemMonth()): TransactionFilterValues {
  return {
    start_month: month,
    end_month: month,
    category_major: '',
    payment_method: '',
    search: '',
  };
}

export function resolvePreferredMonth(availableMonths: string[], targetMonth: string) {
  if (availableMonths.length === 0) {
    return '';
  }

  if (availableMonths.includes(targetMonth)) {
    return targetMonth;
  }

  const previousMonths = availableMonths.filter((month) => month < targetMonth);
  if (previousMonths.length > 0) {
    return previousMonths[previousMonths.length - 1];
  }

  return availableMonths[0];
}

function toMonthRange(filters: TimelineRangeFilterValues) {
  const query: Record<string, string> = {};

  if (filters.start_month) {
    query.start_date = `${filters.start_month}-01`;
  }

  if (filters.end_month) {
    const [year, month] = filters.end_month.split('-').map(Number);
    const lastDate = new Date(year, month, 0).getDate();
    query.end_date = `${filters.end_month}-${`${lastDate}`.padStart(2, '0')}`;
  }

  return query;
}

function aggregateLabelAmounts(
  items: Array<{ amount: number; category?: string; payment_method?: string | null }>,
) {
  const totals = new Map<string, number>();

  for (const item of items) {
    const label = item.category ?? item.payment_method ?? '미지정';
    totals.set(label, (totals.get(label) ?? 0) + Math.abs(item.amount));
  }

  return Array.from(totals.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((left, right) => right.amount - left.amount);
}

function buildBreakdownData(
  items: Array<{ amount: number; category?: string; payment_method?: string | null }>,
): SpendingBreakdownDatum[] {
  const aggregated = aggregateLabelAmounts(items);
  const total = aggregated.reduce((sum, item) => sum + item.amount, 0);

  return aggregated.slice(0, MAX_BREAKDOWN_ITEMS).map((item) => ({
    ...item,
    share: total === 0 ? 0 : Number(((item.amount / total) * 100).toFixed(1)),
  }));
}

function buildMerchantTreemapData(items: TransactionResponse[]): MerchantTreemapDatum[] {
  const totals = new Map<string, number>();

  for (const item of items) {
    const key = item.merchant?.trim() || item.description.trim() || '미지정';
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(item.amount));
  }

  const sorted = Array.from(totals.entries()).sort((left, right) => right[1] - left[1]);
  const topItems = sorted.slice(0, MAX_TREEMAP_ITEMS).map(([name, amount]) => ({ name, amount }));
  const overflowAmount = sorted.slice(MAX_TREEMAP_ITEMS).reduce((sum, [, amount]) => sum + amount, 0);

  if (overflowAmount > 0) {
    topItems.push({ name: '기타', amount: overflowAmount });
  }

  return topItems;
}

function summarizePaymentMethods(items: TransactionResponse[]) {
  const totals = new Map<string, number>();

  for (const item of items) {
    const key = item.payment_method ?? '미지정';
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(item.amount));
  }

  return buildBreakdownData(
    Array.from(totals.entries()).map(([payment_method, amount]) => ({
      payment_method,
      amount,
    })),
  );
}

function formatSubcategoryLabel(
  major: string | null,
  minor: string | null,
  includeMajor: boolean,
) {
  const normalizedMajor = major ?? '미분류';
  const normalizedMinor = minor ?? '미분류';

  if (!includeMajor) {
    return normalizedMinor;
  }

  return `${normalizedMajor} / ${normalizedMinor}`;
}

function buildCategoryTimeline(
  items: Array<{ period: string; category: string; amount: number }>,
): SpendingTimelineData['category_timeline'] {
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

function filterTimelineByRange(
  timeline: SpendingTimelineData['category_timeline'],
  filters: TimelineRangeFilterValues,
): SpendingTimelineData['category_timeline'] {
  if (!filters.start_month && !filters.end_month) {
    return timeline;
  }

  return {
    categories: timeline.categories,
    points: timeline.points.filter((point) => {
      if (filters.start_month && point.period < filters.start_month) {
        return false;
      }
      if (filters.end_month && point.period > filters.end_month) {
        return false;
      }
      return true;
    }),
  };
}

async function fetchAllTransactions(query: QueryParams): Promise<TransactionResponse[]> {
  const items: TransactionResponse[] = [];
  const perPage = 200;
  let page = 1;
  let total = 0;

  while (page === 1 || items.length < total) {
    const response = await getTransactions({
      ...query,
      page,
      per_page: perPage,
      include_deleted: false,
      include_merged: false,
    });
    const pageItems = ensureArray(response.items);

    items.push(...pageItems);
    total = typeof response.total === 'number' ? response.total : items.length;

    if (pageItems.length === 0) {
      break;
    }

    page += 1;
  }

  return items;
}

export function useSpendingPageState(): SpendingPageState {
  const [timelineFilters, setTimelineFilters] = useState<TimelineRangeFilterValues>(
    defaultTimelineFilters,
  );
  const [detailFilters, setDetailFilters] = useState<TransactionFilterValues>(() =>
    createDefaultDetailFilters(),
  );
  const [subcategoryMajorFilter, setSubcategoryMajorFilter] = useState('');
  const [includeIncome, setIncludeIncome] = useState(false);
  const [dailyCalendarMonth, setDailyCalendarMonth] = useState(() => getSystemMonth());
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsAccordionOpen, setTransactionsAccordionOpen] = useState(false);
  const transactionsPerPage = 20;

  return {
    timeline_filters: timelineFilters,
    detail_filters: detailFilters,
    subcategory_major_filter: subcategoryMajorFilter,
    include_income: includeIncome,
    daily_calendar_month: dailyCalendarMonth,
    transactions_page: transactionsPage,
    transactions_per_page: transactionsPerPage,
    transactions_accordion_open: transactionsAccordionOpen,
    updateTimelineFilters: setTimelineFilters,
    resetTimelineFilters: () => setTimelineFilters(defaultTimelineFilters),
    updateDetailFilters: (next) => {
      setDetailFilters(next);
      setTransactionsPage(1);
    },
    resetDetailFilters: () => {
      const resetMonth = getSystemMonth();

      setDetailFilters(createDefaultDetailFilters(resetMonth));
      setSubcategoryMajorFilter('');
      setDailyCalendarMonth(resetMonth);
      setTransactionsPage(1);
    },
    updateSubcategoryMajorFilter: setSubcategoryMajorFilter,
    updateIncludeIncome: setIncludeIncome,
    updateDailyCalendarMonth: setDailyCalendarMonth,
    updateTransactionsPage: setTransactionsPage,
    updateTransactionsAccordionOpen: setTransactionsAccordionOpen,
  };
}

export function useSpendingTimelineData(filters: TimelineRangeFilterValues) {
  return useQuery({
    queryKey: ['spending-timeline', filters.start_month, filters.end_month],
    queryFn: async (): Promise<SpendingTimelineData> => {
      const fullCategoryTimeline = await getTransactionsByCategoryTimeline({
        level: 'major',
        type: '지출',
      });

      const fullTimeline = buildCategoryTimeline(ensureArray(fullCategoryTimeline.items));

      return {
        available_months: fullTimeline.points.map((point) => point.period),
        category_timeline: filterTimelineByRange(fullTimeline, filters),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSpendingPeriodData(
  filters: TimelineRangeFilterValues,
  subcategoryMajorFilter: string,
) {
  return useQuery({
    queryKey: ['spending-period', filters.start_month, filters.end_month, subcategoryMajorFilter],
    queryFn: async (): Promise<SpendingPeriodData> => {
      const periodQuery = toMonthRange(filters);
      const [majorCategoryBreakdown, periodTransactions] = await Promise.all([
        getTransactionsByCategory({
          ...periodQuery,
          level: 'major',
          type: '지출',
        }),
        fetchAllTransactions(periodQuery),
      ]);
      const categoryItems = ensureArray(majorCategoryBreakdown.items);

      const periodSpendingTransactions = periodTransactions.filter((item) => item.type === '지출');
      const filteredSubcategoryTransactions = periodSpendingTransactions.filter((item) =>
        subcategoryMajorFilter
          ? item.effective_category_major === subcategoryMajorFilter
          : true,
      );
      const categories = Array.from(
        new Set(categoryItems.map((item) => item.category)),
      ).sort();
      const paymentMethodOptions = Array.from(
        new Set(
          periodSpendingTransactions
            .map((item) => item.payment_method)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort();

      return {
        category_breakdown: buildBreakdownData(
          categoryItems.map((item) => ({
            category: item.category,
            amount: item.amount,
          })),
        ),
        subcategory_breakdown: buildBreakdownData(
          filteredSubcategoryTransactions.map((item) => ({
            category: formatSubcategoryLabel(
              item.effective_category_major,
              item.effective_category_minor,
              !subcategoryMajorFilter,
            ),
            amount: item.amount,
          })),
        ),
        payment_methods: summarizePaymentMethods(periodSpendingTransactions),
        merchant_breakdown: buildMerchantTreemapData(periodSpendingTransactions),
        filter_options: {
          categories,
          subcategory_major_categories: categories,
          payment_methods: paymentMethodOptions,
        },
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSpendingTransactionsData(
  filters: TransactionFilterValues,
  includeIncome: boolean,
  page: number,
  perPage: number,
) {
  return useQuery({
    queryKey: [
      'spending-transactions',
      filters.start_month,
      filters.end_month,
      filters.category_major,
      filters.payment_method,
      filters.search,
      includeIncome,
      page,
      perPage,
    ],
    queryFn: async (): Promise<SpendingTransactionsData> => {
      const allTransactions = await fetchAllTransactions({
        ...toMonthRange(filters),
        category_major: filters.category_major || undefined,
        payment_method: filters.payment_method || undefined,
        search: filters.search || undefined,
      });
      const spendingTransactions = allTransactions.filter((item) =>
        shouldIncludeTransaction(item.type, includeIncome),
      );
      const total = spendingTransactions.length;
      const boundedPage = total === 0 ? 1 : Math.min(page, Math.ceil(total / perPage));
      const startIndex = (boundedPage - 1) * perPage;

      return {
        transactions: spendingTransactions.slice(startIndex, startIndex + perPage),
        transactions_total: total,
        transactions_page: boundedPage,
        transactions_per_page: perPage,
      };
    },
    placeholderData: (previousData) => previousData,
    staleTime: 60 * 1000,
  });
}

export function useSpendingDailyCalendarData(
  filters: TimelineRangeFilterValues,
  includeIncome: boolean,
  selectedMonth: string,
) {
  return useQuery({
    queryKey: [
      'spending-daily-calendar',
      filters.start_month,
      filters.end_month,
      includeIncome,
      selectedMonth,
    ],
    queryFn: async (): Promise<SpendingDailyCalendarData> => {
      const periodTransactions = await fetchAllTransactions(toMonthRange(filters));
      const spendingTransactions = periodTransactions.filter((item) =>
        shouldIncludeTransaction(item.type, includeIncome),
      );
      const availableMonths = Array.from(
        new Set(spendingTransactions.map((item) => item.date.slice(0, 7))),
      ).sort();
      const resolvedMonth =
        selectedMonth && availableMonths.includes(selectedMonth)
          ? selectedMonth
          : availableMonths[availableMonths.length - 1] || '';

      const totals = new Map<string, number>();
      for (const item of spendingTransactions) {
        if (!resolvedMonth || !item.date.startsWith(resolvedMonth)) {
          continue;
        }

        totals.set(item.date, (totals.get(item.date) ?? 0) + item.amount);
      }

      const items = Array.from(totals.entries())
        .map(([date, amount]) => ({ date, amount }))
        .sort((left, right) => left.date.localeCompare(right.date));
      const amounts = items.map((item) => Math.abs(item.amount));

      return {
        available_months: availableMonths,
        selected_month: resolvedMonth,
        items,
        total_amount: items.reduce((sum, item) => sum + item.amount, 0),
        max_amount: amounts.length > 0 ? Math.max(...amounts) : 0,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
