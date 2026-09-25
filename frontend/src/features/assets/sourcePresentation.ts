import { formatNetWon } from '../../ds/format'
import type { InvestmentSource } from '../../types/sourcePolicy'

export const SOURCE_LABEL: Record<InvestmentSource, string> = {
  banksalad_snapshot: '뱅크샐러드 스냅샷',
  toss_securities_api: '토스증권 API',
}

export function sourceMoney(value: string | null) {
  if (value == null || !Number.isFinite(Number(value))) return '산출 불가'
  return formatNetWon(Number(value))
}

export function sourceTime(value: string | null, precision: 'date' | 'timestamp' = 'timestamp') {
  if (!value) return '정보 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  if (precision === 'date') return `${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)} (날짜 기준)`
  return `${new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)} KST`
}

const REASON_LABEL: Record<string, string> = {
  account_mapping_required: '토스증권 계좌와 뱅샐 계좌 그룹의 연결 확인이 필요합니다.',
  account_mapping_ambiguous: '계좌 연결 범위를 확인해야 합니다.',
  unsupported_holdings_scope: '뱅샐 투자 그룹에 국내·미국 주식(ETF 포함) 외의 자산이 있어 토스 API로 대체하지 않고 뱅샐을 유지합니다.',
  no_successful_complete_run: '토스증권의 완전한 정상 수집 결과가 없어 뱅샐을 사용합니다.',
  missing_in_toss: '토스증권 정상 수집 결과가 없습니다.',
  instrument_mapping_ambiguous: '종목 식별 근거가 불충분합니다.',
  investment_total_incomplete: '투자 평가액은 확인된 항목의 소계입니다. 누락·식별·통화 문제로 전체 합계를 확정할 수 없습니다.',
  missing_valuation: '평가액이 없는 보유 항목이 있습니다.',
  provider_valuation_timestamp_unavailable: '토스가 평가 시각을 제공하지 않아 조회 시각 기준 추정값을 사용합니다.',
  currency_mismatch: '통화 기준이 달라 합산할 수 없습니다.',
  stale_comparison: '비교 대상 평가값이 오래되었습니다.',
  different_valuation_dates: '소스 사이의 평가 시점이 다릅니다.',
  value_difference: '소스 평가액에 차이가 있습니다. 평가 기준일도 함께 확인해 주세요.',
  net_worth_replacement_scope_unconfirmed: '자산 교체 범위 또는 예수금 범위가 확인되지 않아 추정 순자산을 산출할 수 없습니다.',
  unobserved_cross_account_transfers_possible: '조회 시점 사이의 계좌 이체가 중복 또는 누락되어 보일 수 있습니다.',
  current_estimate_not_confirmed_history_or_performance: '현재 값은 소스별 시점의 추정치이며 확정 이력이나 투자 성과가 아닙니다.',
  configured_source_fallback: '일부 계좌 그룹은 설정한 소스 대신 대체 소스를 사용합니다.',
  source_conflicts_require_review: '계좌 또는 종목의 확인 필요 사항을 검토해 주세요.',
  unmapped_external_accounts_excluded: '연결이 확인되지 않은 외부 계좌는 합산에서 제외했습니다.',
  latest_sync_failed: '최근 수집이 실패하여 마지막 완전한 정상 결과를 유지합니다.',
  latest_sync_success_partial: '최근 수집이 일부만 완료되어 마지막 완전한 정상 결과를 유지합니다.',
  latest_sync_pending: '최근 수집이 진행 중이어서 마지막 완전한 정상 결과를 유지합니다.',
  latest_sync_rejected: '최근 수집이 거절되어 마지막 완전한 정상 결과를 유지합니다.',
  preferred_source_unavailable: '선택한 소스의 정상 수집 결과가 없어 대체 소스를 사용합니다.',
  no_complete_run: '완전한 수집 결과가 없습니다.',
  source_unavailable: '선택한 소스 데이터가 없습니다.',
  stale: '평가 시점이 오래되었습니다.',
  mixed_dates: '자산별 평가 기준일이 다릅니다.',
  mixed_valuation_dates: '자산별 평가 기준일이 다릅니다.',
  transfer_timing_risk: '조회 시점 사이의 계좌 이체가 중복 또는 누락되어 보일 수 있습니다.',
  toss_adapter_not_implemented: '토스증권 API 연결은 아직 제공되지 않습니다.',
}

export function sourceReason(reason: string) { return REASON_LABEL[reason] ?? reason }

export function sourceBasis(value: string | undefined) {
  return ({ account_override: '계좌 그룹별 예외', investment_default: '토스증권 투자 기본값', global_default: '전체 기본값' } as Record<string, string>)[value ?? ''] ?? '소스 정책'
}

export function syncStatus(value: string | null | undefined) {
  return ({ success_complete: '정상 완료', success_partial: '일부 완료', pending: '수집 중', failed: '실패', rejected: '거절' } as Record<string, string>)[value ?? ''] ?? '수집 이력 없음'
}
