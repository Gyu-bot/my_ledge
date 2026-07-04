import type {
  AnalyticsSettingsPatchRequest,
  AnalyticsSettingsSection,
  PurchaseGateCandidateType,
} from '../../types/settings'
import {
  patchAssetList,
  patchPurchaseList,
  patchPurchaseRatio,
  patchRecurringRatio,
  patchVelocityList,
  patchVelocityRatio,
  sameList,
  toPercentString,
} from './analyticsSettingsPatchHelpers'

export type AnalyticsDraft = {
  readonly purchase_gate: {
    readonly large_purchase_threshold: string
    readonly min_candidate_amount: string
    readonly new_merchant_lookback_months: string
    readonly merchant_spike_ratio: string
    readonly discretionary_spike_ratio: string
    readonly review_cooldown_days: string
    readonly candidate_risk_threshold: string
    readonly enabled_candidate_types: readonly PurchaseGateCandidateType[]
    readonly excluded_category_names: string
    readonly excluded_merchants: string
  }
  readonly discretionary_velocity: {
    readonly baseline_months: string
    readonly outlier_policy: string
    readonly warning_velocity_ratio: string
    readonly high_velocity_ratio: string
    readonly minimum_classification_coverage: string
    readonly baseline_mode: string
    readonly excluded_category_names: string
    readonly excluded_merchants: string
  }
  readonly recurring_dry_run: {
    readonly min_occurrences: string
    readonly min_distinct_months: string
    readonly min_distinct_days: string
    readonly max_amount_cv: string
    readonly monthly_interval_days_min: string
    readonly monthly_interval_days_max: string
    readonly weekly_interval_days_min: string
    readonly weekly_interval_days_max: string
    readonly minimum_confidence: string
    readonly default_apply_scope: string
    readonly upload_auto_apply: boolean
  }
  readonly asset_liability_health: {
    readonly emergency_fund_included_tiers: string
    readonly show_near_liquid_as_secondary: boolean
    readonly monthly_payment_estimate_lookback_months: string
    readonly monthly_payment_min_observations: string
    readonly debt_payment_confidence_requires_user_confirmation: boolean
  }
}

export const CANDIDATE_TYPES = ['large_oneoff', 'new_merchant', 'merchant_spike', 'discretionary_spike'] as const
export const CANDIDATE_LABELS: Record<PurchaseGateCandidateType, string> = {
  large_oneoff: '대형 단발 구매',
  new_merchant: '신규 가맹점',
  merchant_spike: '가맹점 급증',
  discretionary_spike: '재량 지출 급증',
}

export function toAnalyticsDraft(effective: AnalyticsSettingsSection): AnalyticsDraft {
  return {
    purchase_gate: {
      large_purchase_threshold: String(effective.purchase_gate.large_purchase_threshold),
      min_candidate_amount: String(effective.purchase_gate.min_candidate_amount),
      new_merchant_lookback_months: String(effective.purchase_gate.new_merchant_lookback_months),
      merchant_spike_ratio: toPercentString(effective.purchase_gate.merchant_spike_ratio),
      discretionary_spike_ratio: toPercentString(effective.purchase_gate.discretionary_spike_ratio),
      review_cooldown_days: String(effective.purchase_gate.review_cooldown_days),
      candidate_risk_threshold: effective.purchase_gate.candidate_risk_threshold,
      enabled_candidate_types: effective.purchase_gate.enabled_candidate_types,
      excluded_category_names: formatList(effective.purchase_gate.excluded_category_names),
      excluded_merchants: formatList(effective.purchase_gate.excluded_merchants),
    },
    discretionary_velocity: {
      baseline_months: String(effective.discretionary_velocity.baseline_months),
      outlier_policy: effective.discretionary_velocity.outlier_policy,
      warning_velocity_ratio: toPercentString(effective.discretionary_velocity.warning_velocity_ratio),
      high_velocity_ratio: toPercentString(effective.discretionary_velocity.high_velocity_ratio),
      minimum_classification_coverage: toPercentString(effective.discretionary_velocity.minimum_classification_coverage),
      baseline_mode: effective.discretionary_velocity.baseline_mode,
      excluded_category_names: formatList(effective.discretionary_velocity.excluded_category_names),
      excluded_merchants: formatList(effective.discretionary_velocity.excluded_merchants),
    },
    recurring_dry_run: {
      min_occurrences: String(effective.recurring_dry_run.min_occurrences),
      min_distinct_months: String(effective.recurring_dry_run.min_distinct_months),
      min_distinct_days: String(effective.recurring_dry_run.min_distinct_days),
      max_amount_cv: toPercentString(effective.recurring_dry_run.max_amount_cv),
      monthly_interval_days_min: String(effective.recurring_dry_run.monthly_interval_days_min),
      monthly_interval_days_max: String(effective.recurring_dry_run.monthly_interval_days_max),
      weekly_interval_days_min: String(effective.recurring_dry_run.weekly_interval_days_min),
      weekly_interval_days_max: String(effective.recurring_dry_run.weekly_interval_days_max),
      minimum_confidence: toPercentString(effective.recurring_dry_run.minimum_confidence),
      default_apply_scope: effective.recurring_dry_run.default_apply_scope,
      upload_auto_apply: effective.recurring_dry_run.upload_auto_apply,
    },
    asset_liability_health: {
      emergency_fund_included_tiers: formatList(effective.asset_liability_health.emergency_fund_included_tiers),
      show_near_liquid_as_secondary: effective.asset_liability_health.show_near_liquid_as_secondary,
      monthly_payment_estimate_lookback_months: String(effective.asset_liability_health.monthly_payment_estimate_lookback_months),
      monthly_payment_min_observations: String(effective.asset_liability_health.monthly_payment_min_observations),
      debt_payment_confidence_requires_user_confirmation: effective.asset_liability_health.debt_payment_confidence_requires_user_confirmation,
    },
  }
}

