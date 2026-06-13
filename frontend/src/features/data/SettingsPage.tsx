import { useEffect, useState } from 'react'
import { Card } from '../../ds/Card'
import { Button } from '../../ds/Button'
import { Field, Select, TextInput } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { PageHeader } from '../../shell/PageHeader'
import { useAnalyticsSettings, usePatchAnalyticsSettings } from '../../hooks/useSettings'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { DebtStrategyPreference } from '../../types/settings'

interface TargetsDraft {
  emergency_fund_target_months: string
  savings_rate_target: string
  debt_strategy_preference: '' | DebtStrategyPreference
}

export function SettingsPage() {
  const hasWrite = useWriteAccess()
  const settings = useAnalyticsSettings()
  const patch = usePatchAnalyticsSettings()
  const [draft, setDraft] = useState<TargetsDraft | null>(null)

  const effective = settings.data?.effective.financial_targets
  const defaults = settings.data?.defaults.financial_targets

  useEffect(() => {
    if (!effective || draft) return
    setDraft({
      emergency_fund_target_months: String(effective.emergency_fund_target_months),
      savings_rate_target: effective.savings_rate_target != null ? String(Math.round(effective.savings_rate_target * 100)) : '',
      debt_strategy_preference: effective.debt_strategy_preference ?? '',
    })
  }, [effective, draft])

  async function save() {
    if (!draft) return
    const months = Number.parseInt(draft.emergency_fund_target_months, 10)
    const savingsPct = draft.savings_rate_target.trim() === '' ? null : Number(draft.savings_rate_target)
    if (!Number.isFinite(months) || months < 1 || months > 120) {
      toast.error('비상금 목표는 1~120개월 사이여야 합니다')
      return
    }
    if (savingsPct != null && (savingsPct < 0 || savingsPct > 100)) {
      toast.error('저축률 목표는 0~100% 사이여야 합니다')
      return
    }
    try {
      await patch.mutateAsync({
        financial_targets: {
          emergency_fund_target_months: months,
          savings_rate_target: savingsPct == null ? null : savingsPct / 100,
          debt_strategy_preference: draft.debt_strategy_preference || null,
        },
      })
      toast.success('재무 목표 저장 완료')
    } catch (error) {
      toast.error('재무 목표 저장 실패', { description: String(error) })
    }
  }

  return (
    <>
      <PageHeader title="데이터 · 설정" meta={<span>분석 파라미터 · 재무 목표</span>} />

      {settings.isLoading ? <ListSkeleton rows={5} /> :
       settings.error ? <ErrorState onRetry={() => void settings.refetch()} /> :
       draft ? (
        <div className="flex flex-col gap-4">
          <Card
            title="재무 목표"
            meta="홈·자산·부채·신호 화면이 이 값을 읽습니다"
            action={<Button variant="primary" disabled={!hasWrite || patch.isPending} onClick={() => void save()}>목표 저장</Button>}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="비상금 목표 (개월)"
                hint={`기본 ${defaults?.emergency_fund_target_months ?? 3}개월`}
              >
                <TextInput
                  type="number"
                  min={1}
                  max={120}
                  disabled={!hasWrite}
                  value={draft.emergency_fund_target_months}
                  onChange={(event) => setDraft((current) => current && { ...current, emergency_fund_target_months: event.target.value })}
                />
              </Field>
              <Field label="저축률 목표 (%)" hint="비우면 각 화면의 목표 표기가 숨겨집니다">
                <TextInput
                  type="number"
                  min={0}
                  max={100}
                  placeholder="미설정"
                  disabled={!hasWrite}
                  value={draft.savings_rate_target}
                  onChange={(event) => setDraft((current) => current && { ...current, savings_rate_target: event.target.value })}
                />
              </Field>
              <Field label="부채 상환 전략" hint="자산·부채 대출 정렬에 반영">
                <Select
                  disabled={!hasWrite}
                  value={draft.debt_strategy_preference}
                  onChange={(event) => setDraft((current) => current && { ...current, debt_strategy_preference: event.target.value as TargetsDraft['debt_strategy_preference'] })}
                >
                  <option value="">미설정 (잔액순)</option>
                  <option value="avalanche">고금리 우선 (avalanche)</option>
                  <option value="snowball">소액 우선 (snowball)</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card title="분석 파라미터" meta="섹션별 기본값 · 저장값 · 적용값">
            <p className="text-caption leading-relaxed text-text-muted">
              이상 지출 threshold/baseline 개월, 재량 지출 속도, 구매 게이트, 반복 dry-run, 월상환 추정 lookback 등
              섹션별 분석 파라미터는 백엔드 <code className="font-mono">settings/analytics</code>의 default/saved/effective
              구조를 그대로 노출합니다. 섹션별 편집 폼은 후속 단계에서 추가합니다 — 현재는 재무 목표만 편집 가능합니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-micro text-text-faint">
              {['spending_anomalies', 'discretionary_velocity', 'purchase_gate', 'recurring_dry_run', 'asset_liability_health', 'bulk_operations'].map((section) => (
                <span key={section} className="rounded-sm border border-border-subtle bg-bg-inset px-2 py-0.5 font-mono">
                  {section}
                </span>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </>
  )
}
