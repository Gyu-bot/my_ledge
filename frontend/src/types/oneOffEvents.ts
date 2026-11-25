export interface OneOffEventPeriod {
  period: string
  amount: number
}

export interface OneOffEvent {
  id: number
  name: string
  note: string | null
  direct_member_count: number
  counted_total: number
  first_date: string | null
  last_date: string | null
  periods: OneOffEventPeriod[]
}

export type OneOffMemberStatus = 'counted' | 'fully_allocated' | 'committed_now' | 'inactive'
export type OneOffInactiveReason = 'deleted' | 'merged' | 'superseded' | 'not_expense' | 'non_krw'

export interface OneOffEventMember {
  transaction_id: number
  date: string
  merchant: string
  description: string
  category_major: string
  category_minor: string | null
  amount: number
  currency: string
  member_status: OneOffMemberStatus
  inactive_reason: OneOffInactiveReason | null
}

export interface OneOffEventDetail extends OneOffEvent {
  members: OneOffEventMember[]
}

export interface OneOffEventInput {
  name: string
  note?: string | null
}

export type OneOffRejectionReason = 'not_found' | 'inactive' | 'not_expense' | 'non_krw' | 'committed' | 'in_other_event'

export interface OneOffEventRejection {
  transaction_id: number
  reason: OneOffRejectionReason
}
