export interface UploadResponse {
  status: string
  upload_id: number
  transactions: { total: number; new: number; skipped: number }
  snapshots: { asset_snapshots: number; investments: number; loans: number }
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

export type DataResetScope = 'transactions_only' | 'transactions_and_snapshots'

export interface DataResetResponse {
  scope: DataResetScope
  deleted: { transactions: number; asset_snapshots: number; investments: number; loans: number }
  upload_logs_retained: boolean
}
