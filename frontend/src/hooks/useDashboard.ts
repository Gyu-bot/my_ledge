import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardApiResponse } from '../api/dashboard';
import { getDashboardData } from '../api/dashboard';
import type {
  CategoryBreakdownSlice,
  DashboardData,
  RecentTransaction,
  SummaryCard,
  TrendPoint,
} from '../types/dashboard';

export const dashboardQueryKey = ['dashboard'] as const;
const MAX_CATEGORY_SLICES = 8;

type SnapshotRecord = DashboardApiResponse['asset_snapshots']['items'][number];
type TrendRecord = DashboardApiResponse['monthly_spend']['items'][number];
type CategoryRecord = DashboardApiResponse['category_breakdown']['items'][number];
type TransactionRecord = DashboardApiResponse['recent_transactions']['items'][number];

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(value)}원`;
}

function formatDelta(value: number) {
  if (value === 0) {
    return '변동 없음';
  }

  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function sortBySnapshotDate(items: SnapshotRecord[]) {
  return [...items].sort((left, right) => left.snapshot_date.localeCompare(right.snapshot_date));
}

function sortByPeriod(items: TrendRecord[]) {
  return [...items].sort((left, right) => left.period.localeCompare(right.period));
}

function sortByAmountDesc(items: CategoryRecord[]) {
  return [...items].sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount));
}

function sortByTransactionRecency(items: TransactionRecord[]) {
  return [...items].sort((left, right) => {
    const leftStamp = `${left.date}T${left.time}`;
    const rightStamp = `${right.date}T${right.time}`;
    return rightStamp.localeCompare(leftStamp);
  });
}

function buildSummaryCards(
  snapshots: SnapshotRecord[],
  trend: TrendRecord[],
  categoryBreakdown: CategoryRecord[],
): SummaryCard[] {
  const latestSnapshot = snapshots[snapshots.length - 1];
  const previousSnapshot = snapshots[snapshots.length - 2];
  const latestTrend = trend[trend.length - 1];
  const previousTrend = trend[trend.length - 2];
  const topCategory = sortByAmountDesc(categoryBreakdown)[0];

  return [
    {
      label: '순자산',
      value: latestSnapshot ? formatMoney(toNumber(latestSnapshot.net_worth)) : '데이터 없음',
      detail: latestSnapshot
        ? previousSnapshot
          ? `직전 스냅샷 대비 ${formatDelta(
              toNumber(latestSnapshot.net_worth) - toNumber(previousSnapshot.net_worth),
            )}`
          : `${latestSnapshot.snapshot_date} 기준`
        : '자산 스냅샷 없음',
    },
    {
      label: '총자산',
      value: latestSnapshot ? formatMoney(toNumber(latestSnapshot.asset_total)) : '데이터 없음',
      detail: latestSnapshot
        ? previousSnapshot
          ? `직전 스냅샷 대비 ${formatDelta(
              toNumber(latestSnapshot.asset_total) - toNumber(previousSnapshot.asset_total),
            )}`
          : `${latestSnapshot.snapshot_date} 기준`
        : '자산 스냅샷 없음',
    },
    {
      label: '총부채',
      value: latestSnapshot ? formatMoney(toNumber(latestSnapshot.liability_total)) : '데이터 없음',
      detail: latestSnapshot
        ? previousSnapshot
          ? `직전 스냅샷 대비 ${formatDelta(
              toNumber(latestSnapshot.liability_total) - toNumber(previousSnapshot.liability_total),
            )}`
          : `${latestSnapshot.snapshot_date} 기준`
        : '부채 스냅샷 없음',
    },
    {
      label: '이번 달 지출',
      value: latestTrend ? formatMoney(Math.abs(toNumber(latestTrend.amount))) : '데이터 없음',
      detail: latestTrend
        ? previousTrend
          ? `전월 대비 ${formatDelta(
              Math.abs(toNumber(latestTrend.amount)) - Math.abs(toNumber(previousTrend.amount)),
            )}`
          : `${latestTrend.period} 기준`
        : topCategory
          ? `상위 카테고리 ${topCategory.category}`
          : '지출 요약 없음',
    },
  ];
}

function buildCategoryBreakdown(items: CategoryRecord[]): CategoryBreakdownSlice[] {
  const sorted = sortByAmountDesc(items);
  const normalized = sorted.map((item) => ({
    category: item.category,
    amount: Math.abs(item.amount),
  }));
  const primarySlices = normalized.slice(0, MAX_CATEGORY_SLICES);
  const overflow = normalized.slice(MAX_CATEGORY_SLICES);
  const overflowAmount = overflow.reduce((sum, item) => sum + item.amount, 0);
  const combined = overflowAmount > 0
    ? [...primarySlices, { category: '기타', amount: overflowAmount }]
    : primarySlices;
  const total = combined.reduce((sum, item) => sum + item.amount, 0);

  return combined.map((item) => ({
    ...item,
    share: total > 0 ? (item.amount / total) * 100 : 0,
  }));
}

function buildRecentTransactions(items: TransactionRecord[]): RecentTransaction[] {
  return sortByTransactionRecency(items);
}

function buildDashboardData(response: DashboardApiResponse): DashboardData {
  const snapshots = sortBySnapshotDate(response.asset_snapshots.items);
  const monthlyTrend = sortByPeriod(response.monthly_spend.items).map<TrendPoint>((item) => ({
    period: item.period,
    amount: Math.abs(item.amount),
  }));
  const categoryBreakdown = buildCategoryBreakdown(response.category_breakdown.items);
  const recentTransactions = buildRecentTransactions(response.recent_transactions.items);

  return {
    snapshot_date: snapshots[snapshots.length - 1]?.snapshot_date ?? null,
    summary_cards: buildSummaryCards(snapshots, monthlyTrend, response.category_breakdown.items),
    monthly_spend: monthlyTrend,
    category_breakdown: categoryBreakdown,
    recent_transactions: recentTransactions,
  };
}

export interface UseDashboardResult {
  data: DashboardData | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  isFetching?: boolean;
  isLoading?: boolean;
  refetch?: UseQueryResult<DashboardData, Error>['refetch'];
}

export function useDashboard(): UseDashboardResult {
  const query = useQuery<DashboardApiResponse, Error, DashboardData>({
    queryKey: dashboardQueryKey,
    queryFn: getDashboardData,
    select: buildDashboardData,
    staleTime: 5 * 60 * 1000,
  });

  return query;
}
