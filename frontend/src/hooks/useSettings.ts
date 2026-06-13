import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api/settings'
import type { AnalyticsSettingsPatchRequest } from '../types/settings'

export function useAnalyticsSettings() {
  return useQuery({ queryKey: ['settings', 'analytics'], queryFn: settingsApi.analytics })
}

export function usePatchAnalyticsSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AnalyticsSettingsPatchRequest) => settingsApi.patchAnalytics(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] })
      // 목표를 소비하는 화면들(홈/자산·부채/신호) 갱신
      void qc.invalidateQueries({ queryKey: ['assets', 'liquidityHealth'] })
    },
  })
}
