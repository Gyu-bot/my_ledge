import { apiFetch } from '../lib/apiClient'
import type {
  DataResetResponse,
  DataResetScope,
  UploadApplyResponse,
  UploadApplySelection,
  UploadLogListResponse,
  UploadPreviewResponse,
  UploadResponse,
} from '../types/upload'

export const uploadApi = {
  upload: (file: File, snapshotDate: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('snapshot_date', snapshotDate)
    return apiFetch<UploadResponse>('/upload', { method: 'POST', body: form })
  },

  preview: (file: File, snapshotDate: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('snapshot_date', snapshotDate)
    return apiFetch<UploadPreviewResponse>('/upload/preview', { method: 'POST', body: form })
  },

  apply: (file: File, snapshotDate: string, selections: readonly UploadApplySelection[]) => {
    const form = new FormData()
    form.append('file', file)
    form.append('snapshot_date', snapshotDate)
    form.append('apply_request', JSON.stringify({ confirmation: true, selections }))
    return apiFetch<UploadApplyResponse>('/upload/apply', { method: 'POST', body: form })
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
