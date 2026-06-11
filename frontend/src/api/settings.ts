import { apiFetch } from '../lib/apiClient'
import type { AnalyticsSettingsPatchRequest, AnalyticsSettingsResponse } from '../types/settings'

export const settingsApi = {
  analytics: () => apiFetch<AnalyticsSettingsResponse>('/settings/analytics'),
  patchAnalytics: (data: AnalyticsSettingsPatchRequest) =>
    apiFetch<AnalyticsSettingsResponse>('/settings/analytics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}
