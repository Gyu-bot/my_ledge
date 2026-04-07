export interface TransactionResponse {
  id: number
  date: string         // "YYYY-MM-DD"
  time: string         // "HH:MM:SS"
  type: string
  category_major: string
  category_minor: string | null
  category_major_user: string | null
  category_minor_user: string | null
  effective_category_major: string
  effective_category_minor: string | null
  description: string
  merchant: string
  amount: number
  currency: string
  payment_method: string | null
  cost_kind: 'fixed' | 'variable' | null
  fixed_cost_necessity: 'essential' | 'discretionary' | null
  memo: string | null
  is_deleted: boolean
  merged_into_id: number | null
  is_edited: boolean
  source: string
  created_at: string
  updated_at: string
}

export interface TransactionListResponse {
  total: number
  page: number
  per_page: number
  items: TransactionResponse[]
}

export interface TransactionFilterOptionsResponse {
  category_options: string[]
  payment_method_options: string[]
}

export interface TransactionListParams {
  page?: number
  per_page?: number
  type?: string
  source?: string
  category_major?: string
  payment_method?: string
  start_date?: string
  end_date?: string
  include_deleted?: boolean
  is_edited?: boolean
  search?: string
  start_month?: string
  end_month?: string
  include_income?: boolean
}

export interface TransactionUpdateRequest {
  merchant?: string | null
  category_major_user?: string | null
  category_minor_user?: string | null
  cost_kind?: 'fixed' | 'variable' | null
  fixed_cost_necessity?: 'essential' | 'discretionary' | null
  memo?: string | null
}

export interface TransactionBulkUpdateRequest {
  ids: number[]
  merchant?: string | null
  category_major_user?: string | null
  category_minor_user?: string | null
  cost_kind?: 'fixed' | 'variable' | null
  fixed_cost_necessity?: 'essential' | 'discretionary' | null
  memo?: string | null
}

export interface CategoryTimelineItem {
  period: string
  category: string
  amount: number
}

export interface CategoryBreakdownItem {
  category: string
  amount: number
}

export interface MonthlySummaryItem {
  period: string
  amount: number
}
