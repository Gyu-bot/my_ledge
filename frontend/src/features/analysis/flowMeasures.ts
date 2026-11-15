// 월 흐름표(Implentation-plan.md 2.3)의 각 금액이 무엇이고 어디서 오는지.
// 금액은 모두 백엔드 응답(/metrics/monthly-flow)의 값을 그대로 쓴다. 이 파일은
// 이름·산식 설명·포함/제외 문장과, 드릴다운에서 어느 조회로 내역을 여는지만 정한다.

import { formatSignedWon, formatWon } from '../../ds/format'
import type { FlowRowKey, MonthlyFlowMonth, SpendCubeFilters, TransferPurpose } from '../../types/metrics'
import type { TransactionListParams } from '../../types/transaction'

export type FlowMeasureKey =
  | 'income_total'
  | 'committed_total'
  | 'committed_loan_total'
  | 'committed_installment_total'
  | 'committed_recurring_total'
  | 'ad_hoc_protected_total'
  | 'ad_hoc_adjustable_total'
  | 'undecided_total'
  | 'total_outflow'
  | 'residual'
  | 'living_spend'
  | 'protected_spend'
  | 'adjustable_spend'
  | 'transfer_investment_savings'
  | 'transfer_internal_move'
  | 'transfer_undecided'
  | 'transfer_net'

export type MeasureSource =
  /** 지출 큐브에서 이 조건으로 카테고리 × 거래처 구성을 연다 */
  | { kind: 'cube'; filters: SpendCubeFilters }
  /** 지출 큐브를 흐름표 줄별로 열고, 빠지는 줄을 표시한다 */
  | { kind: 'cube_rows'; excludedRows: FlowRowKey[] }
  | { kind: 'income' }
  | { kind: 'transfer'; purposes: TransferPurpose[] | null }
  /** 다른 금액들로 이루어진 값 — 각 부분을 열어 본다 */
  | { kind: 'parts'; parts: FlowMeasureKey[] }

export interface FlowMeasureDef {
  key: FlowMeasureKey
  label: string
  /** 흐름표에서 앞에 붙는 연산 기호 (색에만 의존하지 않기) */
  sign: '+' | '−' | '=' | ''
  formula: string
  includes: string[]
  excludes: string[]
  source: MeasureSource
  /** 흐름표 줄 하나에 해당하면 그 줄의 거래 건수를 응답의 rows에서 읽는다 */
  flowRow?: FlowRowKey
  /** /metrics/comparison/monthly-flow 의 measure key (없으면 비교 안 함) */
  comparisonKey?: string
  /** 금액 부호: 지출은 지급 양수, 이체는 받은 쪽 양수 */
  amountKind: 'paid' | 'received' | 'signed'
}

const COMMON_INCLUDES = [
  '삭제·병합되었거나 새 거래로 대체된 거래는 빼고, 남아 있는 거래만 셉니다.',
  '원화 거래만 더합니다. 다른 통화 거래는 따로 세고 합계에 넣지 않습니다.',
  '거래일이 속한 달에 넣습니다.',
]
const SPEND_INCLUDES = [
  ...COMMON_INCLUDES,
  '환불은 환불이 기록된 달에서 지출을 줄입니다. 원래 구매와 확정 연결된 환불만 원래 구매의 카테고리·거래처·성격을 따릅니다.',
]
const SPEND_EXCLUDES = ['이체(내 계좌 사이 이동, 투자·저축 이체)는 지출에 넣지 않습니다.', '수입은 넣지 않습니다.']

