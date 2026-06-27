import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Select } from '../../ds/Field'
import { toast } from '../../ds/toastStore'
import {
  useBulkLinkTransactionsToInstallment,
  useInstallmentPlans,
  useInstallmentTransactionMappings,
  useInstallmentTransactionSuggestions,
  useLinkTransactionToInstallment,
  useUnlinkTransactionFromInstallment,
} from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { InstallmentLinkStateFilter } from '../../types/transaction'
import { InstallmentMappingsSection } from './InstallmentMappingsSection'
import { InstallmentSuggestionCard, type InstallmentSuggestionDraft } from './InstallmentSuggestionCard'

const PAGE_SIZE = 40

function getInstallmentSuggestionKey(transactionId: number, installmentPlanId: number) {
  return `${transactionId}:${installmentPlanId}`
}

export function InstallmentLinksTab() {
  const hasWrite = useWriteAccess()
  const plans = useInstallmentPlans()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState<{ search: string; linked: InstallmentLinkStateFilter; plan: string }>({
    search: searchParams.get('search') ?? '',
    linked: (searchParams.get('linked') as InstallmentLinkStateFilter) || 'all',
    plan: '',
  })
  const [applied, setApplied] = useState(filter)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkPlan, setBulkPlan] = useState('')
  const [bulkStart, setBulkStart] = useState('1')
  const [rowDrafts, setRowDrafts] = useState<Record<number, { plan: string; number: string }>>({})
  const [suggestionRowDrafts, setSuggestionRowDrafts] = useState<Record<string, InstallmentSuggestionDraft>>({})

  const link = useLinkTransactionToInstallment()
  const unlink = useUnlinkTransactionFromInstallment()
  const bulkLink = useBulkLinkTransactionsToInstallment()
  const mappings = useInstallmentTransactionMappings({
    page,
    per_page: PAGE_SIZE,
    search: applied.search || undefined,
    linked: applied.linked,
    installment_plan_id: applied.plan ? Number(applied.plan) : undefined,
  })
  const suggestions = useInstallmentTransactionSuggestions({
    page: 1,
    per_page: PAGE_SIZE,
    installment_plan_id: applied.plan ? Number(applied.plan) : undefined,
  })

  const inputCls = 'rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-caption text-text-secondary'

  async function saveInstallmentLink(transactionId: number, planId: number, number: number) {
    try {
      await link.mutateAsync({
        id: transactionId,
        data: { installment_plan_id: planId, installment_number: number, memo: null },
      })
      toast.success('연결 저장 완료')
    } catch (error) {
      toast.error('연결 실패', { description: String(error) })
    }
  }

  async function saveRow(transactionId: number, fallbackDraft?: { plan: string; number: string }) {
    const draft = rowDrafts[transactionId] ?? fallbackDraft
    const planId = Number(draft?.plan)
    const number = Number(draft?.number)
    if (!Number.isFinite(planId) || !Number.isFinite(number)) {
      toast.error('계획과 회차를 입력하세요')
      return
    }
    await saveInstallmentLink(transactionId, planId, number)
  }

  async function saveSuggestionRow(
    transactionId: number,
    suggestionKey: string,
    fallbackDraft?: InstallmentSuggestionDraft,
  ) {
    const item = suggestions.data?.items.find(
      (candidate) => getInstallmentSuggestionKey(candidate.transaction.transaction_id, candidate.installment_plan_id) === suggestionKey,
    )
    const draft = suggestionRowDrafts[suggestionKey] ?? fallbackDraft
    const planId = Number(draft?.plan ?? item?.installment_plan_id)
    const number = Number(draft?.number)
    if (!Number.isFinite(planId) || !Number.isFinite(number)) {
      toast.error('계획과 회차를 입력하세요')
      return
    }
    await saveInstallmentLink(transactionId, planId, number)
  }

  async function unlinkRow(transactionId: number) {
    try {
      await unlink.mutateAsync(transactionId)
      toast.success('연결 해제 완료')
    } catch (error) {
      toast.error('해제 실패', { description: String(error) })
    }
  }

  async function applyBulk() {
    const planId = Number(bulkPlan)
    const start = Number(bulkStart)
    if (!Number.isFinite(planId) || !Number.isFinite(start) || selected.size === 0) return
    try {
      const result = await bulkLink.mutateAsync({
        transaction_ids: [...selected],
        installment_plan_id: planId,
        start_installment_number: start,
        memo: null,
      })
      toast.success(`${result.updated}건 일괄 연결 완료`)
      setSelected(new Set())
      setBulkPlan('')
    } catch (error) {
      toast.error('일괄 연결 실패', { description: String(error) })
    }
  }

  return (
    <>
      <Card
        title="거래 연결 후보"
        action={
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setApplied(filter)
                setPage(1)
              }}
            >
              적용
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const reset = { search: '', linked: 'all' as InstallmentLinkStateFilter, plan: '' }
                setFilter(reset)
                setApplied(reset)
                setPage(1)
              }}
            >
              초기화
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} w-40`}
            placeholder="거래처·설명 검색"
            value={filter.search}
            onChange={(event) => setFilter((current) => ({ ...current, search: event.target.value }))}
          />
          <Select
            className={inputCls}
            value={filter.linked}
            onChange={(event) =>
              setFilter((current) => ({
                ...current,
                linked: event.target.value as InstallmentLinkStateFilter,
              }))
            }
            aria-label="연결 상태"
          >
            <option value="all">연결 상태 전체</option>
            <option value="linked">연결됨</option>
            <option value="unlinked">미연결</option>
          </Select>
          <Select
            className={inputCls}
            value={filter.plan}
            onChange={(event) => setFilter((current) => ({ ...current, plan: event.target.value }))}
            aria-label="계획"
          >
            <option value="">계획 전체</option>
            {plans.data?.items.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.display_name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <InstallmentSuggestionCard
        hasWrite={hasWrite}
        inputClassName={inputCls}
        isLoading={suggestions.isLoading}
        isSaving={link.isPending}
        items={suggestions.data?.items ?? []}
        rowDrafts={suggestionRowDrafts}
        total={suggestions.data?.total ?? 0}
        onDraftChange={(suggestionKey, draft) =>
          setSuggestionRowDrafts((current) => ({ ...current, [suggestionKey]: draft }))
        }
        onSaveRow={saveSuggestionRow}
      />

      <InstallmentMappingsSection
        bulkPlan={bulkPlan}
        bulkStart={bulkStart}
        hasWrite={hasWrite}
        inputClassName={inputCls}
        isBulkPending={bulkLink.isPending}
        isLoading={mappings.isLoading}
        isLinkPending={link.isPending}
        isUnlinkPending={unlink.isPending}
        items={mappings.data?.items ?? []}
        page={page}
        perPage={PAGE_SIZE}
        plans={plans.data?.items ?? []}
        rowDrafts={rowDrafts}
        selected={selected}
        total={mappings.data?.total ?? 0}
        onBulkPlanChange={setBulkPlan}
        onBulkStartChange={setBulkStart}
        onClearBulkSelection={() => {
          setSelected(new Set())
          setBulkPlan('')
        }}
        onDraftChange={(transactionId, draft) =>
          setRowDrafts((current) => ({ ...current, [transactionId]: draft }))
        }
        onPageChange={setPage}
        onRunBulkLink={applyBulk}
        onSaveRow={saveRow}
        onTogglePageSelection={() =>
          setSelected((current) => {
            const next = new Set(current)
            const items = mappings.data?.items ?? []
            const allSelected = items.every((item) => next.has(item.transaction_id))
            items.forEach((item) => {
              if (allSelected) next.delete(item.transaction_id)
              else next.add(item.transaction_id)
            })
            return next
          })
        }
        onToggleRowSelection={(transactionId) =>
          setSelected((current) => {
            const next = new Set(current)
            if (next.has(transactionId)) next.delete(transactionId)
            else next.add(transactionId)
            return next
          })
        }
        onUnlinkRow={unlinkRow}
      />
    </>
  )
}
