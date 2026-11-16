// 합성 자료만 사용한다 (공개 저장소). 금액은 실제 장부와 무관하다.
import type {
  EmergencyFundResponse,
  NetWorthReconciliationResponse,
  ReconciliationStatus,
  SnapshotIntervalsResponse,
} from '../../types/netWorth'
import type { TransferPurposeItem, TransferPurposeListResponse } from '../../types/metrics'
import type { TransferPurposeRule } from '../../types/nature'
import { contractFixture } from './metricsFixtures'

/**
 * 완료된 구간 (2026-05-31 → 2026-06-30).
 * 순자산 변동 3,500,000 = 잔여 2,000,000 + 대출 잔액 감소 600,000 + 투자 평가 변동 700,000 + 설명되지 않는 차이 200,000
 */
export function reconciliationFixture(status: ReconciliationStatus = 'complete'): NetWorthReconciliationResponse {
  const base: NetWorthReconciliationResponse = {
    status: 'complete',
    status_reasons: [],
    identity: 'net_worth_change = residual + loan_balance_decrease + investment_valuation_change + unexplained_difference',
    interval: {
      start_snapshot_date: '2026-05-31',
      end_snapshot_date: '2026-06-30',
      transaction_start_date: '2026-06-01',
      transaction_end_date: '2026-06-30',
      boundary_rule: '합성 규칙',
    },
    net_worth_start: { snapshot_date: '2026-05-31', asset_total: 150_000_000, liability_total: 50_000_000, net_worth: 100_000_000, negative_asset_excluded_total: 0 },
    net_worth_end: { snapshot_date: '2026-06-30', asset_total: 152_900_000, liability_total: 49_400_000, net_worth: 103_500_000, negative_asset_excluded_total: 0 },
    kinds: [
      { kind: 'loans', pair_status: 'observed', start_as_of: '2026-05-31', end_as_of: '2026-06-30', start_value: 50_000_000, end_value: 49_400_000, change: -600_000, missing_value_row_count: 0, value_basis: '합성' },
      { kind: 'investments', pair_status: 'observed', start_as_of: '2026-05-31', end_as_of: '2026-06-30', start_value: 20_000_000, end_value: 21_700_000, change: 1_700_000, missing_value_row_count: 0, value_basis: '합성' },
    ],
    other_kinds: { insurance_start_as_of: '2026-05-31', insurance_end_as_of: '2026-06-30', profile_start_as_of: null, profile_end_as_of: null },
    transactions: { covered: true, first_transaction_date: '2026-01-01', transaction_as_of: '2026-07-10', periods_without_data: [], non_krw_transaction_count: 0, rule: '합성' },
    flow: { income_total: 5_000_000, total_outflow: 3_000_000, committed_loan_total: 800_000, residual: 2_000_000, adjustability_undecided_total: 0, transaction_count: 42 },
    transfers: {
      transfer_net: -1_500_000,
      investment_net: -1_000_000,
      savings_net: -500_000,
      investment_savings_net: -1_500_000,
      internal_move_net: 0,
      undecided_net: 0,
      activity_total: 3_000_000,
      undecided_activity_total: 0,
      undecided_share: 0,
      netting_rule: '합성',
    },
    items: {
      net_worth_change: 3_500_000,
      residual: 2_000_000,
      loan_balance_decrease: 600_000,
      investment_valuation_change: 700_000,
      unexplained_difference: 200_000,
      investment_value_change: 1_700_000,
      investment_net_transfer_in: 1_000_000,
    },
    contract: contractFixture(),
  }
  if (status === 'complete') return base
  if (status === 'incomplete_classification') {
    return {
      ...base,
      status,
      transfers: { ...base.transfers!, undecided_net: -300_000, transfer_net: -1_800_000, activity_total: 3_300_000, undecided_activity_total: 300_000, undecided_share: 0.0909 },
      items: { ...base.items!, unexplained_difference: -100_000, net_worth_change: 3_200_000 },
    }
  }
  if (status === 'transactions_not_covered') {
    return {
      ...base,
      status,
      transactions: { ...base.transactions!, covered: false, first_transaction_date: '2026-06-10' },
      items: { ...base.items!, unexplained_difference: null },
    }
  }
  if (status === 'snapshot_dates_mismatched') {
    return {
      ...base,
      status,
      kinds: [
        { ...base.kinds[0], pair_status: 'mismatched', start_as_of: '2026-05-15', change: null, start_value: null },
        base.kinds[1],
      ],
      items: { ...base.items!, loan_balance_decrease: null, unexplained_difference: null },
    }
  }
  return {
    ...base,
    status: 'no_snapshot_pair',
    interval: null,
    net_worth_start: null,
    net_worth_end: null,
    kinds: [],
    other_kinds: null,
    transactions: null,
    flow: null,
    transfers: null,
    items: null,
  }
}

