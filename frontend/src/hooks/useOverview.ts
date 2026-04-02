import { useQuery } from '@tanstack/react-query';
import { getCategoryBreakdown, getRecentTransactions, getAssetSnapshots } from '../api/dashboard';
import {
  getIncomeStability,
  getMonthlyCashflow,
  getRecurringPayments,
  getSpendingAnomalies,
} from '../api/analytics';
import { getUploadLogs } from '../api/upload';
import { formatSavingsRateValue } from '../lib/insightMetrics';
import { ensureArray } from '../lib/collections';
import type { CategoryBreakdownSlice, RecentTransaction, SummaryCard } from '../types/dashboard';
import type { MonthlyCashflowItemResponse } from '../types/analytics';

interface OverviewSignalSummary {
  label: string;
  value: string;
  detail: string;
}

export interface OverviewData {
  snapshot_date: string | null;
  summary_cards: SummaryCard[];
  monthly_cashflow: MonthlyCashflowItemResponse[];
  signal_summaries: OverviewSignalSummary[];
  category_top5: CategoryBreakdownSlice[];
  recent_transactions: RecentTransaction[];
  recent_upload_status: string | null;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

function classifyIncomeStability(coefficient: number | null) {
  if (coefficient === null) {
    return '데이터 없음';
  }
  if (coefficient <= 0.1) {
    return '안정적';
  }
  if (coefficient <= 0.25) {
    return '보통';
  }
  return '변동 큼';
}

function buildCategoryTop5(items: Array<{ category: string; amount: number }>): CategoryBreakdownSlice[] {
  const normalized = items
    .map((item) => ({ category: item.category, amount: Math.abs(item.amount) }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);
  const total = normalized.reduce((sum, item) => sum + item.amount, 0);

  return normalized.map((item) => ({
    ...item,
    share: total > 0 ? Number(((item.amount / total) * 100).toFixed(1)) : 0,
  }));
}

function buildSummaryCards(
  snapshotDate: string | null,
  netWorth: number,
  latestCashflow: MonthlyCashflowItemResponse | undefined,
): SummaryCard[] {
  return [
    {
      label: '순자산',
      value: snapshotDate ? formatMoney(netWorth) : '데이터 없음',
      detail: snapshotDate ? `${snapshotDate} 기준` : '자산 스냅샷 없음',
    },
    {
      label: '이번 달 지출',
      value: latestCashflow ? formatMoney(latestCashflow.expense) : '데이터 없음',
      detail: latestCashflow ? `${latestCashflow.period} 누적 기준` : '현금흐름 데이터 없음',
    },
    {
      label: '이번 달 수입',
      value: latestCashflow ? formatMoney(latestCashflow.income) : '데이터 없음',
      detail: latestCashflow ? `${latestCashflow.period} 누적 기준` : '현금흐름 데이터 없음',
    },
    {
      label: '저축률',
      value: latestCashflow ? formatSavingsRateValue(latestCashflow) : '데이터 없음',
      detail: latestCashflow ? `순현금흐름 ${formatMoney(latestCashflow.net_cashflow)}` : '현금흐름 데이터 없음',
    },
  ];
}

export function useOverview() {
  return useQuery<OverviewData, Error>({
    queryKey: ['overview'],
    queryFn: async () => {
      const [
        assetSnapshots,
        categoryBreakdown,
        recentTransactions,
        monthlyCashflow,
        incomeStability,
        recurringPayments,
        spendingAnomalies,
        uploadLogs,
      ] = await Promise.all([
        getAssetSnapshots(),
        getCategoryBreakdown(),
        getRecentTransactions(),
        getMonthlyCashflow(),
        getIncomeStability(),
        getRecurringPayments(),
        getSpendingAnomalies(),
        getUploadLogs(),
      ]);

      const snapshots = ensureArray(assetSnapshots.items);
      const latestSnapshot = snapshots[snapshots.length - 1];
      const cashflowItems = ensureArray(monthlyCashflow.items).sort((left, right) => left.period.localeCompare(right.period));
      const latestCashflow = cashflowItems[cashflowItems.length - 1];
      const breakdownItems = ensureArray(categoryBreakdown.items);
      const topCategories = buildCategoryTop5(breakdownItems);
      const recentRows = ensureArray(recentTransactions.items);
      const uploadHistory = ensureArray(uploadLogs.items);
      const latestUpload = uploadHistory[0];

      return {
        snapshot_date: latestSnapshot?.snapshot_date ?? null,
        summary_cards: buildSummaryCards(
          latestSnapshot?.snapshot_date ?? null,
          latestSnapshot ? Number(latestSnapshot.net_worth) : 0,
          latestCashflow,
        ),
        monthly_cashflow: cashflowItems,
        signal_summaries: [
          {
            label: '이상 지출',
            value: `${ensureArray(spendingAnomalies.items).length}건`,
            detail: ensureArray(spendingAnomalies.items).length > 0
              ? `${ensureArray(spendingAnomalies.items).slice(0, 2).map((item) => item.category).join('와 ')}에서 탐지`
              : '최근 탐지된 이상 지출 없음',
          },
          {
            label: '반복 결제',
            value: `${ensureArray(recurringPayments.items).length}건`,
            detail: ensureArray(recurringPayments.items).length > 0
              ? '월간 정기 결제 후보'
              : '감지된 반복 결제 없음',
          },
          {
            label: '수입 안정성',
            value: classifyIncomeStability(incomeStability.coefficient_of_variation),
            detail: `변동계수 ${
              incomeStability.coefficient_of_variation === null
                ? '데이터 없음'
                : incomeStability.coefficient_of_variation.toFixed(2)
            }`,
          },
        ],
        category_top5: topCategories,
        recent_transactions: recentRows,
        recent_upload_status: latestUpload?.status ?? null,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
