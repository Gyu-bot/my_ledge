// T059 약정 현황·작업대 테스트용 합성 자료 (공개 저장소 — 실제 장부와 무관한 이름과 금액).
import type { CommitmentItem, ObservationState, ReadCommitmentsResponse, ReadDataStatusResponse } from '../../types/readSurface'
import type { RecurringCommitment } from '../../types/nature'
import type { TransactionResponse } from '../../types/transaction'

const STATE_LABEL: Record<ObservationState, string> = {
  observed: '관측됨',
  expected_not_observed: '주기상 있어야 하는데 관측 안 됨',
  unlinked_transaction_present: '거래는 있으나 연결 미확인',
  not_expected: '이 기간에 예정된 회차 없음',
  not_determinable: '판단할 근거가 기록되지 않음',
}

const ENVELOPE_AS_OF = {
  transaction_as_of: '2026-08-14',
  first_transaction_date: '2026-01-01',
  last_closed_period: '2026-07',
  in_progress_period: '2026-08',
  snapshot_as_of: { assets: '2026-07-31', loans: '2026-06-30', investments: null, insurance: null, profile: null },
}

export function commitmentItem(overrides: Partial<CommitmentItem> & { state?: ObservationState; ids?: number[] } = {}): CommitmentItem {
  const { state = 'observed', ids = [], ...rest } = overrides
  return {
    commitment_key: 'loan:1',
    kind: 'loan',
    kind_label: '대출',
    source_id: 1,
    name: '샘플 대출',
    lifecycle: 'active',
    lifecycle_label: '진행 중',
    lifecycle_detail: 'active',
    cycle: 'monthly',
    cycle_label: '매월',
    monthly_burden: 450_000,
    monthly_burden_basis: 'recorded_monthly_payment',
    monthly_burden_basis_label: '대출 스냅샷에 기록된 월 상환액',
    monthly_burden_source: null,
    start_date: '2025-01-10',
    end_date: '2030-01-10',
    total_count: null,
    remaining_count: null,
    linked_count: 12,
    adjustability: 'protected',
    adjustability_label: '보호',
    adjustability_basis: '대출·할부는 끝날 때까지 보호로 고정한다(2.2).',
    last_observed_period: '2026-07',
    last_observed_amount: 450_000,
    observation: {
      period: '2026-07',
      state,
      state_label: STATE_LABEL[state],
      reason: 'linked_transactions_in_period',
      reason_label: '이 기간에 연결된 거래가 있음',
      observed_amount: state === 'observed' ? 450_000 : 0,
      observed_transaction_count: state === 'observed' ? 1 : 0,
      transaction_ids: ids,
    },
    ...rest,
  }
}

export function commitmentsFixture(items?: CommitmentItem[]): ReadCommitmentsResponse {
  const list = items ?? [
    commitmentItem({ ids: [501] }),
    commitmentItem({
      commitment_key: 'installment:3', kind: 'installment', kind_label: '할부', source_id: 3, name: '샘플 할부',
      monthly_burden: 120_000, monthly_burden_basis: 'plan_monthly_amount', monthly_burden_basis_label: '할부 계획의 월 금액',
      start_date: '2026-03-15', end_date: '2026-08-15', total_count: 6, remaining_count: 1, linked_count: 3,
      state: 'unlinked_transaction_present', ids: [601, 602],
    }),
    commitmentItem({
      commitment_key: 'installment:4', kind: 'installment', kind_label: '할부', source_id: 4, name: '샘플 할부 둘',
      monthly_burden: 80_000, monthly_burden_basis: 'plan_monthly_amount', monthly_burden_basis_label: '할부 계획의 월 금액',
      total_count: 3, remaining_count: 0, state: 'expected_not_observed',
    }),
    commitmentItem({
      commitment_key: 'recurring:7', kind: 'recurring', kind_label: '정기 지급', source_id: 7, name: '샘플 연간 구독',
      cycle: 'yearly', cycle_label: '매년', monthly_burden: null, monthly_burden_basis: 'not_available', monthly_burden_basis_label: '기록된 월 금액 없음',
      end_date: null, adjustability: 'adjustable', adjustability_label: '조정 가능', state: 'not_expected',
    }),
    commitmentItem({
      commitment_key: 'recurring:8', kind: 'recurring', kind_label: '정기 지급', source_id: 8, name: '샘플 주기 없음',
      cycle: null, cycle_label: '주기 미기록', monthly_burden: null, monthly_burden_basis: 'not_available', monthly_burden_basis_label: '기록된 월 금액 없음',
      end_date: null, adjustability: 'undecided', adjustability_label: '미정', state: 'not_determinable',
    }),
    commitmentItem({
      commitment_key: 'recurring:9', kind: 'recurring', kind_label: '정기 지급', source_id: 9, name: '샘플 끝난 구독',
      lifecycle: 'ended', lifecycle_label: '종료', end_date: '2026-02-28', state: 'not_expected',
    }),
  ]
  return {
    surface: 'commitments',
    surface_label: '약정 목록',
    status: 'classification_incomplete',
    status_label: '분류가 덜 되어 계산이 불완전함',
    status_reasons: [{ code: 'commitment_attributes_missing', label: '주기나 조정 가능성이 기록되지 않은 약정이 있음', periods: [], detail: '주기 미기록 1건, 조정 가능성 미정 1건' }],
    as_of: ENVELOPE_AS_OF,
    basis: { definition: 'commitments.v1', scope: '', rules: {}, assumptions: [] },
    data: {
      period: '2026-07',
      period_month_status: 'closed',
      totals: { monthly_burden_recorded: 650_000, observed_committed_total: 450_000 },
      counts_by_state: {},
      items: list,
    },
  }
}

