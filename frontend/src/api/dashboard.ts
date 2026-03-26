import { apiRequest, type QueryParams } from './client';
import type { AssetSnapshotsResponse } from '../types/assets';
import type {
  CategorySummaryResponse,
  TransactionListResponse,
  TransactionSummaryResponse,
} from '../types/transactions';

export interface DashboardApiResponse {
  asset_snapshots: AssetSnapshotsResponse;
  monthly_spend: TransactionSummaryResponse;
  category_breakdown: CategorySummaryResponse;
  recent_transactions: TransactionListResponse;
}

const DASHBOARD_MONTHLY_SUMMARY_QUERY = {
  group_by: 'month',
  type: '지출',
} as const;

const DASHBOARD_CATEGORY_BREAKDOWN_QUERY = {
  level: 'major',
  type: '지출',
} as const;

const DASHBOARD_RECENT_TRANSACTIONS_QUERY = {
  page: 1,
  per_page: 8,
  include_deleted: false,
  include_merged: false,
} as const;

export function getAssetSnapshots(query?: QueryParams) {
  return apiRequest<AssetSnapshotsResponse>('/assets/snapshots', { query });
}

export function getMonthlySpendSummary(query?: QueryParams) {
  return apiRequest<TransactionSummaryResponse>('/transactions/summary', {
    query: { ...DASHBOARD_MONTHLY_SUMMARY_QUERY, ...query },
  });
}

export function getCategoryBreakdown(query?: QueryParams) {
  return apiRequest<CategorySummaryResponse>('/transactions/by-category', {
    query: { ...DASHBOARD_CATEGORY_BREAKDOWN_QUERY, ...query },
  });
}

export function getRecentTransactions(query?: QueryParams) {
  return apiRequest<TransactionListResponse>('/transactions', {
    query: { ...DASHBOARD_RECENT_TRANSACTIONS_QUERY, ...query },
  });
}

export async function getDashboardData(): Promise<DashboardApiResponse> {
  const [assetSnapshots, monthlySpend, categoryBreakdown, recentTransactions] = await Promise.all([
    getAssetSnapshots(),
    getMonthlySpendSummary(),
    getCategoryBreakdown(),
    getRecentTransactions(),
  ]);

  return {
    asset_snapshots: assetSnapshots,
    monthly_spend: monthlySpend,
    category_breakdown: categoryBreakdown,
    recent_transactions: recentTransactions,
  };
}
