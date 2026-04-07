import { useQuery } from '@tanstack/react-query'
import { assetApi } from '../api/assets'

export const assetKeys = {
  snapshots: () => ['assets', 'snapshots'] as const,
  netWorthHistory: () => ['assets', 'netWorthHistory'] as const,
  investments: () => ['assets', 'investments'] as const,
  loans: () => ['assets', 'loans'] as const,
}

export function useAssetSnapshots() {
  return useQuery({ queryKey: assetKeys.snapshots(), queryFn: assetApi.snapshots })
}

export function useNetWorthHistory() {
  return useQuery({ queryKey: assetKeys.netWorthHistory(), queryFn: assetApi.netWorthHistory })
}

export function useInvestmentSummary() {
  return useQuery({ queryKey: assetKeys.investments(), queryFn: assetApi.investments })
}

export function useLoanSummary() {
  return useQuery({ queryKey: assetKeys.loans(), queryFn: assetApi.loans })
}
