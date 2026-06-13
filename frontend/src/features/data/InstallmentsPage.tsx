import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { BulkBar } from '../../ds/BulkBar'
import { Field, Select, TextInput } from '../../ds/Field'
import { Pagination } from '../../ds/Pagination'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { Stat } from '../../ds/Stat'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { EM_DASH, formatSignedWon, formatWon, formatWonCompact } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import {
  useBulkLinkTransactionsToInstallment,
  useCreateInstallmentPlan,
  useInstallmentForecast,
  useInstallmentPlans,
  useInstallmentTransactionMappings,
  useLinkTransactionToInstallment,
  usePatchInstallmentPlan,
  useUnlinkTransactionFromInstallment,
} from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type {
  InstallmentForecastStatus,
  InstallmentLinkStateFilter,
  InstallmentPlanResponse,
  InstallmentPlanStatus,
} from '../../types/transaction'

type Tab = 'plans' | 'links' | 'forecast'
const PAGE_SIZE = 40

const PLAN_STATUS_LABEL: Record<InstallmentPlanStatus, string> = { active: '진행 중', completed: '완료', cancelled: '중단' }
const FORECAST_STATUS: Record<InstallmentForecastStatus, { label: string; variant: 'accent' | 'warn' | 'expense' }> = {
  observed: { label: '관측됨', variant: 'accent' },
  projected: { label: '예정', variant: 'warn' },
  missed: { label: '누락', variant: 'expense' },
}

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
  const [edits, setEdits] = useState<Record<number, { display_name: string; memo: string }>>({})

  useEffect(() => {
    const items = plans.data?.items
    if (!items) return
    setEdits((current) => {
      const next = { ...current }
      let changed = false
      for (const plan of items) {
        if (!next[plan.id]) { next[plan.id] = { display_name: plan.display_name, memo: plan.memo ?? '' }; changed = true }
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
      toast.success(`${created.display_name} 생성 완료`)
      setDraft({ display_name: '', merchant: '', payment_method: '', total_installments: '3', monthly_amount: '', first_payment_date: localDate(), memo: '' })
    } catch (error) {
      toast.error('할부 계획 생성 실패', { description: String(error) })
    }
  }

  async function savePlan(plan: InstallmentPlanResponse) {
    const edit = edits[plan.id]
    if (!edit?.display_name.trim()) { toast.error('계획명을 입력하세요'); return }
    try {
      await patch.mutateAsync({ id: plan.id, data: { display_name: edit.display_name.trim(), memo: edit.memo.trim() || null } })
      toast.success(`${edit.display_name} 저장 완료`)
    } catch (error) {
      toast.error('저장 실패', { description: String(error) })
    }
  }

  return (
    <>
      <Card title="새 할부 항목 등록" meta="forecast와 거래 연결의 기준 계획">
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
            const edit = edits[plan.id] ?? { display_name: plan.display_name, memo: plan.memo ?? '' }
            return (
              <Card key={plan.id} title={<span className="flex items-center gap-2">{plan.display_name}<Badge variant={plan.status === 'completed' ? 'transfer' : plan.status === 'cancelled' ? 'neutral' : 'accent'}>{PLAN_STATUS_LABEL[plan.status]}</Badge></span>} meta={`${plan.merchant} · ${plan.payment_method ?? '결제수단 미지정'} · 총 ${plan.total_installments}회 · 월 ₩${formatWon(plan.monthly_amount)}`} action={<Button variant="primary" disabled={!hasWrite || patch.isPending} onClick={() => void savePlan(plan)}>저장</Button>}>
                <div className="grid gap-2">
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

function LinksTab() {
  const hasWrite = useWriteAccess()
  const plans = useInstallmentPlans()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState<{ search: string; linked: InstallmentLinkStateFilter; plan: string }>({ search: searchParams.get('search') ?? '', linked: (searchParams.get('linked') as InstallmentLinkStateFilter) || 'all', plan: '' })
  const [applied, setApplied] = useState(filter)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkPlan, setBulkPlan] = useState('')
  const [bulkStart, setBulkStart] = useState('1')
  const link = useLinkTransactionToInstallment()
  const unlink = useUnlinkTransactionFromInstallment()
  const bulkLink = useBulkLinkTransactionsToInstallment()
  const [rowDrafts, setRowDrafts] = useState<Record<number, { plan: string; number: string }>>({})

  const mappings = useInstallmentTransactionMappings({ page, per_page: PAGE_SIZE, search: applied.search || undefined, linked: applied.linked, installment_plan_id: applied.plan ? Number(applied.plan) : undefined })
  const items = mappings.data?.items ?? []

  async function saveRow(transactionId: number) {
    const draft = rowDrafts[transactionId]
    const planId = Number(draft?.plan)
    const number = Number(draft?.number)
    if (!Number.isFinite(planId) || !Number.isFinite(number)) { toast.error('계획과 회차를 입력하세요'); return }
    try {
      await link.mutateAsync({ id: transactionId, data: { installment_plan_id: planId, installment_number: number, memo: null } })
      toast.success('연결 저장 완료')
    } catch (error) {
      toast.error('연결 실패', { description: String(error) })
    }
  }

  async function applyBulk() {
    const planId = Number(bulkPlan)
    const start = Number(bulkStart)
    if (!Number.isFinite(planId) || !Number.isFinite(start) || selected.size === 0) return
    try {
      const result = await bulkLink.mutateAsync({ transaction_ids: [...selected], installment_plan_id: planId, start_installment_number: start, memo: null })
      toast.success(`${result.updated}건 일괄 연결 완료`)
      setSelected(new Set())
      setBulkPlan('')
    } catch (error) {
      toast.error('일괄 연결 실패', { description: String(error) })
    }
  }

  const inputCls = 'rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-caption text-text-secondary'

  return (
    <>
      <Card title="거래 연결 후보" action={<div className="flex gap-2"><Button variant="primary" onClick={() => { setApplied(filter); setPage(1) }}>적용</Button><Button variant="ghost" onClick={() => { const reset = { search: '', linked: 'all' as InstallmentLinkStateFilter, plan: '' }; setFilter(reset); setApplied(reset); setPage(1) }}>초기화</Button></div>}>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputCls} w-40`} placeholder="거래처·설명 검색" value={filter.search} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))} />
          <Select className={inputCls} value={filter.linked} onChange={(e) => setFilter((f) => ({ ...f, linked: e.target.value as InstallmentLinkStateFilter }))} aria-label="연결 상태"><option value="all">연결 상태 전체</option><option value="linked">연결됨</option><option value="unlinked">미연결</option></Select>
          <Select className={inputCls} value={filter.plan} onChange={(e) => setFilter((f) => ({ ...f, plan: e.target.value }))} aria-label="계획"><option value="">계획 전체</option>{plans.data?.items.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select>
        </div>
      </Card>

      <Card title="할부 연결 후보 목록" meta={`${items.length} / ${mappings.data?.total ?? 0}건`} bodyClassName="p-0">
        {mappings.isLoading ? <div className="p-4"><ListSkeleton rows={6} /></div> :
         items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-label">
              <thead className="bg-bg-inset">
                <tr>
                  <th className="px-3 py-2"><input type="checkbox" aria-label="페이지 전체 선택" checked={items.length > 0 && items.every((i) => selected.has(i.transaction_id))} onChange={() => setSelected((c) => { const n = new Set(c); const all = items.every((i) => n.has(i.transaction_id)); items.forEach((i) => all ? n.delete(i.transaction_id) : n.add(i.transaction_id)); return n })} className="h-3 w-3 accent-[var(--ds-accent-fg)]" /></th>
                  {['날짜', '거래처', '현재 연결', '빠른 연결', '금액'].map((h) => <th key={h} className="px-3 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((item) => {
                  const draft = rowDrafts[item.transaction_id] ?? { plan: item.link ? String(item.link.installment_plan_id) : '', number: item.link ? String(item.link.installment_number) : '1' }
                  return (
                    <tr key={item.transaction_id} className={selected.has(item.transaction_id) ? 'bg-bg-selected' : ''}>
                      <td className="px-3 py-2 align-top"><input type="checkbox" aria-label={`${item.merchant} 선택`} checked={selected.has(item.transaction_id)} onChange={() => setSelected((c) => { const n = new Set(c); if (n.has(item.transaction_id)) n.delete(item.transaction_id); else n.add(item.transaction_id); return n })} className="h-3 w-3 accent-[var(--ds-accent-fg)]" /></td>
                      <td className="tnum px-3 py-2 align-top text-text-faint">{item.date.slice(5)}</td>
                      <td className="max-w-[140px] px-3 py-2 align-top"><div className="truncate text-text-primary">{item.merchant}</div><div className="truncate text-micro text-text-faint">{item.payment_method ?? ''}</div></td>
                      <td className="px-3 py-2 align-top">{item.link ? <><Badge variant="transfer">{item.link.installment_plan_display_name}</Badge><div className="tnum mt-1 text-micro text-text-muted">{item.link.installment_number} / {item.link.total_installments}회차</div></> : <Badge variant="warn">미연결</Badge>}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap items-end gap-1.5">
                          <Select className="min-w-32 text-caption" aria-label={`${item.merchant} 연결 계획`} disabled={!hasWrite} value={draft.plan} onChange={(e) => setRowDrafts((c) => ({ ...c, [item.transaction_id]: { ...draft, plan: e.target.value } }))}><option value="">— 계획 —</option>{plans.data?.items.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select>
                          <input type="number" min={1} aria-label={`${item.merchant} 회차`} className={`${inputCls} w-16`} disabled={!hasWrite} value={draft.number} onChange={(e) => setRowDrafts((c) => ({ ...c, [item.transaction_id]: { ...draft, number: e.target.value } }))} />
                          <Button size="sm" variant="primary" disabled={!hasWrite || !draft.plan || link.isPending} onClick={() => void saveRow(item.transaction_id)}>연결</Button>
                          <Button size="sm" variant="ghost" disabled={!hasWrite || item.link == null || unlink.isPending} onClick={async () => { try { await unlink.mutateAsync(item.transaction_id); toast.success('연결 해제 완료') } catch (e) { toast.error('해제 실패', { description: String(e) }) } }}>해제</Button>
                        </div>
                      </td>
                      <td className={`tnum px-3 py-2 align-top text-right font-semibold ${item.amount < 0 ? 'text-expense' : 'text-income'}`}>{formatSignedWon(item.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={page} perPage={PAGE_SIZE} total={mappings.data?.total ?? 0} onPageChange={setPage} />
          </div>
        ) : <EmptyState className="py-10" message="조건에 맞는 할부 연결 후보가 없습니다" />}
      </Card>

      <BulkBar count={selected.size} onClear={() => { setSelected(new Set()); setBulkPlan('') }}>
        <Select className="text-caption" aria-label="일괄 연결 계획" value={bulkPlan} onChange={(e) => setBulkPlan(e.target.value)}><option value="">— 계획 선택 —</option>{plans.data?.items.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select>
        <Field label="시작 회차"><input type="number" min={1} aria-label="시작 회차" className={`${inputCls} w-20`} value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} /></Field>
        <Button variant="primary" disabled={!hasWrite || !bulkPlan || bulkLink.isPending} onClick={() => void applyBulk()}>일괄 연결 (연속 회차)</Button>
      </BulkBar>
    </>
  )
}

function ForecastTab() {
  const [asOf, setAsOf] = useState(localDate())
  const [months, setMonths] = useState('6')
  const forecast = useInstallmentForecast({ as_of_date: asOf || undefined, months: Number.parseInt(months, 10) || 6 })
  const summary = forecast.data?.monthly_summary ?? []

  const inputCls = 'rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-caption text-text-secondary'

  return (
    <Card title="월별 남은 할부 예측" meta={`${months}개월`} action={
      <div className="flex items-center gap-2">
        <input type="date" className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="기준일" />
        <input type="number" min={1} max={24} className={`${inputCls} w-20`} value={months} onChange={(e) => setMonths(e.target.value)} aria-label="개월 수" />
      </div>
    } bodyClassName="p-0">
      {forecast.isLoading ? <div className="p-4"><ListSkeleton rows={5} /></div> :
       summary.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-label">
              <thead className="bg-bg-inset"><tr>{['Month', 'Observed', 'Projected', 'Missed', 'Remaining'].map((h) => <th key={h} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {summary.map((item) => (
                  <tr key={item.period}>
                    <td className="tnum px-4 py-2 font-semibold text-text-primary">{item.period}</td>
                    <td className="tnum px-4 py-2 text-text-secondary">{formatWonCompact(item.observed_total)}</td>
                    <td className="tnum px-4 py-2 text-text-muted">{formatWonCompact(item.projected_total)}</td>
                    <td className="tnum px-4 py-2 text-expense">{formatWonCompact(item.missed_total)}</td>
                    <td className="tnum px-4 py-2 text-text-secondary">{formatWonCompact(item.projected_total + item.missed_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {forecast.data && forecast.data.items.length > 0 ? (
            <div className="grid gap-2 p-4 xl:grid-cols-2">
              {forecast.data.items.slice(0, 8).map((item) => (
                <div key={`${item.installment_plan_id}-${item.installment_number}`} className="rounded-md border border-border-subtle bg-bg-inset px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="truncate text-label font-semibold text-text-primary">{item.installment_plan_display_name}</span><Badge variant={FORECAST_STATUS[item.status].variant}>{FORECAST_STATUS[item.status].label}</Badge></div>
                      <div className="tnum mt-1 text-micro text-text-muted">{item.installment_number} / {item.total_installments}회차 · 예정 {item.due_date}</div>
                    </div>
                    <span className="tnum shrink-0 text-label font-semibold text-text-secondary">{formatWon(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : <EmptyState className="py-10" message="표시할 할부 예측이 없습니다" />}
    </Card>
  )
}

export function InstallmentsPage() {
  const [tab, setTab] = useState<Tab>('plans')
  const plans = useInstallmentPlans()
  const mappings = useInstallmentTransactionMappings({ page: 1, per_page: 1 })
  const forecast = useInstallmentForecast({ months: 6 })

  const activePlans = (plans.data?.items ?? []).filter((p) => p.status === 'active').length
  const totalRemaining = (forecast.data?.monthly_summary ?? []).reduce((sum, i) => sum + i.projected_total + i.missed_total, 0)
  const totalMissed = (forecast.data?.monthly_summary ?? []).reduce((sum, i) => sum + i.missed_total, 0)

  return (
    <>
      <PageHeader
        title="데이터 · 할부"
        controls={
          <SegmentedControl
            ariaLabel="할부 탭"
            options={[{ value: 'plans', label: '계획' }, { value: 'links', label: '거래 연결' }, { value: 'forecast', label: '예측' }] as const}
            value={tab}
            onChange={setTab}
          />
        }
      />
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="진행 중 계획" value={String(activePlans)} sub={`전체 ${plans.data?.items.length ?? 0}개`} />
          <Stat label="연결 후보" value={String(mappings.data?.total ?? 0)} sub="현재 필터" />
          <Stat label="잔여 예정" value={totalRemaining > 0 ? formatWonCompact(totalRemaining) : EM_DASH} subTone={totalRemaining > 0 ? 'bad' : 'neutral'} />
          <Stat label="누락" value={totalMissed > 0 ? formatWonCompact(totalMissed) : '없음'} subTone={totalMissed > 0 ? 'bad' : 'good'} />
        </div>
        {tab === 'plans' ? <PlansTab /> : tab === 'links' ? <LinksTab /> : <ForecastTab />}
      </div>
    </>
  )
}
