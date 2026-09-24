export type InvestmentSource = 'banksalad_snapshot' | 'toss_securities_api'

export interface SourcePolicyFields {
  global_source: 'banksalad_snapshot'
  investment_source: InvestmentSource
  stale_after_days: number
  account_overrides: { account_key: string; source: InvestmentSource }[]
}

export interface SourcePolicy extends SourcePolicyFields {
  revision: number
}

export interface SourceAccount {
  account_key: string
  broker: string | null
  configured_source: InvestmentSource
  effective_source: InvestmentSource | null
  selected_run_id: number | null
  account_scope?: 'broker_group'
  configured_source_basis?: string
  observed_at?: string | null
  last_success_at?: string | null
  last_attempt_at?: string | null
  last_attempt_status?: string | null
  valuation_precision?: 'date' | 'timestamp' | 'observation_proxy'
  valuation_at: string | null
  ingested_at: string | null
  is_stale: boolean
  fallback_reason: string | null
  conflicts: string[]
  holdings_count: number
  market_value: string | null
}

export interface SourceCoverage {
  raw: number
  selected: number
  excluded: number
  confirmed: number
  hidden: number
  conflicted: number
  stale: number
}

export interface SelectedInvestments {
  as_of_date: string
  banksalad_snapshot_date: string | null
  investment_total: string | null
  investment_total_complete: boolean
  confirmed_net_worth: string | null
  estimated_net_worth: string | null
  mixed_dates: boolean
  warnings: string[]
  accounts: SourceAccount[]
  coverage: SourceCoverage
  items: {
    account_key: string
    instrument_key: string
    product_name: string
    market_value: string | null
    currency: string
    source: InvestmentSource
  }[]
}

export interface SourcePolicyPreview {
  policy: SourcePolicyFields
  current: SelectedInvestments
  proposed: SelectedInvestments
  net_worth_delta: string | null
  preview_token: string
}

export interface SourcePolicyApply {
  policy: SourcePolicyFields
  preview_token: string
  confirmed: true
}
