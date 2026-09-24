import { apiFetch } from '../lib/apiClient'
import type { SelectedInvestments, SourcePolicy, SourcePolicyApply, SourcePolicyFields, SourcePolicyPreview } from '../types/sourcePolicy'

export const sourcePolicyApi = {
  get: () => apiFetch<SourcePolicy>('/assets/source-policy'),
  selected: (asOfDate?: string) => apiFetch<SelectedInvestments>(`/investments/selected${asOfDate ? `?as_of_date=${encodeURIComponent(asOfDate)}` : ''}`),
  preview: (policy: SourcePolicyFields) => apiFetch<SourcePolicyPreview>('/assets/source-policy/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy }),
  }),
  apply: (data: SourcePolicyApply) => apiFetch<SourcePolicy>('/assets/source-policy', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
}
