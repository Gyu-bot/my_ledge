import type { MonthlyProjection } from './incomeProjection'
// /api/v1/read/commitments, /api/v1/read/data-status (T060) — 화면이 쓰는 부분만.
// backend/app/schemas/read_surface.py

import type { ExcludedCurrencyItem, MonthStatus, ReadStatusReason, SnapshotAsOf } from './metrics'

export type ReadStatus = 'ok' | 'classification_incomplete' | 'no_transactions' | 'not_imported' | 'query_failed'

export interface ReadAsOf {
  transaction_as_of: string | null
  first_transaction_date: string | null
  last_closed_period: string | null
  in_progress_period: string | null
  snapshot_as_of: SnapshotAsOf
}

export interface ReadPeriodState {
  period: string
  coverage: 'imported' | 'not_imported'
  coverage_label: string
  data_coverage: 'full' | 'partial' | 'no_transactions_observed' | 'outside_data'
  data_coverage_label: string
  data_coverage_reasons: Array<'first_month_starts_mid_month' | 'data_ends_before_month_end'>
  month_status: MonthStatus | null
  status: ReadStatus
  status_label: string
  transaction_count: number
  total_outflow: number
  adjustability_undecided_total: number
  adjustability_undecided_share: number | null
}

interface ReadEnvelope {
  surface: string
  surface_label: string
  status: ReadStatus
  status_label: string
  status_reasons: ReadStatusReason[]
  as_of: ReadAsOf
  basis: { definition: string; scope: string; rules: Record<string, string>; assumptions: string[] }
}

export type ObservationState =
  | 'observed'
  | 'expected_not_observed'
  | 'unlinked_transaction_present'
  | 'not_expected'
  | 'not_determinable'

export interface CommitmentObservation {
  period: string
  state: ObservationState
  state_label: string
  reason: string
  reason_label: string
  observed_amount: number
  observed_transaction_count: number
  transaction_ids: number[]
}

export type CommitmentItemKind = 'loan' | 'installment' | 'recurring'

export interface CommitmentItem {
  attributes_confirmed_at: string | null
  needs_attribute_confirmation: boolean
  commitment_key: string
  kind: CommitmentItemKind
  kind_label: string
  source_id: number | null
  name: string
  lifecycle: 'active' | 'ended' | 'unknown'
  lifecycle_label: string
  lifecycle_detail: string | null
  cycle: 'monthly' | 'yearly' | 'n_times' | null
  cycle_label: string
  monthly_burden: number | null
  monthly_burden_basis: 'recorded_monthly_payment' | 'plan_monthly_amount' | 'last_observed_closed_month' | 'not_available'
  monthly_burden_basis_label: string
  monthly_burden_source: string | null
  start_date: string | null
  end_date: string | null
  total_count: number | null
  remaining_count: number | null
  linked_count: number | null
  adjustability: 'protected' | 'adjustable' | 'undecided'
  adjustability_label: string
  adjustability_basis: string
  last_observed_period: string | null
  last_observed_amount: number | null
  observation: CommitmentObservation
}

export interface ReadCommitmentsResponse extends ReadEnvelope {
  data: {
    period: string | null
    period_month_status: MonthStatus | null
    totals: Record<string, number>
    counts_by_state: Record<string, number>
    pending_confirmation_count: number
    items: CommitmentItem[]
  }
}

export interface SnapshotKindStatus {
  kind: keyof SnapshotAsOf
  kind_label: string
  as_of: string | null
  days_before_transaction_as_of: number | null
}

export interface ClassificationCompleteness {
  adjustability_undecided_total: number
  adjustability_undecided_transaction_count: number
  total_outflow: number
  adjustability_undecided_share: number | null
  adjustability_decided_share: number | null
  uncategorized_expense_total: number
  uncategorized_expense_transaction_count: number
  installment_link_unconfirmed_transaction_count: number
  commitments_without_cycle: number
  commitments_without_adjustability: number
}

export interface ReadDataStatusResponse extends ReadEnvelope {
  data: {
    transaction_coverage: {
      first_transaction_date?: string | null
      transaction_as_of?: string | null
      first_period?: string | null
      last_period?: string | null
      imported_period_count?: number | null
    }
    closed_periods: string[]
    in_progress_period: string | null
    snapshots: SnapshotKindStatus[]
    classification: ClassificationCompleteness
    coverage_gaps: Array<{ period: string; status: 'no_transactions'; status_label: string }>
    periods: ReadPeriodState[]
    excluded_currency: ExcludedCurrencyItem[]
    non_krw_transaction_count: number
  }
}

export interface ReadMonthProjectionResponse extends ReadEnvelope {
  as_of: ReadAsOf & { transaction_as_of_basis: 'max_effective_transaction_date' }
  data: MonthlyProjection
}
