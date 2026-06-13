import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '../../ds/Card'
import { Button } from '../../ds/Button'
import { Field, Select, TextInput, Toggle } from '../../ds/Field'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { PageHeader } from '../../shell/PageHeader'
import {
  useApplyCategoryClassificationRules,
  useApplyMerchantAliasRules,
  useApplyRecurringCategoryRules,
  useAutoClassificationSettings,
  useCategoryClassificationRules,
  useMerchantAliasRules,
  usePatchAutoClassificationSettings,
  useRecurringCategoryRules,
  useTransactionFilterOptions,
  useUpsertCategoryClassificationRule,
  useUpsertMerchantAliasRule,
  useUpsertRecurringCategoryRule,
} from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { RecurringPaymentKind } from '../../types/transaction'

type Tab = 'category' | 'alias' | 'recurring'
type Necessity = '' | 'essential' | 'discretionary'

const RECURRING_LABEL: Record<RecurringPaymentKind, string> = {
  installment: '할부',
  monthly_recurring: '매월 반복',
  not_recurring: '반복 아님',
}

export function RulesPage() {
  const hasWrite = useWriteAccess()
  const [tab, setTab] = useState<Tab>('category')

  const settings = useAutoClassificationSettings()
  const patchSettings = usePatchAutoClassificationSettings()
  const filterOptions = useTransactionFilterOptions()
  const categoryRules = useCategoryClassificationRules()
  const aliasRules = useMerchantAliasRules()
  const recurringRules = useRecurringCategoryRules()
  const upsertCategory = useUpsertCategoryClassificationRule()
  const applyCategory = useApplyCategoryClassificationRules()
  const upsertAlias = useUpsertMerchantAliasRule()
  const applyAlias = useApplyMerchantAliasRules()
  const upsertRecurring = useUpsertRecurringCategoryRule()
  const applyRecurring = useApplyRecurringCategoryRules()

  // 카테고리 규칙 폼
  const [catMajor, setCatMajor] = useState('')
  const [catMinor, setCatMinor] = useState('')
  const [costKind, setCostKind] = useState<'fixed' | 'variable'>('variable')
  const [necessity, setNecessity] = useState<Necessity>('')
  // 정규화 폼
  const [aliasPattern, setAliasPattern] = useState('')
  const [normalized, setNormalized] = useState('')
  // 반복 폼
  const [recMajor, setRecMajor] = useState('')
  const [recMinor, setRecMinor] = useState('')
  const [recKind, setRecKind] = useState<RecurringPaymentKind>('monthly_recurring')

  const majorOptions = useMemo(
    () => Array.from(new Set(filterOptions.data?.category_options ?? [])).sort((a, b) => a.localeCompare(b, 'ko')),
    [filterOptions.data],
  )
  const minorByMajor = filterOptions.data?.category_minor_options_by_major ?? {}

  async function toggleSetting(field: 'apply_cost_rules_on_upload' | 'apply_loan_rules_on_upload' | 'apply_recurring_rules_on_upload', value: boolean) {
    try {
      await patchSettings.mutateAsync({ [field]: value })
      toast.success('자동 적용 옵션 저장 완료')
    } catch (error) {
      toast.error('옵션 저장 실패', { description: String(error) })
    }
  }

  async function saveCategory() {
    if (!catMajor.trim()) return
    try {
      await upsertCategory.mutateAsync({
        category_major: catMajor.trim(),
        category_minor: catMinor.trim() || null,
        cost_kind: costKind,
        fixed_cost_necessity: costKind === 'fixed' ? (necessity || null) : null,
        spend_necessity: necessity || null,
      })
      setCatMajor(''); setCatMinor(''); setCostKind('variable'); setNecessity('')
      toast.success('분류 규칙 저장 완료')
    } catch (error) {
      toast.error('규칙 저장 실패', { description: String(error) })
    }
  }

  async function applyRules(kind: Tab) {
    try {
      const mutation = kind === 'category' ? applyCategory : kind === 'alias' ? applyAlias : applyRecurring
      const result = await mutation.mutateAsync()
      toast.success('일괄 적용 완료', { description: `${result.updated}건 반영` })
    } catch (error) {
      toast.error('일괄 적용 실패', { description: String(error) })
    }
  }

  async function saveAlias() {
    if (!aliasPattern.trim() || !normalized.trim()) return
    try {
      await upsertAlias.mutateAsync({ alias_pattern: aliasPattern.trim(), normalized_merchant: normalized.trim() })
      setAliasPattern(''); setNormalized('')
      toast.success('거래처 정규화 규칙 저장 완료')
    } catch (error) {
      toast.error('규칙 저장 실패', { description: String(error) })
    }
  }

  async function saveRecurring() {
    if (!recMajor.trim()) return
    try {
      await upsertRecurring.mutateAsync({ category_major: recMajor.trim(), category_minor: recMinor.trim() || null, recurring_payment_kind: recKind })
      setRecMajor(''); setRecMinor(''); setRecKind('monthly_recurring')
      toast.success('반복결제 카테고리 규칙 저장 완료')
    } catch (error) {
      toast.error('규칙 저장 실패', { description: String(error) })
    }
  }

  const totalRules = (categoryRules.data?.items.length ?? 0) + (aliasRules.data?.items.length ?? 0) + (recurringRules.data?.items.length ?? 0)

  return (
    <>
      <PageHeader title="데이터 · 규칙" meta={<span>{totalRules}개 규칙</span>} />

      <div className="flex flex-col gap-4">
        <Card title="업로드 후 자동 적용">
          {settings.isLoading ? <ListSkeleton rows={1} /> : (
            <div className="flex flex-wrap gap-4">
              <Toggle label="고정비 규칙" disabled={!hasWrite || patchSettings.isPending} checked={settings.data?.apply_cost_rules_on_upload ?? false} onChange={(v) => void toggleSetting('apply_cost_rules_on_upload', v)} />
              <Toggle label="대출 거래처 규칙" disabled={!hasWrite || patchSettings.isPending} checked={settings.data?.apply_loan_rules_on_upload ?? false} onChange={(v) => void toggleSetting('apply_loan_rules_on_upload', v)} />
              <Toggle label="반복결제 규칙" disabled={!hasWrite || patchSettings.isPending} checked={settings.data?.apply_recurring_rules_on_upload ?? false} onChange={(v) => void toggleSetting('apply_recurring_rules_on_upload', v)} />
            </div>
          )}
        </Card>

        <SegmentedControl
          ariaLabel="규칙 종류"
          options={[
            { value: 'category', label: '카테고리' },
            { value: 'alias', label: '거래처 정규화' },
            { value: 'recurring', label: '반복결제' },
          ] as const}
          value={tab}
          onChange={setTab}
        />

        {tab === 'category' && (
          <Card
            title="고정비/변동비 · 필수/재량 규칙"
            meta="대분류·소분류 기준 · 수동 값은 덮지 않습니다"
            action={<Button variant="primary" disabled={!hasWrite || applyCategory.isPending} onClick={() => void applyRules('category')}>일괄 적용</Button>}
            bodyClassName="p-0"
          >
            <div className="flex flex-wrap items-end gap-2 border-b border-border-subtle px-4 py-3">
              <Field label="대분류">
                <Select className="w-32" value={catMajor} onChange={(event) => { setCatMajor(event.target.value); setCatMinor('') }}>
                  <option value="">— 선택 —</option>
                  {majorOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="소분류">
                <Select className="w-32" disabled={!catMajor} value={catMinor} onChange={(event) => setCatMinor(event.target.value)}>
                  <option value="">전체 소분류</option>
                  {(minorByMajor[catMajor] ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="비용 성격">
                <Select value={costKind} onChange={(event) => setCostKind(event.target.value as 'fixed' | 'variable')}>
                  <option value="variable">변동비</option>
                  <option value="fixed">고정비</option>
                </Select>
              </Field>
              <Field label="필수/재량">
                <Select value={necessity} onChange={(event) => setNecessity(event.target.value as Necessity)}>
                  <option value="">미지정</option>
                  <option value="essential">필수</option>
                  <option value="discretionary">재량</option>
                </Select>
              </Field>
              <Button disabled={!hasWrite || !catMajor.trim() || upsertCategory.isPending} onClick={() => void saveCategory()}>규칙 저장</Button>
            </div>
            {categoryRules.data && categoryRules.data.items.length > 0 ? (
              <table className="w-full border-collapse text-label">
                <thead className="bg-bg-inset">
                  <tr>{['카테고리', '분류', '필수/재량'].map((h) => <th key={h} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {categoryRules.data.items.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-4 py-2 text-text-secondary">{rule.category_major}{rule.category_minor ? ` / ${rule.category_minor}` : ''}</td>
                      <td className="px-4 py-2 text-text-muted">{rule.cost_kind === 'fixed' ? '고정비' : '변동비'}</td>
                      <td className="px-4 py-2 text-text-muted">{rule.spend_necessity === 'essential' ? '필수' : rule.spend_necessity === 'discretionary' ? '재량' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState className="py-8" message="등록된 고정비 규칙이 없습니다" />}
          </Card>
        )}

        {tab === 'alias' && (
          <Card
            title="거래처 정규화 규칙"
            meta="원본 설명의 패턴 → 분석용 거래처 · 수동 수정값은 보존"
            action={<Button variant="primary" disabled={!hasWrite || applyAlias.isPending} onClick={() => void applyRules('alias')}>일괄 적용</Button>}
            bodyClassName="p-0"
          >
            <div className="flex flex-wrap items-end gap-2 border-b border-border-subtle px-4 py-3">
              <Field label="포함 패턴"><TextInput className="w-40" value={aliasPattern} onChange={(event) => setAliasPattern(event.target.value)} /></Field>
              <Field label="정규 거래처"><TextInput className="w-40" value={normalized} onChange={(event) => setNormalized(event.target.value)} /></Field>
              <Button disabled={!hasWrite || !aliasPattern.trim() || !normalized.trim() || upsertAlias.isPending} onClick={() => void saveAlias()}>규칙 저장</Button>
            </div>
            {aliasRules.data && aliasRules.data.items.length > 0 ? (
              <table className="w-full border-collapse text-label">
                <thead className="bg-bg-inset"><tr>{['포함 패턴', '정규 거래처'].map((h) => <th key={h} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border-subtle">
                  {aliasRules.data.items.map((rule) => (
                    <tr key={rule.id}><td className="px-4 py-2 text-text-secondary">{rule.alias_pattern}</td><td className="px-4 py-2 text-text-muted">{rule.normalized_merchant}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState className="py-8" message="등록된 정규화 규칙이 없습니다" />}
          </Card>
        )}

        {tab === 'recurring' && (
          <Card
            title="반복결제 카테고리 규칙"
            meta="반복 후보·고정비 게이트 통과 거래에만 적용"
            action={<Button variant="primary" disabled={!hasWrite || applyRecurring.isPending} onClick={() => void applyRules('recurring')}>일괄 적용</Button>}
            bodyClassName="p-0"
          >
            <div className="flex flex-wrap items-end gap-2 border-b border-border-subtle px-4 py-3">
              <Field label="대분류">
                <Select className="w-32" value={recMajor} onChange={(event) => { setRecMajor(event.target.value); setRecMinor('') }}>
                  <option value="">— 선택 —</option>
                  {majorOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="소분류">
                <Select className="w-32" disabled={!recMajor} value={recMinor} onChange={(event) => setRecMinor(event.target.value)}>
                  <option value="">전체 소분류</option>
                  {(minorByMajor[recMajor] ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="반복결제 성격">
                <Select value={recKind} onChange={(event) => setRecKind(event.target.value as RecurringPaymentKind)}>
                  <option value="monthly_recurring">매월 반복</option>
                  <option value="installment">할부</option>
                  <option value="not_recurring">반복 아님</option>
                </Select>
              </Field>
              <Button disabled={!hasWrite || !recMajor.trim() || upsertRecurring.isPending} onClick={() => void saveRecurring()}>규칙 저장</Button>
            </div>
            {recurringRules.data && recurringRules.data.items.length > 0 ? (
              <table className="w-full border-collapse text-label">
                <thead className="bg-bg-inset"><tr>{['카테고리', '반복결제 성격'].map((h) => <th key={h} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border-subtle">
                  {recurringRules.data.items.map((rule) => (
                    <tr key={rule.id}><td className="px-4 py-2 text-text-secondary">{rule.category_major}{rule.category_minor ? ` / ${rule.category_minor}` : ''}</td><td className="px-4 py-2 text-text-muted">{RECURRING_LABEL[rule.recurring_payment_kind]}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState className="py-8" message="등록된 반복결제 규칙이 없습니다" />}
          </Card>
        )}

        <Card title="대출 매칭 규칙" meta="거래처/원본 설명 → 대출 계좌 연결">
          <Link to="/data/loans" className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline">
            대출 화면의 규칙 탭에서 관리
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>
    </>
  )
}