export function intervalsFixture(): SnapshotIntervalsResponse {
  return {
    snapshot_dates: {
      assets: ['2026-06-30', '2026-05-31', '2026-04-30'],
      loans: ['2026-06-30', '2026-05-31', '2026-05-15', '2026-04-30'],
      investments: ['2026-06-30', '2026-05-31'],
      insurance: ['2026-06-30'],
      profile: [],
    },
    intervals: [
      { start_snapshot_date: '2026-05-31', end_snapshot_date: '2026-06-30', status: 'complete', net_worth_change: 3_500_000, unexplained_difference: 200_000, transfer_undecided_share: 0 },
      { start_snapshot_date: '2026-04-30', end_snapshot_date: '2026-05-31', status: 'transactions_not_covered', net_worth_change: -1_000_000, unexplained_difference: null, transfer_undecided_share: 0.5 },
    ],
    interval_rule: '합성',
  }
}

export function emergencyFundFixture(overrides: Partial<EmergencyFundResponse> = {}): EmergencyFundResponse {
  return {
    status: 'incomplete_classification',
    status_reasons: [],
    formula: 'emergency_fund_months = cash_like_total ÷ monthly_protected_outflow',
    asset_snapshot_date: '2026-06-30',
    cash_like_total: 7_500_000,
    cash_like_name_rule_total: 1_000_000,
    cash_like_basis: '합성',
    monthly_protected_outflow: 3_000_000,
    monthly_adjustability_undecided_outflow: 250_000,
    adjustability_undecided_share: 0.08,
    emergency_fund_months: 2.5,
    baseline: {
      method: 'median_of_recent_closed_months',
      months_requested: 6,
      periods: ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
      month_count: 5,
      status: 'fewer_than_requested',
      limited_by: 'data_start',
      baseline_start_date: null,
      skipped_periods: [],
      last_closed_period: '2026-06',
    },
    legacy_surface: '합성',
    contract: contractFixture(),
    ...overrides,
  }
}

export function transferItem(overrides: Partial<TransferPurposeItem> = {}): TransferPurposeItem {
  return {
    transaction_id: 1,
    effective: true,
    date: '2026-06-05',
    amount: -1_000_000,
    currency: 'KRW',
    merchant: '가상증권',
    description: '가상증권 이체',
    effective_category_major: '이체',
    effective_category_minor: null,
    purpose: 'undecided',
    purpose_source: 'none',
    transaction_purpose: null,
    rule_id: null,
    rule_purpose: null,
    ...overrides,
  }
}

export function transferListFixture(items: TransferPurposeItem[]): TransferPurposeListResponse {
  return {
    total_count: 4,
    undecided_count: 2,
    undecided_activity_total: 1_300_000,
    activity_total: 2_600_000,
    items,
  }
}

export function transferRule(overrides: Partial<TransferPurposeRule> = {}): TransferPurposeRule {
  return {
    id: 7,
    match_scope: 'merchant',
    merchant: '가상저축은행',
    category_major: null,
    category_minor: null,
    purpose: 'savings',
    label: null,
    memo: null,
    matched_transfer_count: 3,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}
