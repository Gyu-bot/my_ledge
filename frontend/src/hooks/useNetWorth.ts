import { useQuery } from '@tanstack/react-query'
import { netWorthApi } from '../api/netWorth'

// 키를 'metrics'로 시작해 분류(이체 목적·조정 가능성)가 바뀌면 같이 다시 읽힌다
// (useNature.invalidateClassificationDependents).

export function useNetWorthIntervals() {
  return useQuery({
    queryKey: ['metrics', 'net-worth', 'intervals'],
    queryFn: () => netWorthApi.intervals(),
  })
}

/** pair=null 이면 최근 두 자산 스냅샷 */
export function useNetWorthReconciliation(pair: { start_date: string; end_date: string } | null, enabled = true) {
  return useQuery({
    queryKey: ['metrics', 'net-worth', 'reconciliation', pair],
    queryFn: () => netWorthApi.reconciliation(pair),
    enabled,
  })
}

export function useEmergencyFund() {
  return useQuery({
    queryKey: ['metrics', 'net-worth', 'emergency-fund'],
    queryFn: () => netWorthApi.emergencyFund(),
  })
}
