export interface UploadResponse {
  status: string
  upload_id: number
  transactions: { total: number; new: number; skipped: number }
  snapshots: { asset_snapshots: number; insurance_contracts: number; investments: number; loans: number }
  error_message: string | null
}

export interface UploadLogResponse {
  id: number
  uploaded_at: string
  filename: string | null
  snapshot_date: string | null
  tx_total: number | null
  tx_new: number | null
  tx_skipped: number | null
  status: string | null
  error_message: string | null
}

export interface UploadLogListResponse {
  items: UploadLogResponse[]
}

export type UploadPreviewChangeType =
  | 'new'
  | 'unchanged'
  | 'source_fields_changed'
  | 'time_shifted'
  | 'possible_replacement'
  | 'missing_from_latest_export'
  | 'possible_duplicate'
  | 'ambiguous'

export type UploadPreviewFieldValue = string | number | null

export interface UploadPreviewSourceRow {
  readonly date: string
  readonly time: string
  readonly type: string
  readonly category_major: string
  readonly category_minor: string | null
  readonly description: string
  readonly amount: number
  readonly currency: string
  readonly payment_method: string | null
}

export interface UploadPreviewFieldDelta {
  readonly field: string
  readonly existing_value: UploadPreviewFieldValue
  readonly incoming_value: UploadPreviewFieldValue
}

export interface UploadPreviewChange {
  readonly change_type: UploadPreviewChangeType
  readonly review_required: boolean
  readonly auto_apply_safe: boolean
  readonly reason: string
  readonly source_row_hash: string | null
  readonly existing_transaction_id: number | null
  readonly candidate_transaction_ids: readonly number[]
  readonly existing_source: UploadPreviewSourceRow | null
  readonly incoming_source: UploadPreviewSourceRow | null
  readonly field_changes: readonly UploadPreviewFieldDelta[]
  readonly preserved_user_fields: readonly string[]
  readonly preservation_summary: string
}

export interface UploadPreviewChangeCounts {
  readonly new: number
  readonly unchanged: number
  readonly source_fields_changed: number
  readonly time_shifted: number
  readonly possible_replacement: number
  readonly missing_from_latest_export: number
  readonly possible_duplicate: number
  readonly ambiguous: number
}

export interface UploadPreviewSummary {
  readonly parsed_transaction_count: number
  readonly safe_change_count: number
  readonly review_required_count: number
  readonly change_type_counts: UploadPreviewChangeCounts
}

export interface UploadPreviewResponse {
  readonly filename: string
  readonly snapshot_date: string
  readonly summary: UploadPreviewSummary
  readonly safe_changes: readonly UploadPreviewChange[]
  readonly review_required_changes: readonly UploadPreviewChange[]
}

export interface UploadApplySelection {
  readonly change_type: UploadPreviewChangeType
  readonly source_row_hash: string
  readonly existing_transaction_id: number | null
}

export interface UploadApplyResponse {
  readonly status: string
  readonly upload_id: number
  readonly filename: string
  readonly snapshot_date: string
  readonly summary: {
    readonly parsed_transaction_count: number
    readonly selected_change_count: number
    readonly applied_change_count: number
    readonly change_type_counts: UploadPreviewChangeCounts
  }
  readonly applied_changes: readonly UploadPreviewChange[]
}

export type DataResetScope = 'transactions_only' | 'transactions_and_snapshots'

export interface DataResetResponse {
  scope: DataResetScope
  deleted: { transactions: number; asset_snapshots: number; investments: number; loans: number }
  upload_logs_retained: boolean
}
