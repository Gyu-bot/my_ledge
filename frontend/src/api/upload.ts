import { apiFetch } from '../lib/apiClient'
import type { UploadResponse, UploadLogListResponse, DataResetScope, DataResetResponse } from '../types/upload'

export const uploadApi = {
  upload: (file: File, snapshotDate: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('snapshot_date', snapshotDate)
    return apiFetch<UploadResponse>('/upload', { method: 'POST', body: form })
  },

  logs: (limit = 10) =>
    apiFetch<UploadLogListResponse>(`/upload/logs?limit=${limit}`),

  reset: (scope: DataResetScope) =>
    apiFetch<DataResetResponse>('/data/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope }),
    }),
}
