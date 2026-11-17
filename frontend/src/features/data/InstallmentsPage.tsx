import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Field, Select, TextInput } from '../../ds/Field'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { Stat } from '../../ds/Stat'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { formatWon } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import { InstallmentLinksTab } from './InstallmentLinksTab'
import { InstallmentCandidatesCard } from './InstallmentCandidatesCard'
import {
  useCreateInstallmentPlan,
  useInstallmentPlans,
  useInstallmentTransactionMappings,
  usePatchInstallmentPlan,
} from '../../hooks/useTransactions'
import { useCommitments, useReadDataStatus } from '../../hooks/useMetrics'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type {
  InstallmentPlanResponse,
  InstallmentPlanStatus,
} from '../../types/transaction'

type Tab = 'plans' | 'links' | 'observations'

const PLAN_STATUS_LABEL: Record<InstallmentPlanStatus, string> = { active: '진행 중', completed: '완료', cancelled: '중단' }
function localDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function PlansTab() {
  const hasWrite = useWriteAccess()
  const plans = useInstallmentPlans()
  const create = useCreateInstallmentPlan()
  const patch = usePatchInstallmentPlan()
  const [searchParams] = useSearchParams()
  const [draft, setDraft] = useState({ display_name: '', merchant: searchParams.get('prefill_merchant') ?? '', payment_method: '', total_installments: '3', monthly_amount: searchParams.get('prefill_amount') ?? '', first_payment_date: localDate(), memo: '' })
  const [edits, setEdits] = useState<Record<number, { display_name: string; memo: string; status: InstallmentPlanStatus }>>({})

  useEffect(() => {
    const items = plans.data?.items
    if (!items) return
    setEdits((current) => {
      const next = { ...current }
      let changed = false
      for (const plan of items) {
        if (!next[plan.id]) { next[plan.id] = { display_name: plan.display_name, memo: plan.memo ?? '', status: plan.status }; changed = true }
      }
      return changed ? next : current
    })
  }, [plans.data])

  async function createPlan() {
    const total = Number.parseInt(draft.total_installments, 10)
    const monthly = Number.parseInt(draft.monthly_amount, 10)
    if (!draft.display_name.trim() || !draft.merchant.trim() || !draft.first_payment_date || !Number.isFinite(total) || !Number.isFinite(monthly)) {
      toast.error('필수 항목 확인', { description: '계획명·거래처·회차·월 금액·첫 결제일을 입력하세요' })
      return
    }
    try {
      const created = await create.mutateAsync({ display_name: draft.display_name.trim(), merchant: draft.merchant.trim(), payment_method: draft.payment_method.trim() || null, total_installments: total, monthly_amount: monthly, first_payment_date: draft.first_payment_date, memo: draft.memo.trim() || null })
      toast.success(`${created.display_name} 생성 완료`, { description: '거래 연결 탭에서 제안 회차를 확인해 연결하세요' })
      setDraft({ display_name: '', merchant: '', payment_method: '', total_installments: '3', monthly_amount: '', first_payment_date: localDate(), memo: '' })
    } catch (error) {
      toast.error('할부 계획 생성 실패', { description: String(error) })
    }
  }

  async function savePlan(plan: InstallmentPlanResponse) {
    const edit = edits[plan.id]
    if (!edit?.display_name.trim()) { toast.error('계획명을 입력하세요'); return }
    try {
      await patch.mutateAsync({ id: plan.id, data: { display_name: edit.display_name.trim(), memo: edit.memo.trim() || null, ...(edit.status !== plan.status ? { status: edit.status } : {}) } })
      toast.success(`${edit.display_name} 저장 완료`)
    } catch (error) {
      toast.error('저장 실패', { description: String(error) })
    }
  }

  return (
    <>
      <InstallmentCandidatesCard />
      <Card title="새 할부 항목 등록" meta="예정 일정과 거래 연결의 기준 계획">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="할부명"><TextInput placeholder="예: 맥북 3개월 할부" disabled={!hasWrite} value={draft.display_name} onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))} /></Field>
          <Field label="거래처"><TextInput disabled={!hasWrite} value={draft.merchant} onChange={(e) => setDraft((d) => ({ ...d, merchant: e.target.value }))} /></Field>
          <Field label="결제수단"><TextInput disabled={!hasWrite} value={draft.payment_method} onChange={(e) => setDraft((d) => ({ ...d, payment_method: e.target.value }))} /></Field>
          <Field label="총 개월"><TextInput type="number" min={1} disabled={!hasWrite} value={draft.total_installments} onChange={(e) => setDraft((d) => ({ ...d, total_installments: e.target.value }))} /></Field>
          <Field label="월 납입액"><TextInput type="number" min={1} disabled={!hasWrite} value={draft.monthly_amount} onChange={(e) => setDraft((d) => ({ ...d, monthly_amount: e.target.value }))} /></Field>
          <Field label="첫 청구일"><TextInput type="date" disabled={!hasWrite} value={draft.first_payment_date} onChange={(e) => setDraft((d) => ({ ...d, first_payment_date: e.target.value }))} /></Field>
          <Field label="메모" className="md:col-span-3"><TextInput disabled={!hasWrite} value={draft.memo} onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))} /></Field>
        </div>
        <div className="mt-3">
          <Button variant="primary" disabled={!hasWrite || create.isPending} onClick={() => void createPlan()}>할부 항목 저장</Button>
        </div>
      </Card>

      {plans.isLoading ? <ListSkeleton rows={3} /> :
       plans.data && plans.data.items.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {plans.data.items.map((plan) => {
            const edit = edits[plan.id] ?? { display_name: plan.display_name, memo: plan.memo ?? '', status: plan.status }
            return (
              <Card key={plan.id} title={<span className="flex items-center gap-2">{plan.display_name}<Badge variant={plan.status === 'completed' ? 'transfer' : plan.status === 'cancelled' ? 'neutral' : 'accent'}>{PLAN_STATUS_LABEL[plan.status]}</Badge></span>} meta={`${plan.merchant} · ${plan.payment_method ?? '결제수단 미지정'} · 총 ${plan.total_installments}회 · 월 ${formatWon(plan.monthly_amount)}`} action={<Button variant="primary" disabled={!hasWrite || patch.isPending} onClick={() => void savePlan(plan)}>저장</Button>}>
                <div className="grid gap-2">
                  <Field label="진행 상태" hint="완료·중단한 계획은 향후 예정 금액에서 제외합니다"><Select aria-label={`${plan.display_name} 진행 상태`} disabled={!hasWrite || patch.isPending} value={edit.status} onChange={(e) => setEdits((current) => ({ ...current, [plan.id]: { ...edit, status: e.target.value as InstallmentPlanStatus } }))}>{(Object.entries(PLAN_STATUS_LABEL) as [InstallmentPlanStatus, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                  <Field label="표시명"><TextInput disabled={!hasWrite} value={edit.display_name} onChange={(e) => setEdits((c) => ({ ...c, [plan.id]: { ...edit, display_name: e.target.value } }))} /></Field>
                  <Field label="메모"><TextInput disabled={!hasWrite} value={edit.memo} onChange={(e) => setEdits((c) => ({ ...c, [plan.id]: { ...edit, memo: e.target.value } }))} /></Field>
                </div>
              </Card>
            )
          })}
        </div>
      ) : <EmptyState message="등록된 할부 계획이 없습니다" />}
    </>
  )
}

