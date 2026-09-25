import { useState } from 'react'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Field, Select, TextInput } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { useApplySourcePolicy, usePreviewSourcePolicy, useSelectedInvestments, useSourcePolicy } from '../../hooks/useSourcePolicy'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { InvestmentSource, SourcePolicyFields, SourcePolicyPreview } from '../../types/sourcePolicy'
import { SourceSelectionDetails } from '../assets/SourceSelectionDetails'
import { SOURCE_LABEL, sourceMoney } from '../assets/sourcePresentation'
import { TossIntegrationPanel } from './TossIntegrationPanel'

function sourceValue(value: string): InvestmentSource { return value === 'toss_securities_api' ? value : 'banksalad_snapshot' }
function policyFields(policy: SourcePolicyFields): SourcePolicyFields {
  return { global_source: policy.global_source, investment_source: policy.investment_source, stale_after_days: policy.stale_after_days, account_overrides: policy.account_overrides }
}

export function SourcePolicyEditor() {
  const hasWrite = useWriteAccess()
  const policyQuery = useSourcePolicy()
  const selected = useSelectedInvestments()
  const previewMutation = usePreviewSourcePolicy()
  const applyMutation = useApplySourcePolicy()
  const [draft, setDraft] = useState<SourcePolicyFields | null>(null)
  const [preview, setPreview] = useState<SourcePolicyPreview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [syncPending, setSyncPending] = useState(false)
  const effective = draft ?? (policyQuery.data ? policyFields(policyQuery.data) : null)
  const busy = previewMutation.isPending || applyMutation.isPending || syncPending
  const editable = hasWrite && !busy

  function edit(next: SourcePolicyFields) {
    setDraft(next)
    setPreview(null)
    setMessage(null)
  }

  async function runPreview() {
    if (!effective || !hasWrite) return
    if (!Number.isInteger(effective.stale_after_days) || effective.stale_after_days < 1 || effective.stale_after_days > 365) {
      setMessage('오래된 평가 기준은 1~365일 사이 정수로 입력해 주세요.')
      return
    }
    setMessage(null)
    setPreview(null)
    try { setPreview(await previewMutation.mutateAsync(effective)) }
    catch { setMessage('변경 미리보기를 불러오지 못했습니다. 다시 시도해 주세요.') }
  }

  async function apply() {
    if (!preview || !hasWrite) return
    try {
      await applyMutation.mutateAsync({ policy: policyFields(preview.policy), preview_token: preview.preview_token, confirmed: true })
      setDraft(null)
      setPreview(null)
      setMessage('소스 선택을 저장했습니다.')
      toast.success('소스 선택 저장 완료')
    } catch {
      setPreview(null)
      setMessage('저장하지 못했습니다. 원본 데이터나 설정이 바뀌었을 수 있으므로 다시 미리보기 해 주세요.')
    }
  }

  const accountKeys = [...new Set([...(selected.data?.accounts.map((account) => account.account_key) ?? []), ...(effective?.account_overrides.map((override) => override.account_key) ?? [])])]

  return (
    <Card title="투자 데이터 소스" meta="기본 소스와 계좌 그룹별 예외를 선택합니다" className="mb-4">
      <div className="mb-4 space-y-2 text-caption text-text-muted">
        <p>Toss 투자 항목만 대체, 나머지는 BankSalad 유지. 원본과 과거 스냅샷은 변경하지 않습니다.</p>
        <p>토스증권의 완전한 수집 결과가 없으면 실제 적용 소스와 대체 사유를 표시합니다.</p>
        <p>뱅샐에 계좌번호가 없으면 증권사 단위 계좌 그룹으로 표시합니다. 여러 실제 계좌를 연결하려면 명시적 매핑 확인이 필요합니다.</p>
        {!hasWrite && <p className="text-warn">읽기 전용 · 소스 변경에는 쓰기 권한이 필요합니다.</p>}
      </div>
      <TossIntegrationPanel disabled={previewMutation.isPending || applyMutation.isPending} onSyncStateChange={(pending) => {
        setSyncPending(pending)
        if (pending) { setPreview(null); setMessage(null) }
      }} />
      {policyQuery.isLoading ? <ListSkeleton rows={3} /> : policyQuery.error || !effective ? (
        <ErrorState message="소스 설정을 불러오지 못했습니다" onRetry={() => void policyQuery.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="토스증권 투자 기본 소스" hint="다른 증권사는 뱅샐을 유지하며, 계좌 그룹별 예외 설정이 우선합니다">
              <Select disabled={!editable} value={effective.investment_source} onChange={(event) => edit({ ...effective, investment_source: sourceValue(event.target.value) })}>
                {Object.entries(SOURCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="오래된 평가 기준 (일)" hint="수집 시각이 아닌 평가 시각으로 판단합니다">
              <TextInput type="number" min={1} max={365} disabled={!editable} value={Number.isNaN(effective.stale_after_days) ? '' : effective.stale_after_days} onChange={(event) => edit({ ...effective, stale_after_days: event.target.value === '' ? Number.NaN : Number(event.target.value) })} />
            </Field>
          </div>
          {accountKeys.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{accountKeys.map((key) => (
            <Field key={key} label={`계좌 그룹 ${selected.data?.accounts.find((account) => account.account_key === key)?.broker ?? key}`}>
              <Select disabled={!editable} value={effective.account_overrides.find((override) => override.account_key === key)?.source ?? ''} onChange={(event) => edit({
                ...effective,
                account_overrides: [...effective.account_overrides.filter((override) => override.account_key !== key), ...(event.target.value ? [{ account_key: key, source: sourceValue(event.target.value) }] : [])],
              })}>
                <option value="">기본 소스 따름 (증권사별 적용)</option>
                {Object.entries(SOURCE_LABEL).map(([value, label]) => <option key={value} value={value} disabled={value === 'toss_securities_api' && selected.data?.accounts.find((account) => account.account_key === key)?.broker?.replace(/\s/g, '') !== '토스증권'}>{label}</option>)}
              </Select>
            </Field>
          ))}</div>}
          <Button disabled={!editable} onClick={() => void runPreview()}>{previewMutation.isPending ? '미리보기 중…' : '변경 미리보기'}</Button>
          {message && <p role="status" className="text-caption text-text-secondary">{message}</p>}
          {preview && <section aria-label="소스 변경 미리보기" className="space-y-3 rounded-md border border-estimate-border bg-estimate-bg p-4">
            <h3 className="text-label font-semibold">소스 변경 미리보기</h3>
            <p className="text-caption">현재 추정 순자산 {sourceMoney(preview.current.estimated_net_worth)} → 변경 후 {sourceMoney(preview.proposed.estimated_net_worth)}</p>
            <p className="text-caption">선택 변경에 따른 금액 차이 {sourceMoney(preview.net_worth_delta)} · 투자 수익률이 아닙니다.</p>
            <SourceSelectionDetails data={preview.proposed} />
            <p className="text-caption text-text-muted">평가 시점 차이와 계좌 간 이체로 총액에 중복·누락이 생길 수 있습니다. 과거 스냅샷과 성과 비교에는 반영하지 않습니다.</p>
            <Button variant="primary" disabled={!editable} onClick={() => void apply()}>{applyMutation.isPending ? '저장 중…' : '확인 후 소스 적용'}</Button>
          </section>}
        </div>
      )}
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="mb-3 text-label font-semibold">현재 적용 내역</h3>
        {selected.isLoading ? <ListSkeleton rows={2} /> : selected.error || !selected.data ? <ErrorState message="현재 소스 내역을 불러오지 못했습니다" onRetry={() => void selected.refetch()} /> : <SourceSelectionDetails data={selected.data} />}
      </div>
    </Card>
  )
}
