import { apiFetch } from '../lib/apiClient'
import type {
  NetWorthHistoryResponse,
  InvestmentSummaryResponse,
  LoanSummaryResponse,
  AssetSnapshotTotals,
  AssetSnapshotComparisonResponse,
  NetWorthBreakdownResponse,
  AssetLiabilityHealthResponse,
} from '../types/asset'

export const assetApi = {
  snapshots: () => apiFetch<{ items: AssetSnapshotTotals[] }>('/assets/snapshots'),
  netWorthHistory: () => apiFetch<NetWorthHistoryResponse>('/assets/net-worth-history'),
  snapshotCompare: () => apiFetch<AssetSnapshotComparisonResponse>('/assets/snapshot-compare'),
  netWorthBreakdown: () => apiFetch<NetWorthBreakdownResponse>('/analytics/net-worth-breakdown'),
  liquidityHealth: () => apiFetch<AssetLiabilityHealthResponse>('/analytics/liquidity-health'),
  investments: () => apiFetch<InvestmentSummaryResponse>('/investments/summary'),
  loans: () => apiFetch<LoanSummaryResponse>('/loans/summary'),
}
