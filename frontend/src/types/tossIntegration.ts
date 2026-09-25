export type TossSyncStatus = 'success_complete' | 'success_partial' | 'failed' | 'rejected'

export interface TossIntegrationStatus {
  configured: boolean
  last_attempt: {
    run_id: number
    status: TossSyncStatus
    observed_at: string | null
    ingested_at: string
    error_code: string | null
  } | null
  mapping_connected: boolean
  cooldown_seconds: number
}

export interface TossSyncRequest {
  confirm_single_account_mapping: boolean
}

export interface TossSyncResult {
  run_id: number
  status: TossSyncStatus
  holdings_count: number
  mapping_connected: boolean
  error_code: string | null
  observed_at: string | null
}
