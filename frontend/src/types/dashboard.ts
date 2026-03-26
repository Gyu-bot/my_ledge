import type { AssetSnapshotTotalsResponse } from './assets';
import type { TransactionResponse } from './transactions';

export interface SummaryCard {
  label: string;
  value: string;
  detail: string;
}

export interface TrendPoint {
  period: string;
  amount: number;
}

export interface CategoryBreakdownSlice {
  category: string;
  amount: number;
  share: number;
}

export type RecentTransaction = TransactionResponse;

export interface DashboardData {
  snapshot_date: AssetSnapshotTotalsResponse['snapshot_date'] | null;
  summary_cards: SummaryCard[];
  monthly_spend: TrendPoint[];
  category_breakdown: CategoryBreakdownSlice[];
  recent_transactions: RecentTransaction[];
}