export const FLOW_MEASURES: Record<FlowMeasureKey, FlowMeasureDef> = {
  income_total: {
    key: 'income_total',
    label: '수입',
    sign: '',
    formula: '수입 = 이 달에 들어온 수입 거래의 합계. 정기·비정기 구분은 아직 기록되어 있지 않아 한 줄로 둡니다.',
    includes: COMMON_INCLUDES,
    excludes: ['이체로 받은 돈은 수입이 아닙니다.', '지출 환불은 수입이 아니라 지출에서 뺍니다.'],
    source: { kind: 'income' },
    flowRow: 'income_undetermined',
    comparisonKey: 'income_total',
    amountKind: 'received',
  },
  committed_total: {
    key: 'committed_total',
    label: '약정 지급',
    sign: '−',
    formula: '약정 지급 = 대출 원리금 + 할부 회차 + 정기 지급',
    includes: [...SPEND_INCLUDES, '대출에 연결된 거래, 할부 계획에 연결된 거래, 사람이 정기 지급으로 등록한 묶음에 속한 거래.'],
    excludes: SPEND_EXCLUDES,
    source: { kind: 'cube', filters: { payment_form: 'committed' } },
    comparisonKey: 'committed_total',
    amountKind: 'paid',
  },
  committed_loan_total: {
    key: 'committed_loan_total',
    label: '대출 원리금',
    sign: '',
    formula: '대출 원리금 = 대출에 연결된 지출 거래의 합계. 원금과 이자를 나누지 않습니다.',
    includes: [...SPEND_INCLUDES, '대출 계좌에 연결된 상환 거래 전체.'],
    excludes: [...SPEND_EXCLUDES, '대출에 아직 연결되지 않은 상환은 여기 들어오지 않고 수시 지출이나 미정에 남습니다.'],
    source: { kind: 'cube', filters: { flow_row: 'committed_loan' } },
    flowRow: 'committed_loan',
    comparisonKey: 'committed_loan_total',
    amountKind: 'paid',
  },
  committed_installment_total: {
    key: 'committed_installment_total',
    label: '할부 회차',
    sign: '',
    formula: '할부 회차 = 할부 계획에 연결된 이번 달 결제의 합계',
    includes: [...SPEND_INCLUDES, '할부 계획에 연결된 회차 결제.'],
    excludes: [...SPEND_EXCLUDES, '연결되지 않은 할부 결제는 수시 지출이나 미정에 남습니다.'],
    source: { kind: 'cube', filters: { flow_row: 'committed_installment' } },
    flowRow: 'committed_installment',
    comparisonKey: 'committed_installment_total',
    amountKind: 'paid',
  },
  committed_recurring_total: {
    key: 'committed_recurring_total',
    label: '정기 지급',
    sign: '',
    formula: '정기 지급 = 사람이 등록한 정기 지급 묶음(거래처나 카테고리 단위)에 속한 지출의 합계',
    includes: [...SPEND_INCLUDES, '등록한 묶음의 거래처·카테고리와 기간에 맞는 지출.'],
    excludes: [...SPEND_EXCLUDES, '대출·할부에 연결된 거래는 그쪽 줄에 들어갑니다.'],
    source: { kind: 'cube', filters: { flow_row: 'committed_recurring' } },
    flowRow: 'committed_recurring',
    comparisonKey: 'committed_recurring_total',
    amountKind: 'paid',
  },
  ad_hoc_protected_total: {
    key: 'ad_hoc_protected_total',
    label: '수시 지출 · 보호',
    sign: '−',
    formula: '약정이 아닌 지출 중 "보호"(줄일 수 없거나 줄이지 않기로 한 지출)로 정한 것의 합계',
    includes: [...SPEND_INCLUDES, '조정 가능성은 거래 지정 → 카테고리 기본값 순으로 적용됩니다.'],
    excludes: [...SPEND_EXCLUDES, '약정 지급(대출·할부·정기 지급)은 빠집니다.'],
    source: { kind: 'cube', filters: { flow_row: 'ad_hoc_protected' } },
    flowRow: 'ad_hoc_protected',
    comparisonKey: 'ad_hoc_protected_total',
    amountKind: 'paid',
  },
  ad_hoc_adjustable_total: {
    key: 'ad_hoc_adjustable_total',
    label: '수시 지출 · 조정 가능',
    sign: '−',
    formula: '약정이 아닌 지출 중 "조정 가능"으로 정한 것의 합계',
    includes: [...SPEND_INCLUDES, '조정 가능성은 거래 지정 → 카테고리 기본값 순으로 적용됩니다.'],
    excludes: [...SPEND_EXCLUDES, '약정 지급(대출·할부·정기 지급)은 빠집니다.'],
    source: { kind: 'cube', filters: { flow_row: 'ad_hoc_adjustable' } },
    flowRow: 'ad_hoc_adjustable',
    comparisonKey: 'ad_hoc_adjustable_total',
    amountKind: 'paid',
  },
  undecided_total: {
    key: 'undecided_total',
    label: '미정',
    sign: '−',
    formula: '미정 = 약정이 아닌 지출 중 조정 가능성을 아직 정하지 않은 것의 합계. 숨기지 않고 따로 둡니다.',
    includes: SPEND_INCLUDES,
    excludes: [...SPEND_EXCLUDES, '보호나 조정 가능으로 정한 지출은 빠집니다.'],
    source: { kind: 'cube', filters: { flow_row: 'undecided' } },
    flowRow: 'undecided',
    comparisonKey: 'undecided_total',
    amountKind: 'paid',
  },
  total_outflow: {
    key: 'total_outflow',
    label: '총지급',
    sign: '=',
    formula: '총지급 = 약정 지급 + 수시 지출(보호 + 조정 가능) + 미정. 환불을 뺀 뒤의 금액이고 대출 원리금을 포함합니다.',
    includes: SPEND_INCLUDES,
    excludes: SPEND_EXCLUDES,
    source: { kind: 'cube', filters: {} },
    comparisonKey: 'total_outflow',
    amountKind: 'paid',
  },
  residual: {
    key: 'residual',
    label: '잔여',
    sign: '=',
    formula: '잔여 = 수입 − 총지급',
    includes: COMMON_INCLUDES,
    excludes: ['이체는 잔여 계산에 넣지 않고 "잔여의 행방"에서 따로 봅니다.'],
    source: { kind: 'parts', parts: ['income_total', 'total_outflow'] },
    comparisonKey: 'residual',
    amountKind: 'signed',
  },
  living_spend: {
    key: 'living_spend',
    label: '생활 지출',
    sign: '',
    formula: '생활 지출 = 총지급 − 대출 원리금',
    includes: SPEND_INCLUDES,
    excludes: [...SPEND_EXCLUDES, '대출 원리금은 빠집니다.'],
    source: { kind: 'cube_rows', excludedRows: ['committed_loan'] },
    comparisonKey: 'living_spend',
    amountKind: 'paid',
  },
  protected_spend: {
    key: 'protected_spend',
    label: '보호 지출',
    sign: '',
    formula: '보호 지출 = 조정 가능성이 "보호"인 지출의 합계 (약정 지급 포함, 대출·할부는 항상 보호)',
    includes: SPEND_INCLUDES,
    excludes: [...SPEND_EXCLUDES, '조정 가능·미정 지출은 빠집니다.'],
    source: { kind: 'cube', filters: { adjustability: 'protected' } },
    comparisonKey: 'protected_spend',
    amountKind: 'paid',
  },
  adjustable_spend: {
    key: 'adjustable_spend',
    label: '조정 가능 지출',
    sign: '',
    formula: '조정 가능 지출 = 조정 가능성이 "조정 가능"인 지출의 합계 (수시 지출과 정기 지급 모두)',
    includes: SPEND_INCLUDES,
    excludes: [...SPEND_EXCLUDES, '보호·미정 지출은 빠집니다.'],
    source: { kind: 'cube', filters: { adjustability: 'adjustable' } },
    comparisonKey: 'adjustable_spend',
    amountKind: 'paid',
  },
  transfer_investment_savings: {
    key: 'transfer_investment_savings',
    label: '투자·저축 이체',
    sign: '',
    formula: '사람이 "투자" 또는 "저축"으로 목적을 정한 이체의 순액 (보낸 돈 −, 받은 돈 +)',
    includes: [...COMMON_INCLUDES, '이체의 목적은 사람이 정합니다(거래 지정 → 거래처 규칙 → 카테고리 규칙).'],
    excludes: ['수입·지출은 넣지 않습니다.'],
    source: { kind: 'transfer', purposes: ['investment', 'savings'] },
    amountKind: 'signed',
  },
  transfer_internal_move: {
    key: 'transfer_internal_move',
    label: '그 밖의 계좌 간 이동',
    sign: '',
    formula: '"그 밖의 계좌 간 이동"으로 정한 이체의 순액. 내 계좌 두 곳 사이 이동은 양쪽이 서로 지워집니다.',
    includes: [...COMMON_INCLUDES, '이체의 목적은 사람이 정합니다(거래 지정 → 거래처 규칙 → 카테고리 규칙).'],
    excludes: ['수입·지출은 넣지 않습니다.'],
    source: { kind: 'transfer', purposes: ['internal_move'] },
    amountKind: 'signed',
  },
  transfer_undecided: {
    key: 'transfer_undecided',
    label: '목적 미정 이체',
    sign: '',
    formula: '아직 목적을 정하지 않은 이체의 순액',
    includes: COMMON_INCLUDES,
    excludes: ['수입·지출은 넣지 않습니다.'],
    source: { kind: 'transfer', purposes: ['undecided'] },
    amountKind: 'signed',
  },
  transfer_net: {
    key: 'transfer_net',
    label: '이체 순액',
    sign: '',
    formula: '이체 순액 = 투자·저축 이체 + 그 밖의 계좌 간 이동 + 목적 미정 이체',
    includes: COMMON_INCLUDES,
    excludes: ['수입·지출은 넣지 않습니다.'],
    source: { kind: 'transfer', purposes: null },
    comparisonKey: 'transfer_net',
    amountKind: 'signed',
  },
}

