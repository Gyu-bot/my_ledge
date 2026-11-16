// 순자산 대조(Implentation-plan.md 2.5) 구간의 금액이 무엇이고 어디서 오는지.
// 금액은 모두 /metrics/net-worth/reconciliation 응답 값을 그대로 쓴다. 이 파일은
// 이름·산식 설명·포함/제외 문장과, 드릴다운에서 어느 조회로 거래를 여는지만 정한다.

import { formatNetWon, formatSignedWon } from '../../ds/format'
import type { FlowRowKey, TransferPurpose } from '../../types/metrics'

export type IntervalMeasureKey =
  | 'residual'
  | 'income_total'
  | 'total_outflow'
  | 'transfer_investment_savings'
  | 'transfer_internal_move'
  | 'transfer_undecided'

/** 구간: 거래는 시작 스냅샷 다음 날부터 끝 스냅샷일까지 */
export interface IntervalRange {
  start_snapshot_date: string
  end_snapshot_date: string
  start_date: string
  end_date: string
}

/** 응답에서 그대로 옮긴 구간 금액 */
export interface IntervalValues {
  income_total: number
  total_outflow: number
  residual: number
  transaction_count: number
  investment_savings_net: number
  internal_move_net: number
  undecided_net: number
}

export type IntervalSource =
  | { kind: 'parts'; parts: IntervalMeasureKey[] }
  | { kind: 'income' }
  | { kind: 'outflow_rows' }
  | { kind: 'transfer'; purposes: TransferPurpose[] }

export interface IntervalMeasureDef {
  key: IntervalMeasureKey
  label: string
  formula: string
  withValues: (values: IntervalValues) => string | null
  includes: string[]
  excludes: string[]
  source: IntervalSource
  amount: (values: IntervalValues) => number
  /** 이체는 받은 쪽 +, 보낸 쪽 − 그대로 */
  signed: boolean
}

const RANGE_INCLUDES = [
  '시작 스냅샷 다음 날부터 끝 스냅샷일까지의 거래를 셉니다(시작 스냅샷일은 빼고, 끝 스냅샷일은 넣습니다).',
  '삭제·병합되었거나 새 거래로 대체된 거래는 빼고, 남아 있는 거래만 셉니다.',
  '원화 거래만 더합니다. 다른 통화 거래는 따로 세고 합계에 넣지 않습니다.',
]
const SPEND_INCLUDES = [...RANGE_INCLUDES, '환불은 지출에서 뺍니다.', '대출 원리금은 원금과 이자를 나누지 않고 전체를 넣습니다.']
const TRANSFER_INCLUDES = [
  ...RANGE_INCLUDES,
  '이체는 원래 부호대로 더합니다(받은 돈 +, 보낸 돈 −).',
  '내 장부 안의 두 계좌 사이 이동은 양쪽 거래가 모두 "그 밖의 계좌 간 이동"으로 정해져 서로 지워지므로 두 번 세지 않습니다.',
]

/** 지출 줄 — 총지급을 이루는 흐름표 줄 (2.3) */
export const OUTFLOW_FLOW_ROWS: FlowRowKey[] = [
  'committed_loan',
  'committed_installment',
  'committed_recurring',
  'ad_hoc_protected',
  'ad_hoc_adjustable',
  'undecided',
]

export const INTERVAL_MEASURES: Record<IntervalMeasureKey, IntervalMeasureDef> = {
  residual: {
    key: 'residual',
    label: '잔여',
    formula: '잔여 = 수입 − 총지급 (이 구간의 거래 기록)',
    withValues: (v) => `${formatNetWon(v.income_total)} − ${formatNetWon(v.total_outflow)} = ${formatSignedWon(v.residual)}`,
    includes: [...RANGE_INCLUDES, '총지급 = 약정 지급 + 수시 지출 + 조정 가능성 미정 지출 (환불 뺀 뒤)'],
    excludes: ['이체는 수입과 지출에 넣지 않습니다. 잔여의 행방에서 따로 봅니다.'],
    source: { kind: 'parts', parts: ['income_total', 'total_outflow'] },
    amount: (v) => v.residual,
    signed: true,
  },
  income_total: {
    key: 'income_total',
    label: '수입',
    formula: '수입 = 이 구간에 들어온 수입 거래의 합계',
    withValues: () => null,
    includes: RANGE_INCLUDES,
    excludes: ['이체로 받은 돈은 수입이 아닙니다.', '지출 환불은 수입이 아니라 지출에서 뺍니다.'],
    source: { kind: 'income' },
    amount: (v) => v.income_total,
    signed: false,
  },
  total_outflow: {
    key: 'total_outflow',
    label: '총지급',
    formula: '총지급 = 약정 지급 + 수시 지출 + 조정 가능성 미정 지출 (환불 뺀 뒤)',
    withValues: () => null,
    includes: SPEND_INCLUDES,
    excludes: ['이체(내 계좌 사이 이동, 투자·저축 이체)는 지출에 넣지 않습니다.', '수입은 넣지 않습니다.'],
    source: { kind: 'outflow_rows' },
    amount: (v) => v.total_outflow,
    signed: false,
  },
  transfer_investment_savings: {
    key: 'transfer_investment_savings',
    label: '투자·저축 이체',
    formula: '투자·저축 이체 = 사람이 목적을 "투자"나 "저축"으로 정한 이체의 합계',
    withValues: () => null,
    includes: TRANSFER_INCLUDES,
    excludes: ['목적이 정해지지 않은 이체는 넣지 않습니다.'],
    source: { kind: 'transfer', purposes: ['investment', 'savings'] },
    amount: (v) => v.investment_savings_net,
    signed: true,
  },
  transfer_internal_move: {
    key: 'transfer_internal_move',
    label: '그 밖의 계좌 간 이동',
    formula: '그 밖의 계좌 간 이동 = 사람이 목적을 "그 밖의 계좌 간 이동"으로 정한 이체의 합계',
    withValues: () => null,
    includes: TRANSFER_INCLUDES,
    excludes: ['목적이 정해지지 않은 이체는 넣지 않습니다.'],
    source: { kind: 'transfer', purposes: ['internal_move'] },
    amount: (v) => v.internal_move_net,
    signed: true,
  },
  transfer_undecided: {
    key: 'transfer_undecided',
    label: '목적 미정 이체',
    formula: '목적 미정 이체 = 아직 목적을 정하지 않은 이체의 합계',
    withValues: () => null,
    includes: TRANSFER_INCLUDES,
    excludes: ['목적은 사람이 정합니다. 추정해서 채우지 않습니다.'],
    source: { kind: 'transfer', purposes: ['undecided'] },
    amount: (v) => v.undecided_net,
    signed: true,
  },
}
