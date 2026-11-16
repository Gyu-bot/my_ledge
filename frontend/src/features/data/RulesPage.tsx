import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../ds/Card'
import { Button } from '../../ds/Button'
import { Field, TextInput, Toggle } from '../../ds/Field'
import { EmptyState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { PageHeader } from '../../shell/PageHeader'
import { useApplyMerchantAliasRules, useAutoClassificationSettings, useMerchantAliasRules, usePatchAutoClassificationSettings, useUpsertMerchantAliasRule } from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import { writeErrorMessage } from '../analysis/text'

export function RulesPage() {
  const hasWrite = useWriteAccess()
  const settings = useAutoClassificationSettings()
  const patchSettings = usePatchAutoClassificationSettings()
  const aliasRules = useMerchantAliasRules()
  const upsertAlias = useUpsertMerchantAliasRule()
  const applyAlias = useApplyMerchantAliasRules()
  const [aliasPattern, setAliasPattern] = useState('')
  const [normalized, setNormalized] = useState('')

  async function saveAlias() {
    if (!aliasPattern.trim() || !normalized.trim()) return
    try {
      await upsertAlias.mutateAsync({ alias_pattern: aliasPattern.trim(), normalized_merchant: normalized.trim() })
      setAliasPattern(''); setNormalized('')
      toast.success('거래처 정규화 규칙 저장 완료')
    } catch (error) { toast.error(writeErrorMessage(error)) }
  }

  async function applyAliases() {
    try {
      const result = await applyAlias.mutateAsync()
      toast.success('일괄 적용 완료', { description: `${result.updated}건 반영` })
    } catch (error) { toast.error(writeErrorMessage(error)) }
  }

  async function toggleLoanRule(value: boolean) {
    try {
      await patchSettings.mutateAsync({ apply_loan_rules_on_upload: value })
      toast.success('자동 적용 옵션 저장 완료')
    } catch (error) { toast.error(writeErrorMessage(error)) }
  }

  return <>
    <PageHeader title="작업대 · 규칙" meta={<span>{aliasRules.data?.items.length ?? 0}개 정규화 규칙</span>} />
    <div className="flex flex-col gap-4">
      <Card title="지출의 조정 가능성과 정기 지급">
        <p className="text-caption text-text-secondary">조정 가능성은 사람이 정합니다. 카테고리 기본값과 거래별 지정은 작업대에서, 정기 지급의 주기는 약정 현황에서 관리하세요.</p>
        <div className="mt-3 flex gap-4 text-caption text-transfer">
          <Link to="/data/nature" className="hover:underline">작업대로 이동</Link>
          <Link to="/commitments" className="hover:underline">약정 현황으로 이동</Link>
        </div>
      </Card>
      <Card title="거래처 정규화 규칙" meta="원본 설명의 패턴 → 분석용 거래처 · 수동 수정값은 보존"
        action={<Button variant="primary" disabled={!hasWrite || applyAlias.isPending} onClick={() => void applyAliases()}>일괄 적용</Button>} bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-2 border-b border-border-subtle px-4 py-3">
          <Field label="포함 패턴"><TextInput className="w-40" value={aliasPattern} onChange={(event) => setAliasPattern(event.target.value)} /></Field>
          <Field label="정규 거래처"><TextInput className="w-40" value={normalized} onChange={(event) => setNormalized(event.target.value)} /></Field>
          <Button disabled={!hasWrite || !aliasPattern.trim() || !normalized.trim() || upsertAlias.isPending} onClick={() => void saveAlias()}>규칙 저장</Button>
        </div>
        {aliasRules.data && aliasRules.data.items.length > 0 ? <table className="w-full border-collapse text-label">
          <thead className="bg-bg-inset"><tr>{['포함 패턴', '정규 거래처'].map((h) => <th key={h} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border-subtle">{aliasRules.data.items.map((rule) => <tr key={rule.id}><td className="px-4 py-2 text-text-secondary">{rule.alias_pattern}</td><td className="px-4 py-2 text-text-muted">{rule.normalized_merchant}</td></tr>)}</tbody>
        </table> : <EmptyState className="py-8" message="등록된 정규화 규칙이 없습니다" />}
      </Card>
      <Card title="대출 매칭 규칙" meta="거래처/원본 설명 → 대출 계좌 연결">
        <Toggle label="업로드 후 대출 거래처 규칙 적용" disabled={!hasWrite || patchSettings.isPending || settings.isLoading} checked={settings.data?.apply_loan_rules_on_upload ?? false} onChange={(v) => void toggleLoanRule(v)} />
        <Link to="/data/loans" className="mt-3 block text-caption text-transfer hover:underline">대출 화면의 규칙 탭에서 관리</Link>
      </Card>
    </div>
  </>
}
