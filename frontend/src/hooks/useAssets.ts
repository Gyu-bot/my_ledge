import { useQuery } from '@tanstack/react-query'
import { assetApi } from '../api/assets'

export function useAssetSnapshots() {
  return useQuery({ queryKey: ['assets', 'snapshots'], queryFn: assetApi.snapshots })
}

export function useNetWorthHistory() {
  return useQuery({ queryKey: ['assets', 'netWorthHistory'], queryFn: assetApi.netWorthHistory })
}

export function useInvestmentSummary() {
  return useQuery({ queryKey: ['assets', 'investments'], queryFn: assetApi.investments })
}

export function useLoanSummary() {
  return useQuery({ queryKey: ['assets', 'loans'], queryFn: assetApi.loans })
}
