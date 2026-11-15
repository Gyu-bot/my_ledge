import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from '../../ds/Card'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { formatNetWon } from '../../ds/format'
import { useSpendCube } from '../../hooks/useMetrics'
import { cn } from '../../lib/utils'
import type { MonthStatus, SpendCubeFilters, SpendCubeRow } from '../../types/metrics'
import { AmountDrilldown, type DrillTarget } from '../analysis/AmountDrilldown'
import { ADJUSTABILITY_LABELS } from '../analysis/flowMeasures'
import { loadErrorMessage } from '../analysis/text'

export type AdjustabilityFilter = 'all' | 'protected' | 'adjustable' | 'undecided'
type ViewMode = 'category' | 'merchant'

const FILTER_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'protected', label: '보호' },
  { value: 'adjustable', label: '조정 가능' },
  { value: 'undecided', label: '미정' },
] as const

const VIEW_OPTIONS = [
  { value: 'category', label: '카테고리 → 거래처' },
  { value: 'merchant', label: '거래처 순 (카테고리 유지)' },
] as const

const MERCHANTS_SHOWN = 10

const CELL_INCLUDES = [
  '삭제·병합되었거나 새 거래로 대체된 거래는 빼고, 남아 있는 원화 지출만 셉니다.',
  '환불은 환불이 기록된 달에서 지출을 줄입니다. 원래 구매와 확정 연결된 환불만 원래 구매 쪽으로 옮겨 셉니다.',
  '대출 원리금과 할부 회차도 지출이므로 들어갑니다.',
]
const CELL_EXCLUDES = ['수입과 이체는 넣지 않습니다.', '같은 거래처라도 카테고리가 다르면 다른 칸으로 셉니다.']

function filterLabel(filter: AdjustabilityFilter): string {
  return filter === 'all' ? '' : ` · 조정 가능성 ${ADJUSTABILITY_LABELS[filter]}`
}

function cellTarget(
  period: string,
  monthStatus: MonthStatus | null,
  filter: AdjustabilityFilter,
  row: SpendCubeRow,
  merchantLevel: boolean,
): DrillTarget {
  const filters: SpendCubeFilters = { effective_category_major: row.effective_category_major ?? '' }
  if (merchantLevel && row.merchant != null) filters.merchant = row.merchant
  if (filter !== 'all') filters.adjustability = filter
  const name = merchantLevel ? `${row.merchant ?? '거래처 없음'} (${row.effective_category_major ?? '미분류'})` : row.effective_category_major ?? '미분류'
  return {
    kind: 'cube',
    period,
    monthStatus,
    label: `${name}${filterLabel(filter)}`,
    amount: row.amount,
    filters,
    formula: merchantLevel
      ? '이 카테고리 안에서 이 거래처에 나간 순지출(환불 차감)의 합계'
      : '이 카테고리에 나간 순지출(환불 차감)의 합계',
    includes: filter === 'all' ? CELL_INCLUDES : [...CELL_INCLUDES, `조정 가능성이 "${ADJUSTABILITY_LABELS[filter]}"인 지출만 셉니다.`],
    excludes: CELL_EXCLUDES,
  }
}

