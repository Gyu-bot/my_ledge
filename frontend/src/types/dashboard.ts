export interface SummaryCard {
  label: string;
  value: string;
  detail: string;
}

export interface TrendPoint {
  period: string;
  amount: number;
}

export interface RecentTransaction {
  id: number;
  description: string;
  amount: number;
  effectiveCategoryMajor: string;
}
