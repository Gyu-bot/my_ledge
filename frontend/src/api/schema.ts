import { apiFetch } from '../lib/apiClient'
import type { SchemaDocumentResponse } from '../types/schema'

export const schemaApi = {
  getSchema: () => apiFetch<SchemaDocumentResponse>('/schema'),
}