/** 백엔드 응답에서 그 금액을 그대로 읽는다 (계산하지 않음). */
export function measureAmount(month: MonthlyFlowMonth, key: FlowMeasureKey): number {
  switch (key) {
    case 'transfer_investment_savings':
      return month.transfer_investment_savings_net
    case 'transfer_internal_move':
      return month.transfer_internal_move_net
    case 'transfer_undecided':
      return month.transfer_undecided_net
    default:
      return month[key]
  }
}

export function formatMeasure(def: FlowMeasureDef, amount: number): string {
  if (def.amountKind === 'signed') return formatSignedWon(amount)
  return amount < 0 ? `-${formatWon(amount)}` : formatWon(amount)
}

/** 산식에 이 달 값을 넣어 보여 준다 — 응답 값을 나란히 놓을 뿐 다시 계산하지 않는다. */
export function formulaWithValues(month: MonthlyFlowMonth, key: FlowMeasureKey): string | null {
  const w = (value: number) => formatWon(value)
  switch (key) {
    case 'committed_total':
      return `대출 원리금 ${w(month.committed_loan_total)} + 할부 회차 ${w(month.committed_installment_total)} + 정기 지급 ${w(month.committed_recurring_total)} = ${w(month.committed_total)}`
    case 'total_outflow':
      return `약정 지급 ${w(month.committed_total)} + 수시·보호 ${w(month.ad_hoc_protected_total)} + 수시·조정 가능 ${w(month.ad_hoc_adjustable_total)} + 미정 ${w(month.undecided_total)} = ${w(month.total_outflow)}`
    case 'residual':
      return `수입 ${w(month.income_total)} − 총지급 ${w(month.total_outflow)} = ${formatSignedWon(month.residual)}`
    case 'living_spend':
      return `총지급 ${w(month.total_outflow)} − 대출 원리금 ${w(month.committed_loan_total)} = ${w(month.living_spend)}`
    case 'transfer_net':
      return `투자·저축 ${formatSignedWon(month.transfer_investment_savings_net)} + 계좌 간 이동 ${formatSignedWon(month.transfer_internal_move_net)} + 목적 미정 ${formatSignedWon(month.transfer_undecided_net)} = ${formatSignedWon(month.transfer_net)}`
    default:
      return null
  }
}

