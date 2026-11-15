import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Scissors } from 'lucide-react'
import { transactionApi } from '../../api/transactions'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Pagination } from '../../ds/Pagination'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { formatNetWon, formatSignedWon } from '../../ds/format'
import { useDataStatus, useSpendCube } from '../../hooks/useMetrics'
import {
  useBulkTransactionAdjustability,
  useDeleteCategoryDefault,
  useSetCategoryDefault,
  useSetTransactionAdjustability,
} from '../../hooks/useNature'
import { useTransactionList } from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { SpendCubeQuery, SpendCubeRow } from '../../types/metrics'
import type { AdjustabilityValue } from '../../types/nature'
import type { TransactionListParams } from '../../types/transaction'
import { lastMonths, periodDateRange } from '../analysis/periods'
import { loadErrorMessage, sharePct, writeErrorMessage } from '../analysis/text'
import { ADJUSTABILITY_HELP, ADJUSTABILITY_TEXT, categoryText } from '../classification/labels'
import { TransactionEditor } from '../transactions/TransactionEditor'

const QUEUE_PAGE_SIZE = 25
const CUBE_LIMIT = 2000
const PREVIEW_LIMIT = 50

type QueueView = 'merchant' | 'category'
type QueueRange = 'all' | 'recent12'

interface DateScope {
  start_period?: string
  end_period?: string
  start_date?: string
  end_date?: string
}

const VALUES: AdjustabilityValue[] = ['protected', 'adjustable']
const VALUE_ICON = { protected: ShieldCheck, adjustable: Scissors } as const

function groupKey(row: SpendCubeRow): string {
  return `${row.effective_category_major ?? ''}\u0000${row.effective_category_minor ?? ''}\u0000${row.merchant ?? ''}`
}

interface Group {
  category: string
  /** 거래처 묶음일 때만: 소분류까지 같아야 같은 묶음이다(null = 소분류 없음) */
  minor: string | null | undefined
  merchant: string | null
}

function groupOf(row: SpendCubeRow, view: QueueView): Group {
  return view === 'merchant'
    ? { category: row.effective_category_major ?? '', minor: row.effective_category_minor, merchant: row.merchant }
    : { category: row.effective_category_major ?? '', minor: undefined, merchant: null }
}

function inGroup(tx: { effective_category_major: string; effective_category_minor: string | null; merchant: string }, group: Group): boolean {
  return (
    tx.effective_category_major === group.category &&
    (group.minor === undefined || tx.effective_category_minor === group.minor) &&
    (group.merchant === null || tx.merchant === group.merchant)
  )
}

/** 한 묶음(카테고리 · 거래처)의 지금 미정인 지출 거래 번호 전부 — 사람이 고른 묶음에만 쓴다. */
async function undecidedIds(group: Group, scope: DateScope): Promise<number[]> {
  const base: TransactionListParams = {
    type: '지출',
    adjustability: 'undecided',
    category_major: group.category,
    ...(group.merchant ? { search: group.merchant } : {}),
    ...(scope.start_date ? { start_date: scope.start_date } : {}),
    ...(scope.end_date ? { end_date: scope.end_date } : {}),
    per_page: 200,
  }
  const ids: number[] = []
  for (let page = 1; page < 500; page += 1) {
    const result = await transactionApi.list({ ...base, page })
    for (const tx of result.items) {
      if (inGroup(tx, group)) ids.push(tx.id)
    }
    if (page * result.per_page >= result.total) break
  }
  return ids
}