function MerchantsInCategory({
  period,
  monthStatus,
  filter,
  category,
  openKey,
  setOpenKey,
}: {
  period: string
  monthStatus: MonthStatus | null
  filter: AdjustabilityFilter
  category: string
  openKey: string | null
  setOpenKey: (key: string | null) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const cube = useSpendCube({
    start_period: period,
    end_period: period,
    group_by: ['effective_category_major', 'merchant'],
    effective_category_major: category,
    ...(filter !== 'all' ? { adjustability: filter } : {}),
    limit: 100,
  })
  if (cube.isLoading) return <ListSkeleton rows={3} />
  if (cube.error || !cube.data) return <ErrorState message={loadErrorMessage(cube.error)} onRetry={() => void cube.refetch()} />
  const rows = cube.data.rows
  return (
    <>
    <ul aria-label={`${category} 거래처`} className="ml-3 mt-1 space-y-1 border-l border-border-subtle pl-3">
      {(showAll ? rows : rows.slice(0, MERCHANTS_SHOWN)).map((row) => {
        const key = `m:${row.effective_category_major ?? category}\u0000${row.merchant ?? ''}`
        const open = openKey === key
        return (
          <li key={key}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenKey(open ? null : key)}
              className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-inset', open && 'bg-bg-selected')}
            >
              <span className="min-w-0 flex-1 truncate text-label text-text-secondary">{row.merchant ?? '거래처 없음'}</span>
              <span className="tnum shrink-0 text-micro text-text-muted">{row.transaction_count}건</span>
              <span className="tnum shrink-0 text-label text-text-primary">{formatNetWon(row.amount)}</span>
            </button>
            {open ? (
              <div className="py-2">
                <AmountDrilldown target={cellTarget(period, monthStatus, filter, row, true)} onClose={() => setOpenKey(null)} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
    {!showAll && rows.length > MERCHANTS_SHOWN ? (
      <button type="button" onClick={() => setShowAll(true)} className="ml-6 mt-1 text-caption font-medium text-transfer hover:underline">
        나머지 거래처 {rows.length - MERCHANTS_SHOWN}곳 더 보기
      </button>
    ) : null}
    </>
  )
}

interface CategoryBreakdownCardProps {
  period: string
  monthStatus: MonthStatus | null
  initialCategory: string | null
}

/** 카테고리 → 거래처 분해 (Q1·Q3). 카테고리를 덮지 않는다(원칙 3). */
export function CategoryBreakdownCard({ period, monthStatus, initialCategory }: CategoryBreakdownCardProps) {
  const [filter, setFilter] = useState<AdjustabilityFilter>('all')
  const [view, setView] = useState<ViewMode>('category')
  const [expanded, setExpanded] = useState<string | null>(initialCategory)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const adjustabilityFilter = filter !== 'all' ? { adjustability: filter } : {}
  const categories = useSpendCube(
    view === 'category'
      ? { start_period: period, end_period: period, group_by: ['effective_category_major'], ...adjustabilityFilter, limit: 200 }
      : null,
  )
  const merchants = useSpendCube(
    view === 'merchant'
      ? { start_period: period, end_period: period, group_by: ['effective_category_major', 'merchant'], ...adjustabilityFilter, limit: 30 }
      : null,
  )
  const active = view === 'category' ? categories : merchants

  return (
    <Card
      title="어디에 썼나"
      meta="지출 큐브에서 바로 읽은 순지출(환불 차감)입니다. 같은 거래처라도 카테고리가 다르면 따로 셉니다."
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <SegmentedControl ariaLabel="조정 가능성으로 거르기" options={FILTER_OPTIONS} value={filter} onChange={(value) => { setFilter(value); setOpenKey(null) }} />
        <SegmentedControl ariaLabel="나눠 보는 방식" options={VIEW_OPTIONS} value={view} onChange={(value) => { setView(value); setOpenKey(null) }} />
      </div>
      {active.isLoading ? (
        <ListSkeleton rows={6} />
      ) : active.error || !active.data ? (
        <ErrorState message={loadErrorMessage(active.error)} onRetry={() => void active.refetch()} />
      ) : active.data.rows.length === 0 ? (
        <EmptyState message={filter === 'all' ? '이 달에 지출이 없습니다.' : `이 달에 조정 가능성이 "${ADJUSTABILITY_LABELS[filter]}"인 지출이 없습니다.`} />
      ) : (
        <>
          <p className="tnum mb-2 text-caption text-text-muted">
            합계 {formatNetWon(active.data.total_amount)}{filterLabel(filter)}
            {view === 'merchant' ? ' · 금액이 큰 30칸' : ''}
          </p>
          {view === 'category' ? (
            <ul aria-label="카테고리별 지출" className="space-y-1">
              {active.data.rows.map((row) => {
                const category = row.effective_category_major ?? ''
                const isExpanded = expanded === category
                const categoryKey = `c:${category}`
                return (
                  <li key={category}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => { setExpanded(isExpanded ? null : category); setOpenKey(null) }}
                      className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-inset', isExpanded && 'bg-bg-inset')}
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate text-label font-medium text-text-primary">{category || '미분류'}</span>
                      <span className="tnum shrink-0 text-micro text-text-muted">{row.transaction_count}건</span>
                      <span className="tnum shrink-0 text-label font-semibold text-text-primary">{formatNetWon(row.amount)}</span>
                    </button>
                    {isExpanded ? (
                      <div className="pb-2">
                        <button
                          type="button"
                          onClick={() => setOpenKey(openKey === categoryKey ? null : categoryKey)}
                          className="ml-8 mt-1 text-caption font-medium text-transfer hover:underline"
                          aria-expanded={openKey === categoryKey}
                        >
                          이 카테고리 금액의 산식과 거래 보기
                        </button>
                        {openKey === categoryKey ? (
                          <div className="py-2">
                            <AmountDrilldown target={cellTarget(period, monthStatus, filter, row, false)} onClose={() => setOpenKey(null)} />
                          </div>
                        ) : null}
                        <MerchantsInCategory
                          period={period}
                          monthStatus={monthStatus}
                          filter={filter}
                          category={category}
                          openKey={openKey}
                          setOpenKey={setOpenKey}
                        />
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul aria-label="거래처별 지출 (카테고리 유지)" className="space-y-1">
              {active.data.rows.map((row) => {
                const key = `r:${row.effective_category_major ?? ''}\u0000${row.merchant ?? ''}`
                const open = openKey === key
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? null : key)}
                      className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-inset', open && 'bg-bg-selected')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-label text-text-primary">{row.merchant ?? '거래처 없음'}</span>
                        <span className="block truncate text-micro text-text-muted">{row.effective_category_major ?? '미분류'}</span>
                      </span>
                      <span className="tnum shrink-0 text-micro text-text-muted">{row.transaction_count}건</span>
                      <span className="tnum shrink-0 text-label font-semibold text-text-primary">{formatNetWon(row.amount)}</span>
                    </button>
                    {open ? (
                      <div className="py-2">
                        <AmountDrilldown target={cellTarget(period, monthStatus, filter, row, true)} onClose={() => setOpenKey(null)} />
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}