export function buildAnalyticsPatch(draft: AnalyticsDraft, effective: AnalyticsSettingsSection, errors: string[]): AnalyticsSettingsPatchRequest {
  const largeThreshold = parseDraftNumber(draft.purchase_gate.large_purchase_threshold, { label: '대형 구매 기준', min: 0, integer: true, unit: 'won' }, errors)
  const minCandidate = parseDraftNumber(draft.purchase_gate.min_candidate_amount, { label: '최소 후보 금액', min: 0, integer: true, unit: 'won' }, errors)
  const lookback = parseDraftNumber(draft.purchase_gate.new_merchant_lookback_months, { label: '신규 가맹점 lookback', min: 1, max: 24, integer: true }, errors)
  const merchantSpike = parseDraftNumber(draft.purchase_gate.merchant_spike_ratio, { label: '가맹점 급증 기준', min: 0, unit: 'percent' }, errors)
  const discretionarySpike = parseDraftNumber(draft.purchase_gate.discretionary_spike_ratio, { label: '재량 지출 급증 기준', min: 0, unit: 'percent' }, errors)
  const cooldown = parseDraftNumber(draft.purchase_gate.review_cooldown_days, { label: '리뷰 cooldown', min: 0, max: 365, integer: true }, errors)
  const velocityMonths = parseDraftNumber(draft.discretionary_velocity.baseline_months, { label: '재량 기준 기간', min: 1, max: 12, integer: true }, errors)
  const warningVelocity = parseDraftNumber(draft.discretionary_velocity.warning_velocity_ratio, { label: '재량 속도 경고', min: 0, unit: 'percent' }, errors)
  const highVelocity = parseDraftNumber(draft.discretionary_velocity.high_velocity_ratio, { label: '재량 속도 높음', min: 0, unit: 'percent' }, errors)
  const coverage = parseDraftNumber(draft.discretionary_velocity.minimum_classification_coverage, { label: '분류 커버리지 최소값', min: 0, max: 100, unit: 'percent' }, errors)
  const recurringOccurrences = parseDraftNumber(draft.recurring_dry_run.min_occurrences, { label: '최소 반복 횟수', min: 2, integer: true }, errors)
  const recurringMonths = parseDraftNumber(draft.recurring_dry_run.min_distinct_months, { label: '최소 반복 월수', min: 1, integer: true }, errors)
  const recurringDays = parseDraftNumber(draft.recurring_dry_run.min_distinct_days, { label: '최소 반복 일수', min: 1, integer: true }, errors)
  const amountCv = parseDraftNumber(draft.recurring_dry_run.max_amount_cv, { label: '금액 변동계수 최대', min: 0, unit: 'percent' }, errors)
  const monthlyMin = parseDraftNumber(draft.recurring_dry_run.monthly_interval_days_min, { label: '월간 간격 최소', min: 1, integer: true }, errors)
  const monthlyMax = parseDraftNumber(draft.recurring_dry_run.monthly_interval_days_max, { label: '월간 간격 최대', min: 1, integer: true }, errors)
  const weeklyMin = parseDraftNumber(draft.recurring_dry_run.weekly_interval_days_min, { label: '주간 간격 최소', min: 1, integer: true }, errors)
  const weeklyMax = parseDraftNumber(draft.recurring_dry_run.weekly_interval_days_max, { label: '주간 간격 최대', min: 1, integer: true }, errors)
  const confidence = parseDraftNumber(draft.recurring_dry_run.minimum_confidence, { label: '반복 신뢰도 최소', min: 0, max: 100, unit: 'percent' }, errors)
  const paymentLookback = parseDraftNumber(draft.asset_liability_health.monthly_payment_estimate_lookback_months, { label: '월상환 추정 lookback', min: 1, max: 24, integer: true }, errors)
  const paymentObservations = parseDraftNumber(draft.asset_liability_health.monthly_payment_min_observations, { label: '월상환 최소 관측', min: 1, integer: true }, errors)
  if (errors.length > 0) return {}

  const purchaseGate = {
    ...(largeThreshold !== effective.purchase_gate.large_purchase_threshold ? { large_purchase_threshold: largeThreshold } : {}),
    ...(minCandidate !== effective.purchase_gate.min_candidate_amount ? { min_candidate_amount: minCandidate } : {}),
    ...(lookback !== effective.purchase_gate.new_merchant_lookback_months ? { new_merchant_lookback_months: lookback } : {}),
    ...patchPurchaseRatio('merchant_spike_ratio', merchantSpike, effective.purchase_gate.merchant_spike_ratio),
    ...patchPurchaseRatio('discretionary_spike_ratio', discretionarySpike, effective.purchase_gate.discretionary_spike_ratio),
    ...(cooldown !== effective.purchase_gate.review_cooldown_days ? { review_cooldown_days: cooldown } : {}),
    ...(draft.purchase_gate.candidate_risk_threshold !== effective.purchase_gate.candidate_risk_threshold ? { candidate_risk_threshold: draft.purchase_gate.candidate_risk_threshold } : {}),
    ...(!sameList(draft.purchase_gate.enabled_candidate_types, effective.purchase_gate.enabled_candidate_types) ? { enabled_candidate_types: draft.purchase_gate.enabled_candidate_types } : {}),
    ...patchPurchaseList('excluded_category_names', draft.purchase_gate.excluded_category_names, effective.purchase_gate.excluded_category_names),
    ...patchPurchaseList('excluded_merchants', draft.purchase_gate.excluded_merchants, effective.purchase_gate.excluded_merchants),
  }
  const velocity = {
    ...(velocityMonths !== effective.discretionary_velocity.baseline_months ? { baseline_months: velocityMonths } : {}),
    ...(draft.discretionary_velocity.outlier_policy !== effective.discretionary_velocity.outlier_policy ? { outlier_policy: draft.discretionary_velocity.outlier_policy } : {}),
    ...patchVelocityRatio('warning_velocity_ratio', warningVelocity, effective.discretionary_velocity.warning_velocity_ratio),
    ...patchVelocityRatio('high_velocity_ratio', highVelocity, effective.discretionary_velocity.high_velocity_ratio),
    ...patchVelocityRatio('minimum_classification_coverage', coverage, effective.discretionary_velocity.minimum_classification_coverage),
    ...(draft.discretionary_velocity.baseline_mode !== effective.discretionary_velocity.baseline_mode ? { baseline_mode: draft.discretionary_velocity.baseline_mode } : {}),
    ...patchVelocityList('excluded_category_names', draft.discretionary_velocity.excluded_category_names, effective.discretionary_velocity.excluded_category_names),
    ...patchVelocityList('excluded_merchants', draft.discretionary_velocity.excluded_merchants, effective.discretionary_velocity.excluded_merchants),
  }
  const recurring = {
    ...(recurringOccurrences !== effective.recurring_dry_run.min_occurrences ? { min_occurrences: recurringOccurrences } : {}),
    ...(recurringMonths !== effective.recurring_dry_run.min_distinct_months ? { min_distinct_months: recurringMonths } : {}),
    ...(recurringDays !== effective.recurring_dry_run.min_distinct_days ? { min_distinct_days: recurringDays } : {}),
    ...patchRecurringRatio('max_amount_cv', amountCv, effective.recurring_dry_run.max_amount_cv),
    ...(monthlyMin !== effective.recurring_dry_run.monthly_interval_days_min ? { monthly_interval_days_min: monthlyMin } : {}),
    ...(monthlyMax !== effective.recurring_dry_run.monthly_interval_days_max ? { monthly_interval_days_max: monthlyMax } : {}),
    ...(weeklyMin !== effective.recurring_dry_run.weekly_interval_days_min ? { weekly_interval_days_min: weeklyMin } : {}),
    ...(weeklyMax !== effective.recurring_dry_run.weekly_interval_days_max ? { weekly_interval_days_max: weeklyMax } : {}),
    ...patchRecurringRatio('minimum_confidence', confidence, effective.recurring_dry_run.minimum_confidence),
    ...(draft.recurring_dry_run.default_apply_scope !== effective.recurring_dry_run.default_apply_scope ? { default_apply_scope: draft.recurring_dry_run.default_apply_scope } : {}),
    ...(draft.recurring_dry_run.upload_auto_apply !== effective.recurring_dry_run.upload_auto_apply ? { upload_auto_apply: draft.recurring_dry_run.upload_auto_apply } : {}),
  }
  const asset = {
    ...patchAssetList(draft.asset_liability_health.emergency_fund_included_tiers, effective.asset_liability_health.emergency_fund_included_tiers),
    ...(draft.asset_liability_health.show_near_liquid_as_secondary !== effective.asset_liability_health.show_near_liquid_as_secondary ? { show_near_liquid_as_secondary: draft.asset_liability_health.show_near_liquid_as_secondary } : {}),
    ...(paymentLookback !== effective.asset_liability_health.monthly_payment_estimate_lookback_months ? { monthly_payment_estimate_lookback_months: paymentLookback } : {}),
    ...(paymentObservations !== effective.asset_liability_health.monthly_payment_min_observations ? { monthly_payment_min_observations: paymentObservations } : {}),
    ...(draft.asset_liability_health.debt_payment_confidence_requires_user_confirmation !== effective.asset_liability_health.debt_payment_confidence_requires_user_confirmation ? { debt_payment_confidence_requires_user_confirmation: draft.asset_liability_health.debt_payment_confidence_requires_user_confirmation } : {}),
  }
  return {
    ...(Object.keys(purchaseGate).length > 0 ? { purchase_gate: purchaseGate } : {}),
    ...(Object.keys(velocity).length > 0 ? { discretionary_velocity: velocity } : {}),
    ...(Object.keys(recurring).length > 0 ? { recurring_dry_run: recurring } : {}),
    ...(Object.keys(asset).length > 0 ? { asset_liability_health: asset } : {}),
  }
}

