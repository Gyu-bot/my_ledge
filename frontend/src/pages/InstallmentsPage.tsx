import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertBanner } from '../components/ui/AlertBanner'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { KpiCard } from '../components/ui/KpiCard'
import { LoadingState } from '../components/ui/LoadingState'
import { Pagination } from '../components/ui/Pagination'
import { SectionCard } from '../components/ui/SectionCard'
import { useChromeContext } from '../components/layout/chromeContext'
import {
  useBulkLinkTransactionsToInstallment,
  useCreateInstallmentPlan,
  useInstallmentForecast,
  useInstallmentPlans,
  useInstallmentTransactionMappings,
  useLinkTransactionToInstallment,
  usePatchInstallmentPlan,
  useUnlinkTransactionFromInstallment,
} from '../hooks/useTransactions'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { formatKRW } from '../lib/utils'
import type {
  InstallmentForecastItem,
  InstallmentForecastStatus,
  InstallmentLinkStateFilter,
  InstallmentPlanResponse,
  InstallmentPlanStatus,
  InstallmentTransactionMappingItem,
} from '../types/transaction'

interface PlanDraft {
  display_name: string
  memo: string
}

interface NewPlanDraft {
  display_name: string
  merchant: string
  payment_method: string
  total_installments: string
  monthly_amount: string
  first_payment_date: string
  memo: string
}

interface LinkFilterState {
  search: string
  start_date: string
  end_date: string
  linked: InstallmentLinkStateFilter
  installment_plan_id: string
}

interface BulkLinkDraft {
  installment_plan_id: string
  start_installment_number: string
  memo: string
}

interface RowLinkDraft {
  installment_plan_id: string
  installment_number: string
  memo: string
}

interface ForecastFilterState {
  as_of_date: string
  months: string
}

const PAGE_SIZE = 40

const DEFAULT_LINK_FILTER: LinkFilterState = {
  search: '',
  start_date: '',
  end_date: '',
  linked: 'all',
  installment_plan_id: '',
}

const DEFAULT_BULK_LINK_DRAFT: BulkLinkDraft = {
  installment_plan_id: '',
  start_installment_number: '1',
  memo: '',
}

const DEFAULT_FORECAST_MONTHS = '6'

function parseLinkedFilter(value: string | null): InstallmentLinkStateFilter {
  if (value === 'linked' || value === 'unlinked') return value
  return 'all'
}

function parsePrefillAmount(value: string | null) {
  if (!value) return ''
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return ''
  return String(Math.round(parsed))
}

function localDateValue() {
  const now = new Date()
  const offsetMinutes = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offsetMinutes * 60_000)
  return local.toISOString().slice(0, 10)
}

function createNewPlanDraft(): NewPlanDraft {
  return {
    display_name: '',
    merchant: '',
    payment_method: '',
    total_installments: '3',
    monthly_amount: '',
    first_payment_date: localDateValue(),
    memo: '',
  }
}

function createPlanDraft(plan: InstallmentPlanResponse): PlanDraft {
  return {
    display_name: plan.display_name,
    memo: plan.memo ?? '',
  }
}

function createStateFromSearch(search: string) {
  const params = new URLSearchParams(search)
  const filter: LinkFilterState = {
    ...DEFAULT_LINK_FILTER,
    search: params.get('search')?.trim() ?? '',
    linked: parseLinkedFilter(params.get('linked')),
  }

  const newPlanDraft: NewPlanDraft = {
    ...createNewPlanDraft(),
    merchant: params.get('prefill_merchant')?.trim() ?? '',
    monthly_amount: parsePrefillAmount(params.get('prefill_amount')),
  }

  return { filter, newPlanDraft }
}

