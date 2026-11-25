// 재무상태(T061) 화면 문구. 영어 키를 화면에 내지 않고, 이유는 응답의 구조화된 값에서
// 쉬운 말로 만든다(응답의 설명 문장에는 내부 이름이 섞여 있다). 금액을 새로 계산하지 않는다.

import type { BadgeVariant } from '../../ds/Badge'
import { formatNetWon } from '../../ds/format'
import type {
  EmergencyFundResponse,
  KindPairStatus,
  NetWorthReconciliationResponse,
  ReconciliationStatus,
  SnapshotKindPair,
} from '../../types/netWorth'
import { formatDateKo, formatPeriodKo } from '../analysis/periods'
import { sharePct } from '../analysis/text'

export const STATUS_TEXT: Record<ReconciliationStatus, { label: string; description: string; variant: BadgeVariant }> = {
  complete: {
    label: '대조 완료',
    description: '모든 항목을 기록에서 계산했습니다.',
    variant: 'accent',
  },
  incomplete_classification: {
    label: '분류가 덜 됨',
    description: '목적이 정해지지 않은 이체가 있습니다. 그만큼 투자 평가 변동과 설명되지 않는 차이가 실제와 다를 수 있습니다.',
    variant: 'warn',
  },
  transactions_not_covered: {
    label: '거래가 구간을 덮지 않음',
    description: '거래 기록이 이 구간 전체에 걸쳐 있지 않아 설명되지 않는 차이를 내지 않았습니다.',
    variant: 'warn',
  },
  snapshot_dates_mismatched: {
    label: '스냅샷 날짜가 맞지 않음',
    description: '대출이나 투자 스냅샷 날짜가 자산 스냅샷 날짜와 달라 그 항목과 설명되지 않는 차이를 내지 않았습니다. 가까운 날짜로 맞추지 않습니다.',
    variant: 'warn',
  },
  incomplete_snapshot_values: {
    label: '스냅샷 값 누락',
    description: '대출 잔액 또는 투자 평가액이 누락되어 해당 항목과 설명되지 않는 차이를 보류했습니다.',
    variant: 'warn',
  },
  no_snapshot_pair: {
    label: '스냅샷 쌍 없음',
    description: '자산 스냅샷이 두 날짜 이상 있어야 구간을 비교할 수 있습니다.',
    variant: 'neutral',
  },
}

export const KIND_TEXT: Record<SnapshotKindPair['kind'], string> = {
  loans: '대출',
  investments: '투자',
}

export const PAIR_STATUS_TEXT: Record<KindPairStatus, string> = {
  observed: '두 날짜 모두 있음',
  absent: '이 종류의 스냅샷이 없음 (양 끝 0원)',
  mismatched: '날짜가 맞지 않음',
  incomplete: '스냅샷 값 누락',
}

/** 상태의 이유 — 응답의 구조화된 값(종류별 날짜, 거래 범위, 이체 미정 금액)에서 만든다. */
export function reconciliationReasons(data: NetWorthReconciliationResponse, assetSnapshotCount: number | null): string[] {
  if (data.status === 'no_snapshot_pair' || !data.interval) {
    return [
      assetSnapshotCount != null
        ? `자산 스냅샷 날짜가 ${assetSnapshotCount}개뿐이라 두 날짜 사이를 비교할 수 없습니다. 다른 날짜의 내보내기 파일을 가져오면 구간이 생깁니다.`
        : '자산 스냅샷 날짜가 두 개 이상 있어야 구간을 비교할 수 있습니다.',
    ]
  }
  const interval = data.interval
  const reasons: string[] = []
  for (const kind of data.kinds) {
    const name = KIND_TEXT[kind.kind]
    if (kind.pair_status === 'mismatched') {
      reasons.push(
        `${name} 스냅샷 날짜가 구간과 다릅니다. 시작일(${interval.start_snapshot_date})에는 ${kind.start_as_of ?? '없음'}, 끝 날(${interval.end_snapshot_date})에는 ${kind.end_as_of ?? '없음'} 스냅샷이 가장 가깝습니다. 맞추지 않고 이 항목을 비워 둡니다.`,
      )
    } else if (kind.pair_status === 'absent') {
      reasons.push(`${name} 스냅샷이 한 번도 없어 양 끝을 0원으로 두었습니다.`)
    }
    if (kind.missing_value_row_count > 0) {
      reasons.push(`${name} 스냅샷에서 값이 비어 있는 항목이 ${kind.missing_value_row_count}개 있어 차이를 보류했습니다.`)
    }
  }
  const coverage = data.transactions
  if (coverage && !coverage.covered) {
    if (!coverage.first_transaction_date) {
      reasons.push('가져온 거래가 없습니다.')
    } else if (coverage.first_transaction_date > interval.transaction_start_date) {
      reasons.push(`거래 기록이 ${formatDateKo(coverage.first_transaction_date)}부터 있어 구간 첫날(${formatDateKo(interval.transaction_start_date)})을 덮지 않습니다.`)
    }
    if (coverage.transaction_as_of && coverage.transaction_as_of < interval.transaction_end_date) {
      reasons.push(`거래 기준일(${formatDateKo(coverage.transaction_as_of)})이 끝 스냅샷일(${formatDateKo(interval.transaction_end_date)})보다 앞섭니다.`)
    }
    if (coverage.periods_without_data.length > 0) {
      reasons.push(`거래가 하나도 없는 달이 구간에 있습니다: ${coverage.periods_without_data.map(formatPeriodKo).join(', ')}.`)
    }
  }
  const transfers = data.transfers
  if (transfers && transfers.undecided_activity_total > 0) {
    reasons.push(
      `목적이 정해지지 않은 이체가 이체 금액의 ${sharePct(transfers.undecided_share)}입니다 (${formatNetWon(transfers.undecided_activity_total)} / ${formatNetWon(transfers.activity_total)}).`,
    )
  }
  if (coverage && coverage.non_krw_transaction_count > 0) {
    reasons.push(`원화가 아닌 거래 ${coverage.non_krw_transaction_count}건은 더하지 않았습니다.`)
  }
  return reasons
}