export function measureTransactionCount(month: MonthlyFlowMonth, def: FlowMeasureDef): number | null {
  if (!def.flowRow) return null
  return month.rows.find((row) => row.row === def.flowRow)?.transaction_count ?? 0
}

export const FLOW_ROW_LABELS: Record<FlowRowKey, string> = {
  income_undetermined: '수입',
  committed_loan: '약정 지급 · 대출 원리금',
  committed_installment: '약정 지급 · 할부 회차',
  committed_recurring: '약정 지급 · 정기 지급',
  ad_hoc_protected: '수시 지출 · 보호',
  ad_hoc_adjustable: '수시 지출 · 조정 가능',
  undecided: '미정',
  transfer_undetermined: '이체',
  other_type: '기타 유형',
}

export const FLOW_ROW_MEASURE: Partial<Record<FlowRowKey, FlowMeasureKey>> = {
  income_undetermined: 'income_total',
  committed_loan: 'committed_loan_total',
  committed_installment: 'committed_installment_total',
  committed_recurring: 'committed_recurring_total',
  ad_hoc_protected: 'ad_hoc_protected_total',
  ad_hoc_adjustable: 'ad_hoc_adjustable_total',
  undecided: 'undecided_total',
}

export const ADJUSTABILITY_LABELS: Record<string, string> = {
  protected: '보호',
  adjustable: '조정 가능',
  undecided: '미정',
}

export const COMMITMENT_KIND_LABELS: Record<string, string> = {
  loan: '대출 원리금',
  installment: '할부 회차',
  recurring: '정기 지급',
}

/** 금액을 이루는 지출 조건을 거래 조회 조건으로 옮긴다 (월 흐름표 줄 필터, T059). */
export function lineFiltersFor(filters: SpendCubeFilters): Pick<TransactionListParams, 'flow_row' | 'payment_form' | 'adjustability'> {
  const flowRow: FlowRowKey | undefined =
    filters.flow_row ?? (filters.commitment_kind ? (`committed_${filters.commitment_kind}` as FlowRowKey) : undefined)
  return {
    ...(flowRow ? { flow_row: flowRow } : {}),
    ...(filters.payment_form ? { payment_form: filters.payment_form } : {}),
    ...(filters.adjustability ? { adjustability: filters.adjustability } : {}),
  }
}
