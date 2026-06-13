import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assetApi } from '../api/assets'
import type {
  AssetLiquidityPatchRequest,
  LoanRepaymentMetadataPatchRequest,
  SnapshotComparisonMode,
} from '../types/asset'

export const assetKeys = {
  snapshots: () => ['assets', 'snapshots'] as const,
  netWorthHistory: () => ['assets', 'netWorthHistory'] as const,
  snapshotCompare: (mode?: SnapshotComparisonMode) => ['assets', 'snapshotCompare', mode ?? 'default'] as const,
  netWorthBreakdown: () => ['assets', 'netWorthBreakdown'] as const,
  liquidityHealth: () => ['assets', 'liquidityHealth'] as const,
  investments: () => ['assets', 'investments'] as const,
  insurance: () => ['assets', 'insurance'] as const,
  loans: () => ['assets', 'loans'] as const,
}

export function useAssetSnapshots() {
  return useQuery({ queryKey: assetKeys.snapshots(), queryFn: assetApi.snapshots })
}

export function useNetWorthHistory() {
  return useQuery({ queryKey: assetKeys.netWorthHistory(), queryFn: assetApi.netWorthHistory })
}

export function useAssetSnapshotCompare(mode?: SnapshotComparisonMode) {
  return useQuery({
    queryKey: assetKeys.snapshotCompare(mode),
    queryFn: () => assetApi.snapshotCompare(mode),
  })
}

export function useNetWorthBreakdown() {
  return useQuery({ queryKey: assetKeys.netWorthBreakdown(), queryFn: assetApi.netWorthBreakdown })
}

export function useLiquidityHealth() {
  return useQuery({ queryKey: assetKeys.liquidityHealth(), queryFn: assetApi.liquidityHealth })
}

export function useInvestmentSummary() {
  return useQuery({ queryKey: assetKeys.investments(), queryFn: assetApi.investments })
}

export function useInsuranceSummary() {
  return useQuery({ queryKey: assetKeys.insurance(), queryFn: assetApi.insurance })
}

export function useLoanSummary() {
  return useQuery({ queryKey: assetKeys.loans(), queryFn: assetApi.loans })
}

export function usePatchAssetLiquidity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AssetLiquidityPatchRequest }) =>
      assetApi.patchAssetLiquidity(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}

export function usePatchLoanRepaymentMetadata() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: LoanRepaymentMetadataPatchRequest }) =>
      assetApi.patchLoanRepaymentMetadata(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}
