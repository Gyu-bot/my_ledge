import { apiFetch } from '../lib/apiClient'
import type { NetWorthHistoryResponse, InvestmentSummaryResponse, LoanSummaryResponse, AssetSnapshotTotals } from '../types/asset'

export const assetApi = {
  snapshots: () => apiFetch<{ items: AssetSnapshotTotals[] }>('/assets/snapshots'),
  netWorthHistory: () => apiFetch<NetWorthHistoryResponse>('/assets/net-worth-history'),
  investments: () => apiFetch<InvestmentSummaryResponse>('/investments/summary'),
  loans: () => apiFetch<LoanSummaryResponse>('/loans/summary'),
}
