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

export type RecentTransaction = Pick<
  TransactionResponse,
  'id' | 'description' | 'amount' | 'effective_category_major'
>;