function GroupTransactions({ group, scope }: { group: Group; scope: DateScope }) {
  const hasWrite = useWriteAccess()
  const setOne = useSetTransactionAdjustability()
  const [editingId, setEditingId] = useState<number | null>(null)
  const { category, merchant } = group
  const list = useTransactionList({
    type: '지출',
    adjustability: 'undecided',
    category_major: category,
    ...(merchant ? { search: merchant } : {}),
    ...(scope.start_date ? { start_date: scope.start_date } : {}),
    ...(scope.end_date ? { end_date: scope.end_date } : {}),
    per_page: PREVIEW_LIMIT,
  })
  if (list.isLoading) return <ListSkeleton rows={3} />
  if (list.error) return <ErrorState message={loadErrorMessage(list.error)} onRetry={() => void list.refetch()} />
  const items = (list.data?.items ?? []).filter((tx) => inGroup(tx, group))

  async function setValue(id: number, value: AdjustabilityValue) {
    try {
      await setOne.mutateAsync({ id, value })
      toast.success(`이 거래를 '${ADJUSTABILITY_TEXT[value]}'(으)로 정했습니다`)
    } catch (error) {
      toast.error('저장하지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      {items.length === 0 ? <p className="text-caption text-text-muted">미정인 거래가 남아 있지 않습니다.</p> : (
        <ul aria-label={`${merchant ?? category} 미정 거래`} className="divide-y divide-border-subtle rounded-md border border-border bg-bg-inset">
          {items.map((tx) => (
            <li key={tx.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-2">
              <span className="tnum w-[5.5rem] shrink-0 text-micro text-text-muted">{tx.date}</span>
              <span className="min-w-0 flex-1 basis-32">
                <span className="block truncate text-label text-text-primary">{tx.merchant}</span>
                <span className="block truncate text-micro text-text-muted">{[tx.effective_category_major, tx.effective_category_minor, tx.memo].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="tnum shrink-0 text-label font-semibold text-text-primary">{formatSignedWon(tx.amount)}</span>
              <span className="flex shrink-0 gap-1">
                {VALUES.map((value) => (
                  <Button key={value} size="sm" variant="secondary" disabled={!hasWrite || setOne.isPending} onClick={() => void setValue(tx.id, value)} aria-label={`${tx.merchant} ${tx.date} 거래를 ${ADJUSTABILITY_TEXT[value]}(으)로`}>
                    {ADJUSTABILITY_TEXT[value]}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setEditingId(tx.id)} aria-label={`${tx.merchant} ${tx.date} 거래 고치기`}>고치기</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {(list.data?.total ?? 0) > PREVIEW_LIMIT ? (
        <p className="text-caption text-text-muted">최근 {PREVIEW_LIMIT}건까지 보여 줍니다. 나머지는 위의 묶음 단위 버튼으로 한꺼번에 정하거나 거래 화면에서 봅니다.</p>
      ) : null}
      {editingId !== null ? <TransactionEditor transactionId={editingId} onClose={() => setEditingId(null)} /> : null}
    </div>
  )
}

interface QueueRowProps {
  row: SpendCubeRow
  view: QueueView
  rank: number
  undecidedTotal: number
  scope: DateScope
  rangeLabel: string
}

function QueueRow({ row, view, rank, undecidedTotal, scope, rangeLabel }: QueueRowProps) {
  const hasWrite = useWriteAccess()
  const setDefault = useSetCategoryDefault()
  const deleteDefault = useDeleteCategoryDefault()
  const bulk = useBulkTransactionAdjustability()
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const group = groupOf(row, view)
  const { category, merchant } = group
  const busy = setDefault.isPending || bulk.isPending || progress !== null
  const title = merchant ?? (category || '미분류')
  const share = undecidedTotal > 0 ? row.amount / undecidedTotal : null

  async function applyCategory(value: AdjustabilityValue) {
    try {
      const created = await setDefault.mutateAsync({ category_major: category, category_minor: null, adjustability: value })
      toast.success(`'${category}' 카테고리 기본값을 '${ADJUSTABILITY_TEXT[value]}'(으)로 정했습니다`, {
        description: '거래나 정기 지급에서 따로 정한 지출은 그대로입니다.',
        action: {
          label: '되돌리기',
          onClick: () => {
            void deleteDefault.mutateAsync(created.id).then(
              () => toast.success('카테고리 기본값을 지웠습니다'),
              (error: unknown) => toast.error('되돌리지 못했습니다', { description: writeErrorMessage(error) }),
            )
          },
        },
      })
    } catch (error) {
      toast.error('기본값을 저장하지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  async function applyMerchant(value: AdjustabilityValue) {
    if (merchant == null) return
    setProgress('미정 거래를 찾는 중…')
    try {
      const ids = await undecidedIds(group, scope)
      if (ids.length === 0) {
        toast.success('미정인 거래가 남아 있지 않습니다')
        return
      }
      const result = await bulk.mutateAsync({
        ids,
        value,
        onProgress: ({ done, total }) => setProgress(`${done} / ${total}건 저장 중…`),
      })
      const applied = result.applied
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length}건은 저장하지 못했습니다`, { description: `${applied.length}건은 저장했습니다. 다시 누르면 남은 거래만 다시 시도합니다.` })
      } else {
        toast.success(`'${merchant}' 거래 ${applied.length}건을 '${ADJUSTABILITY_TEXT[value]}'(으)로 정했습니다`, {
          description: '지금 미정인 거래에만 적용했습니다. 새로 가져올 거래는 다시 정해야 합니다.',
          action: {
            label: '되돌리기',
            onClick: () => {
              void bulk.mutateAsync({ ids: applied, value: null }).then(
                (undo) => toast.success(`${undo.applied.length}건을 다시 미정으로 돌렸습니다`),
                (error: unknown) => toast.error('되돌리지 못했습니다', { description: writeErrorMessage(error) }),
              )
            },
          },
        })
      }
    } catch (error) {
      toast.error('저장하지 못했습니다', { description: writeErrorMessage(error) })
    } finally {
      setProgress(null)
    }
  }

  const registerQuery = new URLSearchParams({
    tab: 'recurring',
    new: '1',
    category_major: category,
    ...(group.minor ? { category_minor: group.minor } : {}),
    ...(merchant ? { merchant } : {}),
  })

  return (
    <li className="rounded-md border border-border bg-bg-surface px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="tnum text-micro text-text-faint">{rank}.</span>
            <h3 className="break-all text-label font-semibold text-text-primary">{title}</h3>
            {merchant ? <Badge variant="neutral">{categoryText(category, group.minor)}</Badge> : null}
          </div>
          <p className="tnum mt-0.5 text-caption text-text-muted">
            미정 {formatNetWon(row.amount)} · {row.transaction_count}건{share != null ? ` · 미정 금액의 ${sharePct(share)}` : ''} · {rangeLabel}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex shrink-0 items-center gap-0.5 text-caption font-medium text-transfer hover:underline"
        >
          거래 보기
          <ArrowRight className={open ? 'h-3 w-3 rotate-90' : 'h-3 w-3'} />
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-2 text-caption">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-text-muted">카테고리 '{category || '미분류'}' 전체의 기본값:</span>
          {VALUES.map((value) => {
            const Icon = VALUE_ICON[value]
            return (
              <Button
                key={value}
                size="sm"
                variant="secondary"
                disabled={!hasWrite || busy || !category}
                title={ADJUSTABILITY_HELP[value]}
                onClick={() => void applyCategory(value)}
                aria-label={`카테고리 ${category} 기본값을 ${ADJUSTABILITY_TEXT[value]}(으)로`}
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {ADJUSTABILITY_TEXT[value]}
              </Button>
            )
          })}
        </div>
        {merchant ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-text-muted">이 거래처의 미정 거래 {row.transaction_count}건만:</span>
            {VALUES.map((value) => {
              const Icon = VALUE_ICON[value]
              return (
                <Button
                  key={value}
                  size="sm"
                  variant="secondary"
                  disabled={!hasWrite || busy}
                  title={ADJUSTABILITY_HELP[value]}
                  onClick={() => void applyMerchant(value)}
                  aria-label={`${merchant} 미정 거래를 ${ADJUSTABILITY_TEXT[value]}(으)로`}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {ADJUSTABILITY_TEXT[value]}
                </Button>
              )
            })}
            <Link to={`/data/nature?${registerQuery.toString()}`} className="text-transfer hover:underline">정기 지급으로 등록</Link>
          </div>
        ) : null}
        {progress ? <p role="status" className="text-text-muted">{progress}</p> : null}
      </div>
      {open ? <GroupTransactions group={group} scope={scope} /> : null}
    </li>
  )
}

/**
 * 분류 큐 (Implentation-plan.md 3.1 작업대) — 조정 가능성이 미정인 지출을 금액이 큰 묶음부터.
 * 반복 여부만 빈 거래는 올리지 않는다(반복은 약정의 속성, 2.2). 시스템은 값을 제안하지 않는다.
 */
export function ClassificationQueue() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view: QueueView = searchParams.get('view') === 'category' ? 'category' : 'merchant'
  const range: QueueRange = searchParams.get('range') === 'recent12' ? 'recent12' : 'all'
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const status = useDataStatus()
  const endPeriod = status.data?.in_progress_period ?? status.data?.as_of.last_closed_period ?? null
  const months = range === 'recent12' && endPeriod ? lastMonths(endPeriod, 12) : null
  const scope: DateScope = months
    ? {
        start_period: months[0],
        end_period: months[months.length - 1],
        start_date: periodDateRange(months[0]).start_date,
        end_date: periodDateRange(months[months.length - 1]).end_date,
      }
    : {}
  const query: SpendCubeQuery | null = status.data
    ? {
        group_by: view === 'merchant' ? ['effective_category_major', 'effective_category_minor', 'merchant'] : ['effective_category_major'],
        adjustability: 'undecided',
        ...(scope.start_period ? { start_period: scope.start_period, end_period: scope.end_period } : {}),
        limit: CUBE_LIMIT,
      }
    : null
  const cube = useSpendCube(query)

  function setParam(updates: Record<string, string | null>) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
      return next
    }, { replace: true })
  }

  const rows = [...(cube.data?.rows ?? [])].sort((a, b) => b.amount - a.amount || b.transaction_count - a.transaction_count)
  const undecidedTotal = cube.data?.total_amount ?? 0
  const pageCount = Math.max(1, Math.ceil(rows.length / QUEUE_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = rows.slice((currentPage - 1) * QUEUE_PAGE_SIZE, currentPage * QUEUE_PAGE_SIZE)
  const rangeLabel = range === 'recent12' ? '최근 12개월' : '모든 기간'

  return (
    <Card
      title="분류할 지출"
      meta="조정 가능성(지금 이 지출을 줄일 수 있는가)이 아직 정해지지 않은 지출입니다. 금액이 큰 묶음부터 보여 줍니다. 값은 직접 고릅니다."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl
          ariaLabel="묶는 방법"
          options={[{ value: 'merchant', label: '카테고리 · 거래처별' }, { value: 'category', label: '카테고리별' }] as const}
          value={view}
          onChange={(next) => setParam({ view: next === 'merchant' ? null : next, page: null })}
        />
        <SegmentedControl
          ariaLabel="기간"
          options={[{ value: 'all', label: '모든 기간' }, { value: 'recent12', label: '최근 12개월' }] as const}
          value={range}
          onChange={(next) => setParam({ range: next === 'all' ? null : next, page: null })}
        />
      </div>

      {status.isLoading || cube.isLoading ? (
        <ListSkeleton rows={6} />
      ) : status.error || cube.error ? (
        <ErrorState message={loadErrorMessage(status.error ?? cube.error)} onRetry={() => { void status.refetch(); void cube.refetch() }} />
      ) : rows.length === 0 ? (
        <EmptyState message={status.data?.as_of.transaction_as_of ? '조정 가능성이 미정인 지출이 없습니다.' : '아직 가져온 거래가 없습니다.'} />
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="tnum text-caption text-text-secondary">
            {rangeLabel} 미정 지출 <span className="font-semibold text-text-primary">{formatNetWon(undecidedTotal)}</span> · {rows.length.toLocaleString('ko-KR')}개 묶음
            {range === 'all' && status.data?.adjustability_undecided_share != null ? ` · 전체 지출의 ${sharePct(status.data.adjustability_undecided_share)}` : ''}
            {rows.length >= CUBE_LIMIT ? ` · 금액이 큰 ${CUBE_LIMIT.toLocaleString('ko-KR')}묶음까지 표시` : ''}
          </p>
          <p className="text-micro text-text-muted">
            카테고리 기본값은 그 카테고리의 지난 거래와 앞으로 가져올 거래에 모두 적용되고, 거래나 정기 지급에서 따로 정한 값이 있으면 그 값이 먼저입니다.
            거래처 버튼은 지금 미정인 그 거래처 거래에만 값을 씁니다.
          </p>
          <ul aria-label="분류 큐" className="flex flex-col gap-2">
            {pageRows.map((row, index) => (
              <QueueRow
                key={groupKey(row)}
                row={row}
                view={view}
                rank={(currentPage - 1) * QUEUE_PAGE_SIZE + index + 1}
                undecidedTotal={undecidedTotal}
                scope={scope}
                rangeLabel={rangeLabel}
              />
            ))}
          </ul>
          <Pagination page={currentPage} perPage={QUEUE_PAGE_SIZE} total={rows.length} onPageChange={(next) => setParam({ page: next === 1 ? null : String(next) })} />
        </div>
      )}
    </Card>
  )
}
