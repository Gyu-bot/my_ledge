// 분류 축(Implentation-plan.md 2.2)과 약정 속성의 화면 표기. 영어 키를 화면에 내지 않는다.

import type {
  AdjustabilitySource,
  CommitmentAmountKind,
  CommitmentCycle,
  CommitmentKind,
  CommitmentScope,
  NatureOrigin,
  ResolvedAdjustability,
  TransferPurposeValue,
} from '../../types/nature'

export const ADJUSTABILITY_TEXT: Record<ResolvedAdjustability, string> = {
  protected: '보호',
  adjustable: '조정 가능',
  undecided: '미정',
  not_applicable: '해당 없음',
}

/** 조정 가능성의 뜻 — 버튼·선택지 옆 설명 */
export const ADJUSTABILITY_HELP: Record<'protected' | 'adjustable', string> = {
  protected: '줄일 수 없거나 줄이지 않기로 한 지출',
  adjustable: '줄일 수 있는 지출',
}

export const ADJUSTABILITY_SOURCE_TEXT: Record<AdjustabilitySource, string> = {
  fixed_loan: '대출에 연결된 거래라 끝날 때까지 보호',
  fixed_installment: '할부에 연결된 거래라 끝날 때까지 보호',
  transaction: '이 거래에서 직접 정한 값',
  commitment: '정기 지급 묶음에서 정한 값',
  category_default: '카테고리 기본값',
  none: '아직 아무 단계에서도 정하지 않음',
  not_applicable: '수입·이체는 묻지 않음',
}

export const COMMITMENT_KIND_TEXT: Record<CommitmentKind, string> = {
  loan: '대출',
  installment: '할부',
  recurring: '정기 지급',
}

export const CYCLE_TEXT: Record<CommitmentCycle, string> = {
  monthly: '매월',
  yearly: '매년',
  n_times: '정해진 횟수',
}

export const AMOUNT_KIND_TEXT: Record<CommitmentAmountKind, string> = {
  fixed: '금액 같음',
  variable: '금액 달라짐',
}

export const SCOPE_TEXT: Record<CommitmentScope, string> = {
  merchant: '거래처 단위',
  category: '카테고리 단위',
}

export const ORIGIN_TEXT: Record<NatureOrigin, string> = {
  user: '직접 등록',
  migration: '예전 분류에서 옮김',
  legacy_edit: '예전 화면에서 생김',
}

export const TRANSFER_PURPOSE_TEXT: Record<TransferPurposeValue | 'undecided', string> = {
  investment: '투자',
  savings: '저축',
  internal_move: '그 밖의 계좌 간 이동',
  undecided: '목적 미정',
}

export function categoryText(major: string | null | undefined, minor: string | null | undefined): string {
  if (!major) return '미분류'
  return minor ? `${major} / ${minor}` : major
}
