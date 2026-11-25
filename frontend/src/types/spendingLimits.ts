export type LimitTargetKind = 'category' | 'adjustability'
export interface SpendingLimitInput {
  target_kind: LimitTargetKind
  target_value: string
  effective_from_period: string
  amount: number | null
}
export interface SpendingLimitRevision extends SpendingLimitInput {
  id: number
  created_at: string
}
export interface SpendingLimitHistory {
  revisions: SpendingLimitRevision[]
  last_closed_period: string | null
  history_rule: string
}
export interface LimitComparison {
  target_kind: LimitTargetKind
  target_value: string
  target_label: string
  actual_amount: number | null
  one_off_amount: number | null
  limit_amount: number | null
  limit_revision_id: number | null
  effective_from_period: string | null
  difference_amount: number | null
  missing_reason: 'no_limit_set' | 'month_in_progress' | 'not_imported' | 'no_transactions' | 'partial_month' | null
  missing_reason_label: string | null
}
export interface SpendingReference {
  basis: { definition: string; scope: string; rules: Record<string, string> }
  data: {
    period: string | null
    total_outflow: number | null
    window_start_period: string | null
    window_end_period: string | null
    annual_missing_reason: 'month_in_progress' | 'incomplete_twelve_month_window' | null
    annual_missing_reason_label: string | null
    annual_items: Array<{
      category: string
      category_minor: string | null
      source: 'observed_pattern' | 'registered_yearly_commitment'
      commitment_id: number | null
      commitment_label: string | null
      observed_periods: string[]
      window_amount: number
      monthly_equivalent: number
      active_months_in_window: number
    }>
    comparisons: LimitComparison[]
  }
}
