import type {
  AssetLiabilityHealthSettingsPatch,
  DiscretionaryVelocitySettingsPatch,
  PurchaseGateSettingsPatch,
  RecurringDryRunSettingsPatch,
} from '../../types/settings'

const PERCENT_DISPLAY_DECIMALS = 2

type PurchaseRatioKey = 'merchant_spike_ratio' | 'discretionary_spike_ratio'
type VelocityRatioKey = 'warning_velocity_ratio' | 'high_velocity_ratio' | 'minimum_classification_coverage'
type RecurringRatioKey = 'max_amount_cv' | 'minimum_confidence'
type SharedListKey = 'excluded_category_names' | 'excluded_merchants'

export function toPercentString(value: number): string {
  return formatDecimal(value * 100, PERCENT_DISPLAY_DECIMALS)
}

export function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function patchPurchaseRatio(key: PurchaseRatioKey, draftPercent: number | null, effectiveRatio: number): PurchaseGateSettingsPatch {
  if (draftPercent === displayedPercent(effectiveRatio)) return {}
  const value = percentToRatio(draftPercent)
  switch (key) {
    case 'merchant_spike_ratio': return { merchant_spike_ratio: value }
    case 'discretionary_spike_ratio': return { discretionary_spike_ratio: value }
  }
}

export function patchVelocityRatio(key: VelocityRatioKey, draftPercent: number | null, effectiveRatio: number): DiscretionaryVelocitySettingsPatch {
  if (draftPercent === displayedPercent(effectiveRatio)) return {}
  const value = percentToRatio(draftPercent)
  switch (key) {
    case 'warning_velocity_ratio': return { warning_velocity_ratio: value }
    case 'high_velocity_ratio': return { high_velocity_ratio: value }
    case 'minimum_classification_coverage': return { minimum_classification_coverage: value }
  }
}

export function patchRecurringRatio(key: RecurringRatioKey, draftPercent: number | null, effectiveRatio: number): RecurringDryRunSettingsPatch {
  if (draftPercent === displayedPercent(effectiveRatio)) return {}
  const value = percentToRatio(draftPercent)
  switch (key) {
    case 'max_amount_cv': return { max_amount_cv: value }
    case 'minimum_confidence': return { minimum_confidence: value }
  }
}

export function patchPurchaseList(key: SharedListKey, draftValue: string, effectiveValue: readonly string[]): PurchaseGateSettingsPatch {
  const parsed = parseList(draftValue)
  if (sameList(parsed, effectiveValue)) return {}
  switch (key) {
    case 'excluded_category_names': return { excluded_category_names: parsed }
    case 'excluded_merchants': return { excluded_merchants: parsed }
  }
}

export function patchVelocityList(key: SharedListKey, draftValue: string, effectiveValue: readonly string[]): DiscretionaryVelocitySettingsPatch {
  const parsed = parseList(draftValue)
  if (sameList(parsed, effectiveValue)) return {}
  switch (key) {
    case 'excluded_category_names': return { excluded_category_names: parsed }
    case 'excluded_merchants': return { excluded_merchants: parsed }
  }
}

export function patchAssetList(draftValue: string, effectiveValue: readonly string[]): AssetLiabilityHealthSettingsPatch {
  const parsed = parseList(draftValue)
  return sameList(parsed, effectiveValue) ? {} : { emergency_fund_included_tiers: parsed }
}

function formatDecimal(value: number, maximumFractionDigits: number): string {
  return value.toFixed(maximumFractionDigits).replace(/\.?0+$/, '')
}

function percentToRatio(value: number | null): number | null {
  return value == null ? null : value / 100
}

function displayedPercent(value: number): number {
  return Number(toPercentString(value))
}

function parseList(value: string): readonly string[] {
  return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
}