function ObservationsTab() {
  const [period, setPeriod] = useState<string | null>(null)
  const status = useReadDataStatus()
  const commitments = useCommitments(period)
  const items = (commitments.data?.data.items ?? []).filter((item) => item.kind === 'installment')
  const periods = status.data?.data.periods ?? []
  return (
    <Card title="할부 관측 여부" meta="기록된 속성과 선택한 달의 연결 기록입니다. 앞으로의 출금 예측이나 미납 판정이 아닙니다.">
      <label className="mb-3 flex flex-wrap items-center gap-2 text-caption text-text-muted">
        관측할 달
        <Select aria-label="할부 관측할 달" value={period ?? commitments.data?.data.period ?? ''} onChange={(event) => setPeriod(event.target.value)}>
          {[...periods].reverse().map((item) => <option key={item.period} value={item.period}>{item.period}</option>)}
        </Select>
      </label>
      {commitments.isLoading ? <ListSkeleton rows={3} /> : commitments.error ? (
        <ErrorState message="할부 관측 기록을 불러오지 못했습니다." onRetry={() => void commitments.refetch()} />
      ) : items.length === 0 ? <EmptyState message="기록된 할부가 없습니다" /> : (
        <ul className="divide-y divide-border-subtle">
          {items.map((item) => (
            <li key={item.commitment_key} className="space-y-1 py-3 text-caption text-text-secondary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-label text-text-primary">{item.name}</strong>
                <Badge variant="neutral">{item.observation.state_label}</Badge>
              </div>
              <p>월 부담 {item.monthly_burden == null ? '기록 없음' : formatWon(item.monthly_burden)} · {item.monthly_burden_basis_label}</p>
              <p>남은 회차 {item.remaining_count == null ? '확인 불가' : `${item.remaining_count}회`} · 마지막 회차 예정일 {item.end_date ?? '확인 불가'}</p>
              <p>이 달 연결된 결제 {formatWon(item.observation.observed_amount)} · {item.observation.reason_label}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function InstallmentsPage() {
  const [tab, setTab] = useState<Tab>('plans')
  const plans = useInstallmentPlans()
  const mappings = useInstallmentTransactionMappings({ page: 1, per_page: 1 })

  const activePlans = (plans.data?.items ?? []).filter((p) => p.status === 'active').length

  return (
    <>
      <PageHeader
        title="작업대 · 할부"
        controls={
          <SegmentedControl
            ariaLabel="할부 탭"
            options={[{ value: 'plans', label: '계획' }, { value: 'links', label: '거래 연결' }, { value: 'observations', label: '관측 여부' }] as const}
            value={tab}
            onChange={setTab}
          />
        }
      />
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="진행 중 계획" value={String(activePlans)} sub={`전체 ${plans.data?.items.length ?? 0}개`} />
          <Stat label="연결 후보" value={String(mappings.data?.total ?? 0)} sub="현재 필터" />

        </div>
        {tab === 'plans' ? <PlansTab /> : tab === 'links' ? <InstallmentLinksTab /> : <ObservationsTab />}
      </div>
    </>
  )
}
