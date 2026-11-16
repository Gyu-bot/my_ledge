import { apiFetch } from '../lib/apiClient'
import type { EmergencyFundResponse, NetWorthReconciliationResponse, SnapshotIntervalsResponse } from '../types/netWorth'

/** 재무상태(T061) 읽기 — 순자산 대조와 비상금 개월 수. 모든 경로에 API 키가 필요하다. */
export const netWorthApi = {
  intervals: (limit = 60) => apiFetch<SnapshotIntervalsResponse>(`/metrics/net-worth/intervals?limit=${limit}`),

  /** 두 날짜를 모두 주거나 모두 생략한다(생략하면 최근 두 자산 스냅샷). */
  reconciliation: (pair: { start_date: string; end_date: string } | null) =>
    apiFetch<NetWorthReconciliationResponse>(
      pair
        ? `/metrics/net-worth/reconciliation?${new URLSearchParams({ start_date: pair.start_date, end_date: pair.end_date }).toString()}`
        : '/metrics/net-worth/reconciliation',
    ),

  emergencyFund: () => apiFetch<EmergencyFundResponse>('/metrics/net-worth/emergency-fund'),
}
