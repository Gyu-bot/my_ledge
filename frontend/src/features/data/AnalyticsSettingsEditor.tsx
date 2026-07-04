import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Field, Select, TextInput, Toggle } from '../../ds/Field'
import { toast } from '../../ds/toastStore'
import type { AnalyticsSettingsPatchRequest, AnalyticsSettingsResponse, PurchaseGateCandidateType } from '../../types/settings'
import {
  CANDIDATE_LABELS,
  CANDIDATE_TYPES,
  buildAnalyticsPatch,
  formatListDisplay,
  formatNumber,
  formatRatio,
  formatText,
  toAnalyticsDraft,
  triple,
  type AnalyticsDraft,
} from './analyticsSettingsDraft'
import { SETTING_HELP, SettingHelpBubble, type SettingHelpKey } from './analyticsSettingsHelp'

type AnalyticsSettingsEditorProps = {
  readonly analytics: AnalyticsSettingsResponse
  readonly hasWrite: boolean
  readonly isPending: boolean
  readonly onSave: (payload: AnalyticsSettingsPatchRequest) => Promise<void>
}

export function AnalyticsSettingsEditor({ analytics, hasWrite, isPending, onSave }: AnalyticsSettingsEditorProps) {
  const [draft, setDraft] = useState<AnalyticsDraft>(() => toAnalyticsDraft(analytics.effective))
  const [isDirty, setIsDirty] = useState(false)
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([])
  const setDirtyDraft: Dispatch<SetStateAction<AnalyticsDraft>> = (value) => {
    setIsDirty(true)
    setDraft(value)
  }

  useEffect(() => {
    if (!isDirty) setDraft(toAnalyticsDraft(analytics.effective))
  }, [analytics.effective, isDirty])

  async function saveAnalytics() {
    const errors: string[] = []
    const payload = buildAnalyticsPatch(draft, analytics.effective, errors)
    setValidationErrors(errors)
    if (errors.length > 0) {
      toast.error('분석 설정 입력값을 확인하세요')
      return
    }
    if (Object.keys(payload).length === 0) {
      setIsDirty(false)
      toast.success('변경된 분석 설정이 없습니다')
      return
    }
    try {
      await onSave(payload)
    } catch (error) {
      if (error instanceof Error) return
      throw error
    }
    setIsDirty(false)
  }

  return (
    <Card
      title="분석 파라미터"
      meta="기본값 · 저장값 · 적용값을 확인하고 사용자 설정만 저장합니다"
      action={<Button variant="primary" disabled={!hasWrite || isPending} onClick={() => void saveAnalytics()}>분석 설정 저장</Button>}
    >
      {validationErrors.length > 0 ? (
        <div role="alert" className="mb-4 rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-caption text-warn">
          {validationErrors.map((message) => <div key={message}>{message}</div>)}
        </div>
      ) : null}
      <div className="grid gap-4">
        <section aria-labelledby="analytics-purchase-gate" className="rounded-md border border-border-subtle bg-bg-inset p-3">
          <h3 id="analytics-purchase-gate" className="text-label text-text-secondary">purchase_gate</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="대형 구매 기준 (원)" help={settingHelp('purchaseLargeThreshold', triple({ defaults: analytics.defaults.purchase_gate.large_purchase_threshold, saved: analytics.saved.purchase_gate.large_purchase_threshold, effective: analytics.effective.purchase_gate.large_purchase_threshold, format: formatNumber }))}><TextInput type="number" min={0} disabled={!hasWrite} value={draft.purchase_gate.large_purchase_threshold} onChange={(event) => updatePurchase(setDirtyDraft, { large_purchase_threshold: event.target.value })} /></Field>
            <Field label="최소 후보 금액 (원)" help={settingHelp('purchaseMinCandidate', triple({ defaults: analytics.defaults.purchase_gate.min_candidate_amount, saved: analytics.saved.purchase_gate.min_candidate_amount, effective: analytics.effective.purchase_gate.min_candidate_amount, format: formatNumber }))}><TextInput type="number" min={0} disabled={!hasWrite} value={draft.purchase_gate.min_candidate_amount} onChange={(event) => updatePurchase(setDirtyDraft, { min_candidate_amount: event.target.value })} /></Field>
            <Field label="신규 가맹점 lookback (개월)" help={settingHelp('purchaseNewMerchantLookback', triple({ defaults: analytics.defaults.purchase_gate.new_merchant_lookback_months, saved: analytics.saved.purchase_gate.new_merchant_lookback_months, effective: analytics.effective.purchase_gate.new_merchant_lookback_months, format: formatNumber }))}><TextInput type="number" min={1} max={24} disabled={!hasWrite} value={draft.purchase_gate.new_merchant_lookback_months} onChange={(event) => updatePurchase(setDirtyDraft, { new_merchant_lookback_months: event.target.value })} /></Field>
            <Field label="가맹점 급증 기준 (%)" help={settingHelp('purchaseMerchantSpike', triple({ defaults: analytics.defaults.purchase_gate.merchant_spike_ratio, saved: analytics.saved.purchase_gate.merchant_spike_ratio, effective: analytics.effective.purchase_gate.merchant_spike_ratio, format: formatRatio }))}><TextInput type="number" min={0} disabled={!hasWrite} value={draft.purchase_gate.merchant_spike_ratio} onChange={(event) => updatePurchase(setDirtyDraft, { merchant_spike_ratio: event.target.value })} /></Field>
            <Field label="재량 지출 급증 기준 (%)" help={settingHelp('purchaseDiscretionarySpike', triple({ defaults: analytics.defaults.purchase_gate.discretionary_spike_ratio, saved: analytics.saved.purchase_gate.discretionary_spike_ratio, effective: analytics.effective.purchase_gate.discretionary_spike_ratio, format: formatRatio }))}><TextInput type="number" min={0} disabled={!hasWrite} value={draft.purchase_gate.discretionary_spike_ratio} onChange={(event) => updatePurchase(setDirtyDraft, { discretionary_spike_ratio: event.target.value })} /></Field>
            <Field label="리뷰 cooldown (일)" help={settingHelp('purchaseReviewCooldown', triple({ defaults: analytics.defaults.purchase_gate.review_cooldown_days, saved: analytics.saved.purchase_gate.review_cooldown_days, effective: analytics.effective.purchase_gate.review_cooldown_days, format: formatNumber }))}><TextInput type="number" min={0} max={365} disabled={!hasWrite} value={draft.purchase_gate.review_cooldown_days} onChange={(event) => updatePurchase(setDirtyDraft, { review_cooldown_days: event.target.value })} /></Field>
            <Field label="후보 위험 임계값" help={settingHelp('purchaseRiskThreshold', triple({ defaults: analytics.defaults.purchase_gate.candidate_risk_threshold, saved: analytics.saved.purchase_gate.candidate_risk_threshold, effective: analytics.effective.purchase_gate.candidate_risk_threshold, format: formatText }))}>
              <Select disabled={!hasWrite} value={draft.purchase_gate.candidate_risk_threshold} onChange={(event) => updatePurchase(setDirtyDraft, { candidate_risk_threshold: event.target.value })}>
                <option value="watch">watch</option>
                <option value="warning">warning</option>
                <option value="high">high</option>
              </Select>
            </Field>
            <Field label="제외 카테고리" help={settingHelp('purchaseExcludedCategories', triple({ defaults: analytics.defaults.purchase_gate.excluded_category_names, saved: analytics.saved.purchase_gate.excluded_category_names, effective: analytics.effective.purchase_gate.excluded_category_names, format: formatListDisplay }))}><TextInput disabled={!hasWrite} value={draft.purchase_gate.excluded_category_names} onChange={(event) => updatePurchase(setDirtyDraft, { excluded_category_names: event.target.value })} /></Field>
            <Field label="제외 가맹점" help={settingHelp('purchaseExcludedMerchants', triple({ defaults: analytics.defaults.purchase_gate.excluded_merchants, saved: analytics.saved.purchase_gate.excluded_merchants, effective: analytics.effective.purchase_gate.excluded_merchants, format: formatListDisplay }))}><TextInput disabled={!hasWrite} value={draft.purchase_gate.excluded_merchants} onChange={(event) => updatePurchase(setDirtyDraft, { excluded_merchants: event.target.value })} /></Field>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-micro text-text-muted">
            <span>활성 후보 유형</span>
            {settingHelp('purchaseCandidateTypes', triple({ defaults: analytics.defaults.purchase_gate.enabled_candidate_types, saved: analytics.saved.purchase_gate.enabled_candidate_types, effective: analytics.effective.purchase_gate.enabled_candidate_types, format: formatCandidateTypes }))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {CANDIDATE_TYPES.map((candidate) => (
              <Toggle key={candidate} disabled={!hasWrite} checked={draft.purchase_gate.enabled_candidate_types.includes(candidate)} label={CANDIDATE_LABELS[candidate]} onChange={(checked) => toggleCandidate(setDirtyDraft, candidate, checked)} />
            ))}
          </div>
        </section>

        <section aria-labelledby="analytics-discretionary-velocity" className="rounded-md border border-border-subtle bg-bg-inset p-3">
          <h3 id="analytics-discretionary-velocity" className="text-label text-text-secondary">discretionary_velocity</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="재량 기준 기간 (개월)" help={settingHelp('velocityBaselineMonths', triple({ defaults: analytics.defaults.discretionary_velocity.baseline_months, saved: analytics.saved.discretionary_velocity.baseline_months, effective: analytics.effective.discretionary_velocity.baseline_months, format: formatNumber }))}><TextInput type="number" min={1} max={12} disabled={!hasWrite} value={draft.discretionary_velocity.baseline_months} onChange={(event) => updateVelocity(setDirtyDraft, { baseline_months: event.target.value })} /></Field>
            <Field label="재량 속도 경고 (%)" help={settingHelp('velocityWarningRatio', triple({ defaults: analytics.defaults.discretionary_velocity.warning_velocity_ratio, saved: analytics.saved.discretionary_velocity.warning_velocity_ratio, effective: analytics.effective.discretionary_velocity.warning_velocity_ratio, format: formatRatio }))}><TextInput type="number" min={0} disabled={!hasWrite} value={draft.discretionary_velocity.warning_velocity_ratio} onChange={(event) => updateVelocity(setDirtyDraft, { warning_velocity_ratio: event.target.value })} /></Field>
            <Field label="재량 속도 높음 (%)" help={settingHelp('velocityHighRatio', triple({ defaults: analytics.defaults.discretionary_velocity.high_velocity_ratio, saved: analytics.saved.discretionary_velocity.high_velocity_ratio, effective: analytics.effective.discretionary_velocity.high_velocity_ratio, format: formatRatio }))}><TextInput type="number" min={0} disabled={!hasWrite} value={draft.discretionary_velocity.high_velocity_ratio} onChange={(event) => updateVelocity(setDirtyDraft, { high_velocity_ratio: event.target.value })} /></Field>
            <Field label="분류 커버리지 최소 (%)" help={settingHelp('velocityCoverage', triple({ defaults: analytics.defaults.discretionary_velocity.minimum_classification_coverage, saved: analytics.saved.discretionary_velocity.minimum_classification_coverage, effective: analytics.effective.discretionary_velocity.minimum_classification_coverage, format: formatRatio }))}><TextInput type="number" min={0} max={100} disabled={!hasWrite} value={draft.discretionary_velocity.minimum_classification_coverage} onChange={(event) => updateVelocity(setDirtyDraft, { minimum_classification_coverage: event.target.value })} /></Field>
            <Field label="outlier policy" help={settingHelp('velocityOutlierPolicy', triple({ defaults: analytics.defaults.discretionary_velocity.outlier_policy, saved: analytics.saved.discretionary_velocity.outlier_policy, effective: analytics.effective.discretionary_velocity.outlier_policy, format: formatText }))}><TextInput disabled={!hasWrite} value={draft.discretionary_velocity.outlier_policy} onChange={(event) => updateVelocity(setDirtyDraft, { outlier_policy: event.target.value })} /></Field>
            <Field label="baseline mode" help={settingHelp('velocityBaselineMode', triple({ defaults: analytics.defaults.discretionary_velocity.baseline_mode, saved: analytics.saved.discretionary_velocity.baseline_mode, effective: analytics.effective.discretionary_velocity.baseline_mode, format: formatText }))}><TextInput disabled={!hasWrite} value={draft.discretionary_velocity.baseline_mode} onChange={(event) => updateVelocity(setDirtyDraft, { baseline_mode: event.target.value })} /></Field>
            <Field label="제외 카테고리" help={settingHelp('velocityExcludedCategories', triple({ defaults: analytics.defaults.discretionary_velocity.excluded_category_names, saved: analytics.saved.discretionary_velocity.excluded_category_names, effective: analytics.effective.discretionary_velocity.excluded_category_names, format: formatListDisplay }))}><TextInput disabled={!hasWrite} value={draft.discretionary_velocity.excluded_category_names} onChange={(event) => updateVelocity(setDirtyDraft, { excluded_category_names: event.target.value })} /></Field>
            <Field label="제외 가맹점" help={settingHelp('velocityExcludedMerchants', triple({ defaults: analytics.defaults.discretionary_velocity.excluded_merchants, saved: analytics.saved.discretionary_velocity.excluded_merchants, effective: analytics.effective.discretionary_velocity.excluded_merchants, format: formatListDisplay }))}><TextInput disabled={!hasWrite} value={draft.discretionary_velocity.excluded_merchants} onChange={(event) => updateVelocity(setDirtyDraft, { excluded_merchants: event.target.value })} /></Field>
          </div>
        </section>

        <section aria-labelledby="analytics-recurring-dry-run" className="rounded-md border border-border-subtle bg-bg-inset p-3">
          <h3 id="analytics-recurring-dry-run" className="text-label text-text-secondary">recurring_dry_run</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="최소 반복 횟수" help={settingHelp('recurringMinOccurrences', triple({ defaults: analytics.defaults.recurring_dry_run.min_occurrences, saved: analytics.saved.recurring_dry_run.min_occurrences, effective: analytics.effective.recurring_dry_run.min_occurrences, format: formatNumber }))}><TextInput type="number" min={2} disabled={!hasWrite} value={draft.recurring_dry_run.min_occurrences} onChange={(event) => updateRecurring(setDirtyDraft, { min_occurrences: event.target.value })} /></Field>
            <Field label="최소 반복 월수" help={settingHelp('recurringMinMonths', triple({ defaults: analytics.defaults.recurring_dry_run.min_distinct_months, saved: analytics.saved.recurring_dry_run.min_distinct_months, effective: analytics.effective.recurring_dry_run.min_distinct_months, format: formatNumber }))}><TextInput type="number" min={1} disabled={!hasWrite} value={draft.recurring_dry_run.min_distinct_months} onChange={(event) => updateRecurring(setDirtyDraft, { min_distinct_months: event.target.value })} /></Field>
            <Field label="최소 반복 일수" help={settingHelp('recurringMinDays', triple({ defaults: analytics.defaults.recurring_dry_run.min_distinct_days, saved: analytics.saved.recurring_dry_run.min_distinct_days, effective: analytics.effective.recurring_dry_run.min_distinct_days, format: formatNumber }))}><TextInput type="number" min={1} disabled={!hasWrite} value={draft.recurring_dry_run.min_distinct_days} onChange={(event) => updateRecurring(setDirtyDraft, { min_distinct_days: event.target.value })} /></Field>
            <Field label="금액 변동계수 최대 (%)" help={settingHelp('recurringAmountCv', triple({ defaults: analytics.defaults.recurring_dry_run.max_amount_cv, saved: analytics.saved.recurring_dry_run.max_amount_cv, effective: analytics.effective.recurring_dry_run.max_amount_cv, format: formatRatio }))}><TextInput type="number" min={0} disabled={!hasWrite} value={draft.recurring_dry_run.max_amount_cv} onChange={(event) => updateRecurring(setDirtyDraft, { max_amount_cv: event.target.value })} /></Field>
            <Field label="월간 간격 최소 (일)" help={settingHelp('recurringMonthlyMin', triple({ defaults: analytics.defaults.recurring_dry_run.monthly_interval_days_min, saved: analytics.saved.recurring_dry_run.monthly_interval_days_min, effective: analytics.effective.recurring_dry_run.monthly_interval_days_min, format: formatNumber }))}><TextInput type="number" min={1} disabled={!hasWrite} value={draft.recurring_dry_run.monthly_interval_days_min} onChange={(event) => updateRecurring(setDirtyDraft, { monthly_interval_days_min: event.target.value })} /></Field>
            <Field label="월간 간격 최대 (일)" help={settingHelp('recurringMonthlyMax', triple({ defaults: analytics.defaults.recurring_dry_run.monthly_interval_days_max, saved: analytics.saved.recurring_dry_run.monthly_interval_days_max, effective: analytics.effective.recurring_dry_run.monthly_interval_days_max, format: formatNumber }))}><TextInput type="number" min={1} disabled={!hasWrite} value={draft.recurring_dry_run.monthly_interval_days_max} onChange={(event) => updateRecurring(setDirtyDraft, { monthly_interval_days_max: event.target.value })} /></Field>
            <Field label="주간 간격 최소 (일)" help={settingHelp('recurringWeeklyMin', triple({ defaults: analytics.defaults.recurring_dry_run.weekly_interval_days_min, saved: analytics.saved.recurring_dry_run.weekly_interval_days_min, effective: analytics.effective.recurring_dry_run.weekly_interval_days_min, format: formatNumber }))}><TextInput type="number" min={1} disabled={!hasWrite} value={draft.recurring_dry_run.weekly_interval_days_min} onChange={(event) => updateRecurring(setDirtyDraft, { weekly_interval_days_min: event.target.value })} /></Field>
            <Field label="주간 간격 최대 (일)" help={settingHelp('recurringWeeklyMax', triple({ defaults: analytics.defaults.recurring_dry_run.weekly_interval_days_max, saved: analytics.saved.recurring_dry_run.weekly_interval_days_max, effective: analytics.effective.recurring_dry_run.weekly_interval_days_max, format: formatNumber }))}><TextInput type="number" min={1} disabled={!hasWrite} value={draft.recurring_dry_run.weekly_interval_days_max} onChange={(event) => updateRecurring(setDirtyDraft, { weekly_interval_days_max: event.target.value })} /></Field>
            <Field label="반복 신뢰도 최소 (%)" help={settingHelp('recurringConfidence', triple({ defaults: analytics.defaults.recurring_dry_run.minimum_confidence, saved: analytics.saved.recurring_dry_run.minimum_confidence, effective: analytics.effective.recurring_dry_run.minimum_confidence, format: formatRatio }))}><TextInput type="number" min={0} max={100} disabled={!hasWrite} value={draft.recurring_dry_run.minimum_confidence} onChange={(event) => updateRecurring(setDirtyDraft, { minimum_confidence: event.target.value })} /></Field>
            <Field label="반복 작업 기본 범위" help={settingHelp('recurringApplyScope', triple({ defaults: analytics.defaults.recurring_dry_run.default_apply_scope, saved: analytics.saved.recurring_dry_run.default_apply_scope, effective: analytics.effective.recurring_dry_run.default_apply_scope, format: formatText }))}>
              <Select disabled={!hasWrite} value={draft.recurring_dry_run.default_apply_scope} onChange={(event) => updateRecurring(setDirtyDraft, { default_apply_scope: event.target.value })}>
                <option value="all_matching">all_matching</option>
                <option value="reviewed_only">reviewed_only</option>
              </Select>
            </Field>
            <div className="flex flex-col gap-1">
              <Toggle disabled={!hasWrite} checked={draft.recurring_dry_run.upload_auto_apply} label={<ToggleLabel label="업로드 후 자동 적용" help={settingHelp('recurringUploadAutoApply', triple({ defaults: analytics.defaults.recurring_dry_run.upload_auto_apply, saved: analytics.saved.recurring_dry_run.upload_auto_apply, effective: analytics.effective.recurring_dry_run.upload_auto_apply, format: formatBoolean }))} />} onChange={(checked) => updateRecurring(setDirtyDraft, { upload_auto_apply: checked })} />
            </div>
          </div>
        </section>

        <section aria-labelledby="analytics-asset-liability-health" className="rounded-md border border-border-subtle bg-bg-inset p-3">
          <h3 id="analytics-asset-liability-health" className="text-label text-text-secondary">asset_liability_health</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="비상금 포함 tier" help={settingHelp('assetEmergencyTiers', triple({ defaults: analytics.defaults.asset_liability_health.emergency_fund_included_tiers, saved: analytics.saved.asset_liability_health.emergency_fund_included_tiers, effective: analytics.effective.asset_liability_health.emergency_fund_included_tiers, format: formatListDisplay }))}><TextInput disabled={!hasWrite} value={draft.asset_liability_health.emergency_fund_included_tiers} onChange={(event) => updateAsset(setDirtyDraft, { emergency_fund_included_tiers: event.target.value })} /></Field>
            <Field label="월상환 추정 lookback (개월)" help={settingHelp('assetPaymentLookback', triple({ defaults: analytics.defaults.asset_liability_health.monthly_payment_estimate_lookback_months, saved: analytics.saved.asset_liability_health.monthly_payment_estimate_lookback_months, effective: analytics.effective.asset_liability_health.monthly_payment_estimate_lookback_months, format: formatNumber }))}><TextInput type="number" min={1} max={24} disabled={!hasWrite} value={draft.asset_liability_health.monthly_payment_estimate_lookback_months} onChange={(event) => updateAsset(setDirtyDraft, { monthly_payment_estimate_lookback_months: event.target.value })} /></Field>
            <Field label="월상환 최소 관측" help={settingHelp('assetPaymentObservations', triple({ defaults: analytics.defaults.asset_liability_health.monthly_payment_min_observations, saved: analytics.saved.asset_liability_health.monthly_payment_min_observations, effective: analytics.effective.asset_liability_health.monthly_payment_min_observations, format: formatNumber }))}><TextInput type="number" min={1} disabled={!hasWrite} value={draft.asset_liability_health.monthly_payment_min_observations} onChange={(event) => updateAsset(setDirtyDraft, { monthly_payment_min_observations: event.target.value })} /></Field>
            <div className="flex flex-col gap-1">
              <Toggle disabled={!hasWrite} checked={draft.asset_liability_health.show_near_liquid_as_secondary} label={<ToggleLabel label="near-liquid 보조 표시" help={settingHelp('assetNearLiquidSecondary', triple({ defaults: analytics.defaults.asset_liability_health.show_near_liquid_as_secondary, saved: analytics.saved.asset_liability_health.show_near_liquid_as_secondary, effective: analytics.effective.asset_liability_health.show_near_liquid_as_secondary, format: formatBoolean }))} />} onChange={(checked) => updateAsset(setDirtyDraft, { show_near_liquid_as_secondary: checked })} />
            </div>
            <div className="flex flex-col gap-1">
              <Toggle disabled={!hasWrite} checked={draft.asset_liability_health.debt_payment_confidence_requires_user_confirmation} label={<ToggleLabel label="부채 상환 확인 필요" help={settingHelp('assetPaymentConfirmation', triple({ defaults: analytics.defaults.asset_liability_health.debt_payment_confidence_requires_user_confirmation, saved: analytics.saved.asset_liability_health.debt_payment_confidence_requires_user_confirmation, effective: analytics.effective.asset_liability_health.debt_payment_confidence_requires_user_confirmation, format: formatBoolean }))} />} onChange={(checked) => updateAsset(setDirtyDraft, { debt_payment_confidence_requires_user_confirmation: checked })} />
            </div>
          </div>
        </section>

        <section aria-labelledby="analytics-spending-anomalies" className="rounded-md border border-border-subtle bg-bg-inset p-3">
          <h3 id="analytics-spending-anomalies" className="text-label text-text-secondary">spending_anomalies</h3>
          <p className="mt-1 text-micro text-text-faint">이상 지출 기준은 읽기 전용으로 확인만 제공합니다.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <ReadOnlyValue label="최소 변동 금액" value={formatNumber(analytics.effective.spending_anomalies.min_delta_amount)} help={settingHelp('anomalyMinDelta', triple({ defaults: analytics.defaults.spending_anomalies.min_delta_amount, saved: analytics.saved.spending_anomalies.min_delta_amount, effective: analytics.effective.spending_anomalies.min_delta_amount, format: formatNumber }))} />
            <ReadOnlyValue label="이상 기준 (%)" value={formatRatio(analytics.effective.spending_anomalies.anomaly_threshold)} help={settingHelp('anomalyThreshold', triple({ defaults: analytics.defaults.spending_anomalies.anomaly_threshold, saved: analytics.saved.spending_anomalies.anomaly_threshold, effective: analytics.effective.spending_anomalies.anomaly_threshold, format: formatRatio }))} />
            <ReadOnlyValue label="기준 기간 (개월)" value={formatNumber(analytics.effective.spending_anomalies.baseline_months)} help={settingHelp('anomalyBaselineMonths', triple({ defaults: analytics.defaults.spending_anomalies.baseline_months, saved: analytics.saved.spending_anomalies.baseline_months, effective: analytics.effective.spending_anomalies.baseline_months, format: formatNumber }))} />
          </div>
        </section>

        <section aria-labelledby="analytics-bulk-operations" className="rounded-md border border-border-subtle bg-bg-inset p-3">
          <h3 id="analytics-bulk-operations" className="text-label text-text-secondary">bulk_operations</h3>
          <p className="mt-1 text-micro text-text-faint">일괄 작업 안전장치는 읽기 전용으로만 노출합니다.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ReadOnlyValue label="미리보기 필수" value={formatBoolean(analytics.effective.bulk_operations.require_preview)} help={settingHelp('bulkPreview', triple({ defaults: analytics.defaults.bulk_operations.require_preview, saved: analytics.saved.bulk_operations.require_preview, effective: analytics.effective.bulk_operations.require_preview, format: formatBoolean }))} />
            <ReadOnlyValue label="확인 입력 필수" value={formatBoolean(analytics.effective.bulk_operations.require_confirmation)} help={settingHelp('bulkConfirmation', triple({ defaults: analytics.defaults.bulk_operations.require_confirmation, saved: analytics.saved.bulk_operations.require_confirmation, effective: analytics.effective.bulk_operations.require_confirmation, format: formatBoolean }))} />
            <ReadOnlyValue label="삭제 후 되돌리기 표시" value={formatBoolean(analytics.effective.bulk_operations.show_undo_after_delete)} help={settingHelp('bulkUndo', triple({ defaults: analytics.defaults.bulk_operations.show_undo_after_delete, saved: analytics.saved.bulk_operations.show_undo_after_delete, effective: analytics.effective.bulk_operations.show_undo_after_delete, format: formatBoolean }))} />
            <ReadOnlyValue label="추가 확인 없는 최대 행 수" value={formatNumber(analytics.effective.bulk_operations.max_bulk_rows_without_extra_confirmation)} help={settingHelp('bulkMaxRows', triple({ defaults: analytics.defaults.bulk_operations.max_bulk_rows_without_extra_confirmation, saved: analytics.saved.bulk_operations.max_bulk_rows_without_extra_confirmation, effective: analytics.effective.bulk_operations.max_bulk_rows_without_extra_confirmation, format: formatNumber }))} />
          </div>
        </section>
      </div>
    </Card>
  )
}

function ReadOnlyValue({ label, value, help }: { readonly label: string; readonly value: string; readonly help: ReactNode }) {
  return (
    <div className="rounded-sm border border-border-subtle bg-bg-surface px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-micro text-text-muted">
        <span>{label}</span>
        {help}
      </div>
      <div className="mt-1 text-caption text-text-secondary">{value}</div>
    </div>
  )
}

function ToggleLabel({ label, help }: { readonly label: string; readonly help: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      {help}
    </span>
  )
}

function settingHelp(key: SettingHelpKey, values: string) {
  return <SettingHelpBubble help={SETTING_HELP[key]} values={values} />
}

function formatBoolean(value: boolean): string {
  return value ? '켬' : '끔'
}

function formatCandidateTypes(values: readonly PurchaseGateCandidateType[]): string {
  return values.length === 0 ? '없음' : values.map((value) => CANDIDATE_LABELS[value]).join(', ')
}

function updatePurchase(setter: Dispatch<SetStateAction<AnalyticsDraft>>, patch: Partial<AnalyticsDraft['purchase_gate']>) {
  setter((current) => ({ ...current, purchase_gate: { ...current.purchase_gate, ...patch } }))
}

function updateVelocity(setter: Dispatch<SetStateAction<AnalyticsDraft>>, patch: Partial<AnalyticsDraft['discretionary_velocity']>) {
  setter((current) => ({ ...current, discretionary_velocity: { ...current.discretionary_velocity, ...patch } }))
}

function updateRecurring(setter: Dispatch<SetStateAction<AnalyticsDraft>>, patch: Partial<AnalyticsDraft['recurring_dry_run']>) {
  setter((current) => ({ ...current, recurring_dry_run: { ...current.recurring_dry_run, ...patch } }))
}

function updateAsset(setter: Dispatch<SetStateAction<AnalyticsDraft>>, patch: Partial<AnalyticsDraft['asset_liability_health']>) {
  setter((current) => ({ ...current, asset_liability_health: { ...current.asset_liability_health, ...patch } }))
}

function toggleCandidate(setter: Dispatch<SetStateAction<AnalyticsDraft>>, candidate: PurchaseGateCandidateType, checked: boolean) {
  setter((current) => ({
    ...current,
    purchase_gate: {
      ...current.purchase_gate,
      enabled_candidate_types: checked
        ? CANDIDATE_TYPES.filter((value) => value === candidate || current.purchase_gate.enabled_candidate_types.includes(value))
        : current.purchase_gate.enabled_candidate_types.filter((value) => value !== candidate),
    },
  }))
}
