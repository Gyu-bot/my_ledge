import { apiFetch } from '../lib/apiClient'
import type {
  NetWorthHistoryResponse,
  InvestmentSummaryResponse,
  LoanSummaryResponse,
  AssetSnapshotsResponse,
  AssetSnapshotComparisonResponse,
  NetWorthBreakdownResponse,
  AssetLiabilityHealthResponse,
  AssetLiquidityPatchRequest,
  AssetSnapshotItemResponse,
  LoanRepaymentMetadataPatchRequest,
  LoanRepaymentMetadataResponse,
} from '../types/asset'

export const assetApi = {
  snapshots: () => apiFetch<AssetSnapshotsResponse>('/assets/snapshots'),
  netWorthHistory: () => apiFetch<NetWorthHistoryResponse>('/assets/net-worth-history'),
  snapshotCompare: () => apiFetch<AssetSnapshotComparisonResponse>('/assets/snapshot-compare'),
  netWorthBreakdown: () => apiFetch<NetWorthBreakdownResponse>('/analytics/net-worth-breakdown'),
  liquidityHealth: () => apiFetch<AssetLiabilityHealthResponse>('/analytics/liquidity-health'),
  investments: () => apiFetch<InvestmentSummaryResponse>('/investments/summary'),
  loans: () => apiFetch<LoanSummaryResponse>('/loans/summary'),
  patchAssetLiquidity: (id: number, data: AssetLiquidityPatchRequest) =>
    apiFetch<AssetSnapshotItemResponse>(`/assets/snapshots/${id}/liquidity`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  patchLoanRepaymentMetadata: (id: number, data: LoanRepaymentMetadataPatchRequest) =>
    apiFetch<LoanRepaymentMetadataResponse>(`/loans/${id}/repayment-metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}