export function txFixture(id: number, overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return {
    id, date: '2026-07-15', time: '12:00:00', type: '지출', category_major: '샘플 생활', category_minor: null,
    category_major_user: null, category_minor_user: null, effective_category_major: '샘플 생활', effective_category_minor: null,
    description: `샘플 거래 ${id}`, merchant: `샘플 거래처 ${id}`, amount: -10_000, currency: 'KRW', payment_method: null,
    cost_kind: null, fixed_cost_necessity: null, spend_necessity: null, cost_classification_source: null, recurring_payment_kind: null,
    memo: null, is_deleted: false, merged_into_id: null, is_edited: false, source: 'import', created_at: '', updated_at: '',
    ...overrides,
  }
}

export function recurringFixture(overrides: Partial<RecurringCommitment> = {}): RecurringCommitment {
  return {
    id: 7, label: null, match_scope: 'merchant', merchant: '샘플 구독', category_major: '샘플 구독료', category_minor: null,
    cycle: 'monthly', total_count: null, amount_kind: 'fixed', adjustability: 'adjustable', start_date: '2026-01-01', end_date: null,
    origin: 'user', memo: null, member_transaction_count: 7, first_member_date: '2026-01-05', last_member_date: '2026-07-05',
    created_at: '', updated_at: '', ...overrides,
  }
}

export function readDataStatusFixture(overrides: Partial<ReadDataStatusResponse['data']> = {}): ReadDataStatusResponse {
  return {
    surface: 'data_status',
    surface_label: '자료 현황',
    status: 'classification_incomplete',
    status_label: '분류가 덜 되어 계산이 불완전함',
    status_reasons: [{ code: 'periods_without_transactions', label: '가져온 기간 중 거래가 0건인 달이 있음', periods: ['2026-05'], detail: null }],
    as_of: ENVELOPE_AS_OF,
    basis: { definition: 'data_status.v1', scope: '', rules: {}, assumptions: [] },
    data: {
      transaction_coverage: { first_transaction_date: '2026-01-01', transaction_as_of: '2026-08-14', first_period: '2026-01', last_period: '2026-08', imported_period_count: 8 },
      closed_periods: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
      in_progress_period: '2026-08',
      snapshots: [
        { kind: 'assets', kind_label: '자산 스냅샷', as_of: '2026-07-31', days_before_transaction_as_of: 14 },
        { kind: 'loans', kind_label: '대출 스냅샷', as_of: '2026-06-30', days_before_transaction_as_of: 45 },
        { kind: 'investments', kind_label: '투자 스냅샷', as_of: null, days_before_transaction_as_of: null },
        { kind: 'insurance', kind_label: '보험 스냅샷', as_of: null, days_before_transaction_as_of: null },
        { kind: 'profile', kind_label: '프로필 스냅샷', as_of: null, days_before_transaction_as_of: null },
      ],
      classification: {
        adjustability_undecided_total: 300_000,
        adjustability_undecided_transaction_count: 42,
        total_outflow: 3_000_000,
        adjustability_undecided_share: 0.1,
        adjustability_decided_share: 0.9,
        uncategorized_expense_total: 0,
        uncategorized_expense_transaction_count: 0,
        installment_link_unconfirmed_transaction_count: 2,
        commitments_without_cycle: 1,
        commitments_without_adjustability: 0,
      },
      coverage_gaps: [{ period: '2026-05', status: 'no_transactions', status_label: '가져온 기간이지만 거래 0건' }],
      periods: [
        { period: '2026-05', coverage: 'imported', coverage_label: '가져온 기간', data_coverage: 'full', data_coverage_label: '달 전체 범위', data_coverage_reasons: [], month_status: 'closed', status: 'no_transactions', status_label: '', transaction_count: 0, total_outflow: 0, adjustability_undecided_total: 0, adjustability_undecided_share: null },
        { period: '2026-07', coverage: 'imported', coverage_label: '가져온 기간', data_coverage: 'full', data_coverage_label: '달 전체 범위', data_coverage_reasons: [], month_status: 'closed', status: 'ok', status_label: '', transaction_count: 120, total_outflow: 1_000_000, adjustability_undecided_total: 100_000, adjustability_undecided_share: 0.1 },
        { period: '2026-08', coverage: 'imported', coverage_label: '가져온 기간', data_coverage: 'full', data_coverage_label: '달 전체 범위', data_coverage_reasons: [], month_status: 'in_progress', status: 'ok', status_label: '', transaction_count: 40, total_outflow: 400_000, adjustability_undecided_total: 80_000, adjustability_undecided_share: 0.2 },
      ],
      excluded_currency: [],
      non_krw_transaction_count: 1,
      ...overrides,
    },
  }
}
