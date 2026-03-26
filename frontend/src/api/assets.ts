import { apiRequest } from './client';
import type {
  AssetSnapshotsResponse,
  InvestmentSummaryResponse,
  LoanSummaryResponse,
  NetWorthHistoryResponse,
} from '../types/assets';

export interface AssetsApiResponse {
  asset_snapshots: AssetSnapshotsResponse;
  net_worth_history: NetWorthHistoryResponse;
  investments: InvestmentSummaryResponse;
  loans: LoanSummaryResponse;
}

export function getAssetSnapshots() {
  return apiRequest<AssetSnapshotsResponse>('/assets/snapshots');
}

export function getNetWorthHistory() {
  return apiRequest<NetWorthHistoryResponse>('/assets/net-worth-history');
}

export function getInvestmentSummary() {
  return apiRequest<InvestmentSummaryResponse>('/investments/summary');
}

export function getLoanSummary() {
  return apiRequest<LoanSummaryResponse>('/loans/summary');
}

export async function getAssetsData(): Promise<AssetsApiResponse> {
  const [assetSnapshots, netWorthHistory, investments, loans] = await Promise.all([
    getAssetSnapshots(),
    getNetWorthHistory(),
    getInvestmentSummary(),
    getLoanSummary(),
  ]);

  return {
    asset_snapshots: assetSnapshots,
    net_worth_history: netWorthHistory,
    investments,
    loans,
  };
}