/** 보류된 항목의 이유 */
export function withheldKindReason(kind: SnapshotKindPair | undefined): string {
  if (!kind) return '이 종류의 스냅샷 정보가 응답에 없습니다.'
  if (kind.pair_status === 'incomplete') {
    return `${KIND_TEXT[kind.kind]} 스냅샷에 값이 비어 있는 항목이 있어 계산을 보류했습니다.`
  }
  return `${KIND_TEXT[kind.kind]} 스냅샷 날짜가 구간과 맞지 않아 계산하지 않았습니다.`
}

export function withheldUnexplainedReason(status: ReconciliationStatus): string {
  if (status === 'incomplete_snapshot_values') return '대출 잔액 또는 투자 평가액이 누락되어 계산을 보류했습니다.'
  if (status === 'snapshot_dates_mismatched') return '스냅샷 날짜가 종류마다 맞지 않아 계산하지 않았습니다.'
  if (status === 'transactions_not_covered') return '거래 기록이 구간을 덮지 않아 계산하지 않았습니다. 빈 곳을 추정으로 채우지 않습니다.'
  return '계산에 필요한 항목이 비어 있어 내지 않았습니다.'
}

export function hasUndecidedExpenses(data: EmergencyFundResponse): boolean {
  return (data.adjustability_undecided_transaction_count ?? 0) > 0
    || data.status === 'incomplete_classification'
    || (data.adjustability_undecided_share ?? 0) !== 0
}

export function emergencyFundReasons(data: EmergencyFundResponse, transactionAsOf: string | null): string[] {
  const reasons: string[] = []
  if (data.status === 'no_asset_snapshot') reasons.push('자산 스냅샷이 없어 현금성 자산을 알 수 없습니다.')
  if (data.status === 'no_baseline') {
    reasons.push(data.monthly_protected_outflow == null
      ? '기준으로 사용할 마감월이 없어 비상금 개월 수를 계산할 수 없습니다.'
      : `월 보호 지급 중앙값이 ${formatNetWon(data.monthly_protected_outflow)}으로 0원 이하라 비상금 개월 수를 계산할 수 없습니다.`)
  }
  if (hasUndecidedExpenses(data)) {
    const count = data.adjustability_undecided_transaction_count
    reasons.push(
      `기준 기간에 조정 가능성이 미정인 지출 거래가 ${count ? `${count}건 ` : ''}있습니다. 분류 결과에 따라 월 보호 지급과 비상금 개월 수가 달라질 수 있습니다.`,
    )
  }
  if ((data.cash_like_name_rule_total ?? 0) > 0) {
    reasons.push(
      `현금성 자산 중 ${formatNetWon(data.cash_like_name_rule_total ?? 0)}은 사람이 정한 유동성 정보가 없어 계좌 종류·이름으로 판단했습니다. 자산 메타에서 직접 정할 수 있습니다.`,
    )
  }
  if (data.asset_snapshot_date && transactionAsOf) {
    reasons.push(`자산 스냅샷 기준일(${formatDateKo(data.asset_snapshot_date)})과 거래 기준일(${formatDateKo(transactionAsOf)})은 서로 다를 수 있어 따로 적습니다.`)
  }
  return reasons
}

export function baselineText(data: EmergencyFundResponse): string {
  const baseline = data.baseline
  if (baseline.periods.length === 0) return '기준 기간 없음'
  const first = baseline.periods[0]
  const last = baseline.periods[baseline.periods.length - 1]
  const range = first === last ? formatPeriodKo(first) : `${formatPeriodKo(first)} ~ ${formatPeriodKo(last)}`
  const parts = [`${range} 마감월 ${baseline.month_count}개의 중앙값`]
  if (baseline.month_count < baseline.months_requested) {
    if (baseline.limited_by === 'data_start') parts.push(`자료가 있는 완전한 마감월이 ${baseline.months_requested}개월보다 적습니다`)
    else if (baseline.limited_by === 'baseline_start_date') parts.push(`설정한 기준 구간 시작일(${formatDateKo(baseline.baseline_start_date)}) 이후만 썼습니다`)
  }
  if (baseline.skipped_periods.length > 0) parts.push(`자료 없는 달 제외: ${baseline.skipped_periods.map(formatPeriodKo).join(', ')}`)
  return parts.join(' · ')
}
