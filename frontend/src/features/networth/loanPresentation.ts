import type { LoanItem } from '../../types/asset'

const MISSING_REASON_LABELS: Record<string, string> = {
  recalculation_required: '추정값을 다시 계산해야 합니다. 자동 추정으로 전환해 갱신하세요',
  no_linked_transactions: '연결된 상환 거래가 없습니다',
  insufficient_observations: '완료월 관측이 부족합니다',
  current_month_excluded: '진행월 거래만 있어 완료월을 기다립니다',
  no_observations_in_window: '산정 기간 안에 완료월 상환 거래가 없습니다',
  manual_value_missing: '수동 금액이 비어 있습니다. 자동 추정으로 전환하거나 금액을 입력하세요',
}

export function monthlyPaymentSourceLabel(loan: LoanItem): string {
  if (loan.monthly_payment_source === 'manual') return '수동 입력'
  if (loan.monthly_payment_source === 'estimated_from_linked_transactions') return '연결 거래 자동 추정'
  return loan.monthly_payment != null ? '출처 미확인' : '자동 추정 대기'
}

export function monthlyPaymentMissingLabel(loan: LoanItem): string | null {
  if (loan.monthly_payment_missing_reason) return MISSING_REASON_LABELS[loan.monthly_payment_missing_reason] ?? '월상환액 산정 근거가 부족합니다'
  return loan.monthly_payment == null ? '연결 거래와 완료월 관측을 확인하세요' : null
}

export function monthlyPaymentEvidence(loan: LoanItem): string[] {
  const evidence: string[] = []
  if (loan.monthly_payment_estimate_basis === 'median_closed_month_linked_repayments') evidence.push('완료월별 상환액 중앙값')
  if (loan.monthly_payment_estimate_basis === 'mean_recent_three_closed_month_linked_repayments') evidence.push('최근 완료월 3개월 상환액 평균')
  if (loan.monthly_payment_estimate_window_start && loan.monthly_payment_estimate_window_end) evidence.push(`산정 기간 ${loan.monthly_payment_estimate_window_start} ~ ${loan.monthly_payment_estimate_window_end}`)
  if (loan.monthly_payment_observation_months) evidence.push(`관측 ${loan.monthly_payment_observation_months.length}개월${loan.monthly_payment_min_observations != null ? ` / 최소 ${loan.monthly_payment_min_observations}개월` : ''}${loan.monthly_payment_observation_months.length ? ` (${loan.monthly_payment_observation_months.join(', ')})` : ''}`)
  return evidence
}