function createRowLinkDraft(item: InstallmentTransactionMappingItem): RowLinkDraft {
  return {
    installment_plan_id: item.link?.installment_plan_id != null ? String(item.link.installment_plan_id) : '',
    installment_number: item.link?.installment_number != null ? String(item.link.installment_number) : '1',
    memo: item.link?.memo ?? '',
  }
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function money(value: number | null | undefined) {
  if (value == null) return '—'
  return `₩ ${formatKRW(value)}`
}

function expenseMoney(value: number) {
  return `${value < 0 ? '-' : '+'}₩${formatKRW(Math.abs(value))}`
}

function planStatusLabel(status: InstallmentPlanStatus) {
  if (status === 'completed') return '완료'
  if (status === 'cancelled') return '중단'
  return '진행 중'
}

function planStatusClass(status: InstallmentPlanStatus) {
  if (status === 'completed') return 'bg-info-dim border-info-muted text-info-default'
  if (status === 'cancelled') return 'bg-surface-section border-border-subtle text-text-muted'
  return 'bg-accent-dim border-accent-muted text-accent'
}

function forecastStatusLabel(status: InstallmentForecastStatus) {
  if (status === 'observed') return '관측됨'
  if (status === 'missed') return '누락'
  return '예정'
}

function forecastStatusClass(status: InstallmentForecastStatus) {
  if (status === 'observed') return 'bg-info-dim border-info-muted text-info-default'
  if (status === 'missed') return 'bg-danger-dim border-danger-muted text-danger'
  return 'bg-warn-dim border-warn-muted text-warn'
}

export function InstallmentsPage() {
  const location = useLocation()
  const initialState = createStateFromSearch(location.search)
  const hasWrite = useWriteAccess()
  const { setMetaBadge } = useChromeContext()
  const selectPageCheckboxRef = useRef<HTMLInputElement | null>(null)
  const [alert, setAlert] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)
  const [newPlanDraft, setNewPlanDraft] = useState<NewPlanDraft>(initialState.newPlanDraft)
  const [planDrafts, setPlanDrafts] = useState<Record<number, PlanDraft>>({})
  const [filterDraft, setFilterDraft] = useState<LinkFilterState>(initialState.filter)
  const [appliedFilter, setAppliedFilter] = useState<LinkFilterState>(initialState.filter)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkLinkDraft, setBulkLinkDraft] = useState<BulkLinkDraft>(DEFAULT_BULK_LINK_DRAFT)
  const [rowLinkDrafts, setRowLinkDrafts] = useState<Record<number, RowLinkDraft>>({})
  const [forecastFilter, setForecastFilter] = useState<ForecastFilterState>({
    as_of_date: localDateValue(),
    months: DEFAULT_FORECAST_MONTHS,
  })

  const installmentPlanId = parsePositiveInteger(appliedFilter.installment_plan_id)
  const forecastMonths = parsePositiveInteger(forecastFilter.months) ?? Number.parseInt(DEFAULT_FORECAST_MONTHS, 10)
  const mappingParams = {
    page,
    per_page: PAGE_SIZE,
    search: appliedFilter.search || undefined,
    start_date: appliedFilter.start_date || undefined,
    end_date: appliedFilter.end_date || undefined,
    linked: appliedFilter.linked,
    installment_plan_id: installmentPlanId ?? undefined,
  }

  const plans = useInstallmentPlans()
  const mappings = useInstallmentTransactionMappings(mappingParams)
  const forecast = useInstallmentForecast({
    as_of_date: forecastFilter.as_of_date || undefined,
    months: forecastMonths,
  })
  const createPlanMutation = useCreateInstallmentPlan()
  const patchPlanMutation = usePatchInstallmentPlan()
  const linkMutation = useLinkTransactionToInstallment()
  const unlinkMutation = useUnlinkTransactionFromInstallment()
  const bulkLinkMutation = useBulkLinkTransactionsToInstallment()

  useEffect(() => {
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {plans.data?.items.length ?? 0}개 계획
      </span>,
    )
    return () => setMetaBadge(null)
  }, [plans.data?.items.length, setMetaBadge])

  useEffect(() => {
    if (!plans.data?.items) return
    setPlanDrafts((current) => {
      const next = { ...current }
      let changed = false
      for (const plan of plans.data.items) {
        if (!next[plan.id]) {
          next[plan.id] = createPlanDraft(plan)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [plans.data])

  useEffect(() => {
    if (!mappings.data?.items) return
    setRowLinkDrafts((current) => {
      const next = { ...current }
      let changed = false
      for (const item of mappings.data.items) {
        if (!next[item.transaction_id]) {
          next[item.transaction_id] = createRowLinkDraft(item)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [mappings.data])

  useEffect(() => {
    setSelectedIds(new Set())
    setBulkLinkDraft(DEFAULT_BULK_LINK_DRAFT)
  }, [page, appliedFilter])

  const visibleIds = mappings.data?.items.map((item) => item.transaction_id) ?? []
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id))

  useEffect(() => {
    if (selectPageCheckboxRef.current) {
      selectPageCheckboxRef.current.indeterminate = someVisibleSelected && !allVisibleSelected
    }
  }, [allVisibleSelected, someVisibleSelected])

  useEffect(() => {
    const next = createStateFromSearch(location.search)
    setFilterDraft(next.filter)
    setAppliedFilter(next.filter)
    setNewPlanDraft(next.newPlanDraft)
    setPage(1)
  }, [location.search])

  function applyFilter() {
    setAppliedFilter(filterDraft)
    setPage(1)
  }

  function resetFilter() {
    setFilterDraft(DEFAULT_LINK_FILTER)
    setAppliedFilter(DEFAULT_LINK_FILTER)
    setPage(1)
  }

  function toggleSelectVisible() {
    if (!hasWrite || visibleIds.length === 0) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function toggleSelect(item: InstallmentTransactionMappingItem) {
    if (!hasWrite) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(item.transaction_id)) next.delete(item.transaction_id)
      else next.add(item.transaction_id)
      return next
    })
  }

  async function createPlan() {
    const totalInstallments = parsePositiveInteger(newPlanDraft.total_installments)
    const monthlyAmount = parsePositiveInteger(newPlanDraft.monthly_amount)
    const displayName = newPlanDraft.display_name.trim()
    const merchant = newPlanDraft.merchant.trim()

    if (!displayName || !merchant || !newPlanDraft.first_payment_date || totalInstallments == null || monthlyAmount == null) {
      setAlert({ variant: 'error', title: '필수 항목 확인 필요', description: '계획명, 거래처, 회차 수, 월 금액, 첫 결제일을 입력하세요.' })
      return
    }

    try {
      const created = await createPlanMutation.mutateAsync({
        display_name: displayName,
        merchant,
        payment_method: newPlanDraft.payment_method.trim() || null,
        total_installments: totalInstallments,
        monthly_amount: monthlyAmount,
        first_payment_date: newPlanDraft.first_payment_date,
        memo: newPlanDraft.memo.trim() || null,
      })
      setNewPlanDraft(createNewPlanDraft())
      setAlert({ variant: 'success', title: `${created.display_name} 생성 완료` })
    } catch (error) {
      setAlert({ variant: 'error', title: '할부 계획 생성 실패', description: String(error) })
    }
  }

  async function savePlan(plan: InstallmentPlanResponse) {
    const draft = planDrafts[plan.id] ?? createPlanDraft(plan)
    const displayName = draft.display_name.trim()

    if (!displayName) {
      setAlert({ variant: 'error', title: '계획명을 입력하세요.' })
      return
    }

    try {
      await patchPlanMutation.mutateAsync({
        id: plan.id,
        data: {
          display_name: displayName,
          memo: draft.memo.trim() || null,
        },
      })
      setAlert({ variant: 'success', title: `${displayName} 저장 완료` })
    } catch (error) {
      setAlert({ variant: 'error', title: '할부 계획 저장 실패', description: String(error) })
    }
  }

  async function saveRowLink(item: InstallmentTransactionMappingItem) {
    const draft = rowLinkDrafts[item.transaction_id] ?? createRowLinkDraft(item)
    const planId = parsePositiveInteger(draft.installment_plan_id)
    const installmentNumber = parsePositiveInteger(draft.installment_number)

    if (planId == null || installmentNumber == null) {
      setAlert({ variant: 'error', title: '연결 정보 확인 필요', description: '계획과 회차를 모두 입력하세요.' })
      return
    }

    try {
      const linked = await linkMutation.mutateAsync({
        id: item.transaction_id,
        data: {
          installment_plan_id: planId,
          installment_number: installmentNumber,
          memo: draft.memo.trim() || null,
        },
      })
      setRowLinkDrafts((current) => ({
        ...current,
        [item.transaction_id]: {
          installment_plan_id: String(linked.installment_plan_id),
          installment_number: String(linked.installment_number),
          memo: linked.memo ?? '',
        },
      }))
      setAlert({ variant: 'success', title: `${item.description} 연결 저장 완료` })
    } catch (error) {
      setAlert({ variant: 'error', title: '거래 연결 저장 실패', description: String(error) })
    }
  }

  async function unlinkRow(item: InstallmentTransactionMappingItem) {
    try {
      await unlinkMutation.mutateAsync(item.transaction_id)
      setRowLinkDrafts((current) => ({
        ...current,
        [item.transaction_id]: createRowLinkDraft({ ...item, link: null }),
      }))
      setAlert({ variant: 'success', title: `${item.description} 연결 해제 완료` })
    } catch (error) {
      setAlert({ variant: 'error', title: '거래 연결 해제 실패', description: String(error) })
    }
  }

  async function applyBulkLink() {
    const planId = parsePositiveInteger(bulkLinkDraft.installment_plan_id)
    const startInstallmentNumber = parsePositiveInteger(bulkLinkDraft.start_installment_number)
    if (planId == null || startInstallmentNumber == null || selectedIds.size === 0) return

    try {
      const result = await bulkLinkMutation.mutateAsync({
        transaction_ids: [...selectedIds],
        installment_plan_id: planId,
        start_installment_number: startInstallmentNumber,
        memo: bulkLinkDraft.memo.trim() || null,
      })
      setSelectedIds(new Set())
      setBulkLinkDraft(DEFAULT_BULK_LINK_DRAFT)
      setAlert({ variant: 'success', title: `${result.updated}건 일괄 연결 완료` })
    } catch (error) {
      setAlert({ variant: 'error', title: '일괄 연결 실패', description: String(error) })
    }
  }

  const inputCls = 'text-caption text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5 disabled:opacity-40'
  const isLoading = plans.isLoading || mappings.isLoading || forecast.isLoading
  const isError = plans.isError || mappings.isError || forecast.isError
  const selectedCount = selectedIds.size
  const activePlans = (plans.data?.items ?? []).filter((plan) => plan.status === 'active').length
  const planItems = plans.data?.items ?? []
  const totalRemaining = (forecast.data?.monthly_summary ?? []).reduce(
    (sum, item) => sum + item.projected_total + item.missed_total,
    0,
  )
  const totalMissed = (forecast.data?.monthly_summary ?? []).reduce((sum, item) => sum + item.missed_total, 0)
  const totalObserved = (forecast.data?.monthly_summary ?? []).reduce((sum, item) => sum + item.observed_total, 0)

  if (isLoading) return <LoadingState />
  if (isError) {
    return (
      <ErrorState
        onRetry={() => {
          void plans.refetch()
          void mappings.refetch()
          void forecast.refetch()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {alert && (
        <AlertBanner
          variant={alert.variant}
          title={alert.title}
          description={alert.description}
          onDismiss={() => setAlert(null)}
        />
      )}

      {!hasWrite && (
        <AlertBanner
          variant="warn"
          title="읽기 전용 모드"
          description="API 키가 없어 할부 계획 생성, 거래 연결, 메모 저장이 비활성화됩니다."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active plans" value={String(activePlans)} sub={`${plans.data?.items.length ?? 0}개 전체 계획`} />
        <KpiCard label="Candidates" value={String(mappings.data?.total ?? 0)} sub={`현재 필터 · ${Math.max(1, Math.ceil((mappings.data?.total ?? 0) / PAGE_SIZE))}페이지`} />
        <KpiCard label="Remaining forecast" value={money(totalRemaining)} sub={`${forecastMonths}개월 잔여 예정`} subVariant={totalRemaining > 0 ? 'down' : 'neutral'} />
        <KpiCard label="Missed installments" value={money(totalMissed)} sub={`관측 ${money(totalObserved)}`} subVariant={totalMissed > 0 ? 'down' : 'up'} />
      </div>

      <SectionCard
        title="할부 항목 관리"
        meta={`${plans.data?.items.length ?? 0}개 계획`}
        description="할부 계획을 등록하고, 표시명과 메모를 운영 화면에서 유지합니다."
      >
        <div className="space-y-3">
          <div className="rounded-card border border-border-subtle bg-surface-section p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-caption font-semibold text-text-secondary">새 할부 항목 등록</div>
                <div className="mt-0.5 text-micro text-text-ghost">거래처, 월 금액, 회차 수, 첫 결제일을 기준으로 forecast와 거래 연결의 기준 계획을 만듭니다.</div>
              </div>
              <button
                type="button"
                onClick={() => void createPlan()}
                disabled={!hasWrite || createPlanMutation.isPending}
                className="text-caption px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md disabled:opacity-40"
              >
                할부 항목 저장
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">할부명</span>
                <input
                  aria-label="할부명"
                  className={inputCls}
                  placeholder="예: 맥북 3개월 할부"
                  value={newPlanDraft.display_name}
                  disabled={!hasWrite}
                  onChange={(event) => setNewPlanDraft((current) => ({ ...current, display_name: event.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">거래처</span>
                <input
                  aria-label="거래처"
                  className={inputCls}
                  placeholder="거래처"
                  value={newPlanDraft.merchant}
                  disabled={!hasWrite}
                  onChange={(event) => setNewPlanDraft((current) => ({ ...current, merchant: event.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">결제수단</span>
                <input
                  aria-label="결제수단"
                  className={inputCls}
                  placeholder="결제수단"
                  value={newPlanDraft.payment_method}
                  disabled={!hasWrite}
                  onChange={(event) => setNewPlanDraft((current) => ({ ...current, payment_method: event.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">총 개월</span>
                <input
                  aria-label="총 개월"
                  type="number"
                  min={1}
                  className={inputCls}
                  value={newPlanDraft.total_installments}
                  disabled={!hasWrite}
                  onChange={(event) => setNewPlanDraft((current) => ({ ...current, total_installments: event.target.value }))}
                />
                <span className="text-micro text-text-ghost">카드 할부 전체 회차</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">월 납입액</span>
                <input
                  aria-label="월 납입액"
                  type="number"
                  min={1}
                  className={inputCls}
                  value={newPlanDraft.monthly_amount}
                  disabled={!hasWrite}
                  onChange={(event) => setNewPlanDraft((current) => ({ ...current, monthly_amount: event.target.value }))}
                />
                <span className="text-micro text-text-ghost">매월 청구 예상액</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">첫 청구일</span>
                <input
                  aria-label="첫 청구일"
                  type="date"
                  className={inputCls}
                  value={newPlanDraft.first_payment_date}
                  disabled={!hasWrite}
                  onChange={(event) => setNewPlanDraft((current) => ({ ...current, first_payment_date: event.target.value }))}
                />
                <span className="text-micro text-text-ghost">1회차 청구 날짜</span>
              </label>
              <input
                aria-label="계획 메모"
                className="md:col-span-2 xl:col-span-3 text-caption text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5 disabled:opacity-40"
                placeholder="메모"
                value={newPlanDraft.memo}
                disabled={!hasWrite}
                onChange={(event) => setNewPlanDraft((current) => ({ ...current, memo: event.target.value }))}
              />
            </div>
          </div>

          {plans.data && plans.data.items.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {plans.data.items.map((plan) => {
                const draft = planDrafts[plan.id] ?? createPlanDraft(plan)
                return (
                  <div key={plan.id} className="rounded-card border border-border-subtle bg-surface-card p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-label font-semibold text-text-primary">{plan.display_name}</span>
                          <span className={`text-micro px-2 py-0.5 rounded-full border ${planStatusClass(plan.status)}`}>
                            {planStatusLabel(plan.status)}
                          </span>
                        </div>
                        <div className="mt-1 text-micro text-text-ghost">
                          {plan.merchant} · {plan.payment_method ?? '결제수단 미지정'} · {plan.first_payment_date}
                        </div>
                        <div className="mt-1 text-micro text-text-muted">
                          총 {plan.total_installments}회 · 월 {money(plan.monthly_amount)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void savePlan(plan)}
                        disabled={!hasWrite || patchPlanMutation.isPending}
                        className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
                      >
                        저장
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-micro text-text-faint">표시명</span>
                        <input
                          aria-label={`${plan.display_name} 표시명`}
                          className={inputCls}
                          value={draft.display_name}
                          disabled={!hasWrite}
                          onChange={(event) => setPlanDrafts((current) => ({
                            ...current,
                            [plan.id]: {
                              ...draft,
                              display_name: event.target.value,
                            },
                          }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-micro text-text-faint">메모</span>
                        <input
                          aria-label={`${plan.display_name} 메모`}
                          className={inputCls}
                          value={draft.memo}
                          disabled={!hasWrite}
                          onChange={(event) => setPlanDrafts((current) => ({
                            ...current,
                            [plan.id]: {
                              ...draft,
                              memo: event.target.value,
                            },
                          }))}
                        />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState message="등록된 할부 계획이 없습니다" />
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="거래 연결 후보"
        meta={`${mappings.data?.total ?? 0}건`}
        description="할부로 분류된 지출 거래를 계획에 연결하고, 회차 번호를 관리합니다."
      >
        <div className="space-y-3">
          <div className="rounded-card border border-border-subtle bg-surface-section p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-caption font-semibold text-text-secondary">후보 필터</div>
                <div className="mt-0.5 text-micro text-text-ghost">거래처, 원본 설명, 기간, 현재 연결 상태로 후보를 좁힙니다.</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={applyFilter} className="text-caption px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md">
                  적용
                </button>
                <button type="button" onClick={resetFilter} className="text-caption px-3 py-1.5 border border-border-faint text-text-ghost rounded-md">
                  초기화
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                aria-label="후보 검색어"
                className={`${inputCls} w-44`}
                placeholder="거래처·원본 설명 검색"
                value={filterDraft.search}
                onChange={(event) => setFilterDraft((current) => ({ ...current, search: event.target.value }))}
              />
              <select
                aria-label="후보 연결 상태"
                className={inputCls}
                value={filterDraft.linked}
                onChange={(event) => setFilterDraft((current) => ({
                  ...current,
                  linked: event.target.value as InstallmentLinkStateFilter,
                }))}
              >
                <option value="all">연결 상태 전체</option>
                <option value="linked">연결됨</option>
                <option value="unlinked">미연결</option>
              </select>
              <select
                className={`${inputCls} min-w-44`}
                value={filterDraft.installment_plan_id}
                onChange={(event) => setFilterDraft((current) => ({
                  ...current,
                  installment_plan_id: event.target.value,
                }))}
              >
                <option value="">계획 전체</option>
                {(plans.data?.items ?? []).map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.display_name}</option>
                ))}
              </select>
              <div className="h-5 w-px bg-border-faint" />
              <input
                type="date"
                className={inputCls}
                value={filterDraft.start_date}
                onChange={(event) => setFilterDraft((current) => ({ ...current, start_date: event.target.value }))}
              />
              <input
                type="date"
                className={inputCls}
                value={filterDraft.end_date}
                onChange={(event) => setFilterDraft((current) => ({ ...current, end_date: event.target.value }))}
              />
            </div>
          </div>

          {selectedCount > 0 && (
            <div className="rounded-card border border-border-subtle bg-surface-section px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-caption font-semibold text-info-default">{selectedCount}건 선택됨</div>
                  <div className="mt-0.5 text-micro text-text-ghost">선택한 거래를 연속 회차로 한 번에 연결합니다.</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(new Set())
                    setBulkLinkDraft(DEFAULT_BULK_LINK_DRAFT)
                  }}
                  className="text-caption px-3 py-1.5 border border-border-faint text-text-ghost rounded-md"
                >
                  선택 해제
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  aria-label="일괄 연결 계획"
                  className={`${inputCls} min-w-44`}
                  value={bulkLinkDraft.installment_plan_id}
                  disabled={!hasWrite || bulkLinkMutation.isPending}
                  onChange={(event) => setBulkLinkDraft((current) => ({
                    ...current,
                    installment_plan_id: event.target.value,
                  }))}
                >
                  <option value="">— 계획 선택 —</option>
                  {(plans.data?.items ?? []).map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.display_name}</option>
                  ))}
                </select>
                <label className="flex flex-col gap-1">
                  <span className="text-micro text-text-faint">시작 회차</span>
                  <input
                    aria-label="시작 회차"
                    type="number"
                    min={1}
                    className={`${inputCls} w-28`}
                    value={bulkLinkDraft.start_installment_number}
                    disabled={!hasWrite || bulkLinkMutation.isPending}
                    onChange={(event) => setBulkLinkDraft((current) => ({
                      ...current,
                      start_installment_number: event.target.value,
                    }))}
                  />
                  <span className="text-micro text-text-ghost">선택한 첫 거래가 몇 회차인지</span>
                </label>
                <input
                  aria-label="일괄 연결 메모"
                  className={`${inputCls} w-40`}
                  placeholder="메모"
                  value={bulkLinkDraft.memo}
                  disabled={!hasWrite || bulkLinkMutation.isPending}
                  onChange={(event) => setBulkLinkDraft((current) => ({
                    ...current,
                    memo: event.target.value,
                  }))}
                />
                <button
                  type="button"
                  onClick={() => void applyBulkLink()}
                  disabled={!hasWrite || bulkLinkMutation.isPending || !bulkLinkDraft.installment_plan_id}
                  className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
                >
                  일괄 연결
                </button>
              </div>
            </div>
          )}

          {mappings.data && mappings.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-caption" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 30 }} />
                  <col style={{ width: 74 }} />
                  <col style={{ width: 170 }} />
                  <col style={{ width: 94 }} />
                  <col style={{ width: 148 }} />
                  <col style={{ width: 272 }} />
                  <col style={{ width: 92 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-2 py-2 text-left text-micro font-medium text-text-ghost">
                      <input
                        ref={selectPageCheckboxRef}
                        type="checkbox"
                        aria-label="현재 페이지 전체 선택"
                        checked={allVisibleSelected}
                        disabled={!hasWrite}
                        onChange={toggleSelectVisible}
                        className="h-3 w-3 accent-accent"
                      />
                    </th>
                    {['날짜', '원본 설명', '결제수단', '현재 연결', '빠른 연결', '금액'].map((header) => (
                      <th key={header} className="px-2 py-2 text-left text-micro font-medium text-text-ghost">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappings.data.items.map((item) => {
                    const isSelected = selectedIds.has(item.transaction_id)
                    const draft = rowLinkDrafts[item.transaction_id] ?? createRowLinkDraft(item)
                    return (
                      <tr key={item.transaction_id} className={isSelected ? 'bg-surface-selected' : ''}>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="checkbox"
                            aria-label={`${item.description} 선택`}
                            checked={isSelected}
                            disabled={!hasWrite}
                            onChange={() => toggleSelect(item)}
                            className="h-3 w-3 accent-accent"
                          />
                        </td>
                        <td className="px-2 py-2 align-top text-text-ghost">{item.date.slice(5)}</td>
                        <td className="px-2 py-2 align-top">
                          <div className="truncate text-text-secondary">{item.description}</div>
                          <div className="mt-1 truncate text-micro text-text-ghost">{item.merchant}</div>
                        </td>
                        <td className="px-2 py-2 align-top text-text-faint">{item.payment_method ?? '—'}</td>
                        <td className="px-2 py-2 align-top">
                          {item.link ? (
                            <>
                              <span className="inline-flex rounded border border-info-muted bg-info-dim px-1.5 py-0.5 text-micro text-info-default">
                                {item.link.installment_plan_display_name}
                              </span>
                              <div className="mt-1 text-micro text-text-muted">
                                {item.link.installment_number} / {item.link.total_installments}회차
                              </div>
                              {item.link.memo ? <div className="mt-1 truncate text-micro text-text-ghost">{item.link.memo}</div> : null}
                            </>
                          ) : (
                            <span className="inline-flex rounded border border-warn-muted bg-warn-dim px-1.5 py-0.5 text-micro text-warn">
                              미연결
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              aria-label={`${item.description} 연결 할부`}
                              className={`${inputCls} min-w-36`}
                              value={draft.installment_plan_id}
                              disabled={!hasWrite || linkMutation.isPending || unlinkMutation.isPending}
                              onChange={(event) => setRowLinkDrafts((current) => ({
                                ...current,
                                [item.transaction_id]: {
                                  ...draft,
                                  installment_plan_id: event.target.value,
                                },
                              }))}
                            >
                              <option value="">— 계획 선택 —</option>
                              {(plans.data?.items ?? []).map((plan) => (
                                <option key={plan.id} value={plan.id}>{plan.display_name}</option>
                              ))}
                            </select>
                            <label className="flex flex-col gap-1">
                              <span className="text-micro text-text-faint">거래별 회차</span>
                              <input
                                aria-label={`${item.description} 회차`}
                                type="number"
                                min={1}
                                className={`${inputCls} w-20`}
                                value={draft.installment_number}
                                disabled={!hasWrite || linkMutation.isPending}
                                onChange={(event) => setRowLinkDrafts((current) => ({
                                  ...current,
                                  [item.transaction_id]: {
                                    ...draft,
                                    installment_number: event.target.value,
                                  },
                                }))}
                              />
                              <span className="text-micro text-text-ghost">이 거래가 전체 할부 중 몇 번째인지</span>
                            </label>
                            <input
                              aria-label={`${item.description} 연결 메모`}
                              className={`${inputCls} w-28`}
                              placeholder="메모"
                              value={draft.memo}
                              disabled={!hasWrite || linkMutation.isPending}
                              onChange={(event) => setRowLinkDrafts((current) => ({
                                ...current,
                                [item.transaction_id]: {
                                  ...draft,
                                  memo: event.target.value,
                                },
                              }))}
                            />
                            <button
                              type="button"
                              onClick={() => void saveRowLink(item)}
                              disabled={!hasWrite || linkMutation.isPending || !draft.installment_plan_id}
                              className="text-caption px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md disabled:opacity-40"
                            >
                              {item.description} 연결
                            </button>
                            <button
                              type="button"
                              onClick={() => void unlinkRow(item)}
                              disabled={!hasWrite || unlinkMutation.isPending || item.link == null}
                              className="text-caption px-3 py-1.5 border border-border-faint text-text-ghost rounded-md disabled:opacity-40"
                            >
                              해제
                            </button>
                          </div>
                        </td>
                        <td className={`px-2 py-2 align-top text-right font-semibold ${item.amount < 0 ? 'text-danger' : 'text-accent'}`}>
                          {expenseMoney(item.amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <Pagination page={page} perPage={PAGE_SIZE} total={mappings.data.total} onPageChange={setPage} />
            </div>
          ) : (
            <EmptyState message="조건에 맞는 할부 연결 후보가 없습니다" />
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="월별 남은 할부 예측"
        meta={`${forecastMonths}개월`}
        description="관측된 회차, 앞으로 예정된 회차, 이미 지나간 미연결 회차를 월 단위로 함께 봅니다."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="forecast 기준일"
              type="date"
              className={inputCls}
              value={forecastFilter.as_of_date}
              onChange={(event) => setForecastFilter((current) => ({ ...current, as_of_date: event.target.value }))}
            />
            <input
              aria-label="forecast 개월 수"
              type="number"
              min={1}
              max={24}
              className={`${inputCls} w-24`}
              value={forecastFilter.months}
              onChange={(event) => setForecastFilter((current) => ({ ...current, months: event.target.value }))}
            />
          </div>
        )}
      >
        {forecast.data && forecast.data.monthly_summary.length > 0 ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-caption">
                <thead className="border-b border-border-subtle text-micro uppercase text-text-ghost">
                  <tr>
                    <th className="px-2 py-2 font-medium">Month</th>
                    <th className="px-2 py-2 font-medium">Observed</th>
                    <th className="px-2 py-2 font-medium">Projected</th>
                    <th className="px-2 py-2 font-medium">Missed</th>
                    <th className="px-2 py-2 font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint">
                  {forecast.data.monthly_summary.map((item) => (
                    <tr key={item.period}>
                      <td className="px-2 py-2 font-semibold text-text-primary">{item.period}</td>
                      <td className="px-2 py-2 text-text-secondary">{money(item.observed_total)}</td>
                      <td className="px-2 py-2 text-text-muted">{money(item.projected_total)}</td>
                      <td className="px-2 py-2 text-danger">{money(item.missed_total)}</td>
                      <td className="px-2 py-2 text-text-secondary">{money(item.projected_total + item.missed_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {forecast.data.items.map((item: InstallmentForecastItem) => (
                <div key={`${item.installment_plan_id}-${item.installment_number}`} className="rounded-card border border-border-subtle bg-surface-section px-3 py-2.5">
                  {(() => {
                    const linkedPlan = planItems.find((plan) => plan.id === item.installment_plan_id)
                    return (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-caption font-semibold text-text-primary">
                                {item.installment_plan_display_name}
                              </span>
                              <span className={`text-micro px-2 py-0.5 rounded-full border ${forecastStatusClass(item.status)}`}>
                                {forecastStatusLabel(item.status)}
                              </span>
                            </div>
                            <div className="mt-1 text-micro text-text-ghost">
                              {linkedPlan?.merchant ?? '거래처 미기록'} · {linkedPlan?.payment_method ?? '결제수단 미지정'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-label font-semibold text-text-secondary">{money(item.amount)}</div>
                            <div className="text-micro text-text-ghost">{item.installment_number} / {item.total_installments}회차</div>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-micro text-text-muted">
                          <span>결제 예정일 {item.due_date}</span>
                          <span>기준 월 {item.period}</span>
                          <span>연결 거래 {item.transaction_id != null ? `#${item.transaction_id}` : '—'}</span>
                          <span>상태 {forecastStatusLabel(item.status)}</span>
                        </div>
                      </>
                    )
                  })()}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState message="표시할 할부 예측이 없습니다" />
        )}
      </SectionCard>
    </div>
  )
}