type NumberRule = { readonly label: string; readonly min: number; readonly max?: number; readonly integer?: boolean; readonly unit?: 'percent' | 'won' }

function parseDraftNumber(value: string, rule: NumberRule, errors: string[]): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) { errors.push(`${rule.label}은 숫자여야 합니다`); return null }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || (rule.integer && !Number.isInteger(parsed))) { errors.push(`${rule.label}은 숫자여야 합니다`); return null }
  const suffix = rule.unit === 'percent' ? '%' : rule.unit === 'won' ? '원' : ''
  if (parsed < rule.min || (rule.max != null && parsed > rule.max)) errors.push(rule.max != null ? `${rule.label}은 ${rule.min}~${rule.max}${suffix} 사이여야 합니다` : `${rule.label}은 ${rule.min}${suffix} 이상이어야 합니다`)
  return parsed
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}

export function formatRatio(value: number): string {
  return `${toPercentString(value)}%`
}

export function formatText(value: string): string {
  return value || '미설정'
}

export function formatList(values: readonly string[]): string {
  return values.join(', ')
}

export function formatListDisplay(values: readonly string[]): string {
  return values.length === 0 ? '없음' : formatList(values)
}

type TripleValue<T> = { readonly defaults: T; readonly saved: T | null; readonly effective: T; readonly format: (value: T) => string }

export function triple<T>({ defaults, saved, effective, format }: TripleValue<T>): string {
  return `기본 ${format(defaults)} · 저장 ${saved == null ? '미설정' : format(saved)} · 적용 ${format(effective)}`
}
