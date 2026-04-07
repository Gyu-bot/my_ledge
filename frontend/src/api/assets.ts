import { apiFetch } from '../lib/apiClient'
import type {
  NetWorthHistoryResponse,
  InvestmentSummaryResponse,
  LoanSummaryResponse,
  AssetSnapshotTotals,
  AssetSnapshotComparisonResponse,
} from '../types/asset'

export const assetApi = {
  snapshots: () => apiFetch<{ items: AssetSnapshotTotals[] }>('/assets/snapshots'),
  netWorthHistory: () => apiFetch<NetWorthHistoryResponse>('/assets/net-worth-history'),
  snapshotCompare: () => apiFetch<AssetSnapshotComparisonResponse>('/assets/snapshot-compare'),
  investments: () => apiFetch<InvestmentSummaryResponse>('/investments/summary'),
  loans: () => apiFetch<LoanSummaryResponse>('/loans/summary'),
}
