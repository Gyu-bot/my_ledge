import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { Card } from '../../ds/Card'
import { Pagination } from '../../ds/Pagination'
import { RangeControl, type MonthRange } from '../../ds/RangeControl'
import { SegmentedBar } from '../../ds/SegmentedBar'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ChartSkeleton, ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { CalendarHeat } from '../../ds/charts/CalendarHeat'
import { HBarList } from '../../ds/charts/HBarList'
import { MoMList } from '../../ds/charts/MoMList'
import { StackedBars } from '../../ds/charts/StackedBars'
import { Treemap, type TreemapItem } from '../../ds/charts/Treemap'
import { EM_DASH, formatSignedWon, formatWonCompact } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import {
  useCategoryBreakdown,
  useCategoryTimeline,
  useDailySpend,
  useIncomeCategoryBreakdown,
  useIncomeCategoryTimeline,
  useMerchantTreemap,
  useSubcategoryBreakdown,
  useTransactionList,
} from '../../hooks/useTransactions'
import { useCategoryMoM, useFixedCostSummary, useFixedCostTrend, useMerchantSpend } from '../../hooks/useAnalytics'
import { monthRange } from '../../lib/utils'

type Lens = 'trend' | 'composition' | 'fixed' | 'merchants' | 'calendar' | 'income'

const LENS_OPTIONS = [
  { value: 'trend', label: '추이' },
  { value: 'composition', label: '구성' },
  { value: 'fixed', label: '고정비' },
  { value: 'merchants', label: '거래처' },
  { value: 'calendar', label: '달력' },
  { value: 'income', label: '수입' },
] as const

type FixedMode = 'cost-kind' | 'necessity'

/** 렌즈 선택이 하단 거래 내역 패널에 떨어지는 필터 */
interface PanelFilter {
  category?: string
  search?: string
  date?: string
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function SpendingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const endMonth = currentMonth()
  const allMonths = useMemo(() => {
    const [year, month] = endMonth.split('-').map(Number)
    const start = `${year - 1}-${String(month).padStart(2, '0')}`
    return monthRange(start, endMonth)
  }, [endMonth])

  const lens = (searchParams.get('lens') as Lens) || 'trend'
  const range: MonthRange = {
    start: searchParams.get('from') || allMonths[Math.max(0, allMonths.length - 6)],
    end: searchParams.get('to') || endMonth,
  }
  const includeIncome = searchParams.get('income') === '1'

  function patchParams(patch: Record<string, string | null>) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(patch)) {
        if (value == null) next.delete(key)
        else next.set(key, value)
      }
      return next
    }, { replace: true })
  }

  // 렌즈 로컬 상태
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [fixedMode, setFixedMode] = useState<FixedMode>('cost-kind')
  const [momBaseMonth, setMomBaseMonth] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState<string | null>(null)
  const [panelFilter, setPanelFilter] = useState<PanelFilter>({})
  const [txPage, setTxPage] = useState(1)

  const effectiveMomMonth = momBaseMonth ?? range.end
  const effectiveCalendarMonth = calendarMonth ?? range.end
  const rangeParams = { start_month: range.start, end_month: range.end }

  // 데이터
  const timeline = useCategoryTimeline(rangeParams)
  const breakdown = useCategoryBreakdown({ ...rangeParams, include_income: includeIncome, level: 'major' })
  const subBreakdown = useSubcategoryBreakdown(
    selectedCategory ? { ...rangeParams, include_income: includeIncome, category_major: selectedCategory } : null,
  )
  const fixedSummary = useFixedCostSummary(rangeParams)
  const fixedTrend = useFixedCostTrend(rangeParams)
  const treemap = useMerchantTreemap(lens === 'merchants' ? { ...rangeParams, include_income: includeIncome } : null)
  const merchantTop = useMerchantSpend({ ...rangeParams, limit: 8 })
  const dailySpend = useDailySpend(lens === 'calendar' ? { month: effectiveCalendarMonth, include_income: includeIncome } : null)
  const categoryMoM = useCategoryMoM({ base_month: effectiveMomMonth })
  const incomeTimeline = useIncomeCategoryTimeline(lens === 'income' ? rangeParams : {})
  const incomeBreakdown = useIncomeCategoryBreakdown(lens === 'income' ? rangeParams : {})

  const transactions = useTransactionList({
    page: txPage,
    per_page: 20,
    start_month: panelFilter.date ? undefined : range.start,
    end_month: panelFilter.date ? undefined : range.end,
    start_date: panelFilter.date,
    end_date: panelFilter.date,
    type: lens === 'income' ? '수입' : includeIncome ? 'all' : '지출',
    category_major: panelFilter.category,
    search: panelFilter.search,
  })

  function setPanel(patch: PanelFilter) {
    setPanelFilter((current) => ({ ...current, ...patch }))
    setTxPage(1)
  }

  function clearPanelKey(key: keyof PanelFilter) {
    setPanelFilter((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setTxPage(1)
  }

  const treemapItems: TreemapItem[] = useMemo(
    () =>
      (treemap.data?.items ?? []).flatMap((node) =>
        (node.children ?? []).map((child) => ({
          name: child.name,
          value: Math.abs(child.value),
          group: node.name,
        })),
      ),
    [treemap.data?.items],
  )

  const activeChips = [
    panelFilter.category ? { key: 'category' as const, label: `카테고리: ${panelFilter.category}` } : null,
    panelFilter.search ? { key: 'search' as const, label: `검색: ${panelFilter.search}` } : null,
    panelFilter.date ? { key: 'date' as const, label: `일자: ${panelFilter.date}` } : null,
  ].filter(Boolean) as Array<{ key: keyof PanelFilter; label: string }>

  const fixedTrendItems = useMemo(() => {
    const items = fixedTrend.data?.items ?? []
    if (fixedMode === 'cost-kind') {
      return items.flatMap((item) => [
        { period: item.period, category: '고정비', amount: item.fixed_total },
        { period: item.period, category: '변동비', amount: item.variable_total },
        { period: item.period, category: '미분류', amount: item.unclassified_total },
      ])
    }
    return items.flatMap((item) => [
      { period: item.period, category: '필수', amount: item.required_spend_total },
      { period: item.period, category: '재량', amount: item.discretionary_spend_total },
      { period: item.period, category: '미분류', amount: item.unclassified_total },
    ])
  }, [fixedTrend.data?.items, fixedMode])

  return (
    <>
      <PageHeader
        title="지출"
        controls={
          <>
            <RangeControl
              months={allMonths}
              value={range}
              onChange={(next) => {
                patchParams({ from: next.start, to: next.end })
                setTxPage(1)
              }}
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-caption text-text-muted">
              <input
                type="checkbox"
                checked={includeIncome}
                onChange={(event) => patchParams({ income: event.target.checked ? '1' : null })}
                className="h-3 w-3 accent-[var(--ds-accent-fg)]"
              />
              수입 포함
            </label>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="지출 렌즈"
          options={LENS_OPTIONS}
          value={lens}
          onChange={(next) => patchParams({ lens: next === 'trend' ? null : next })}
        />

        {lens === 'trend' && (
          <>
            <Card title="월별 카테고리 추이" meta={`${range.start} ~ ${range.end} · Top 5 + 기타`}>
              {timeline.isLoading ? <ChartSkeleton height={240} /> :
               timeline.error ? <ErrorState onRetry={() => void timeline.refetch()} /> :
               timeline.data && timeline.data.items.length > 0 ? (
                 <StackedBars
                   items={timeline.data.items}
                   onSegmentClick={(_, category) => setPanel({ category })}
                 />
               ) : <EmptyState message="조회 기간에 지출 데이터가 없습니다" actionLabel="가져오기" actionTo="/data/import" />}
            </Card>
            <Card
              title="카테고리 전월 대비"
              meta={effectiveMomMonth !== range.end ? '전역 기간과 다름 ●' : undefined}
              action={
                <>
                  <label className="sr-only" htmlFor="mom-base-month">기준월</label>
                  <select
                    id="mom-base-month"
                    className="tnum rounded-md border border-border bg-bg-inset px-2 py-1 text-caption text-text-secondary"
                    value={effectiveMomMonth}
                    onChange={(event) => setMomBaseMonth(event.target.value)}
                  >
                    {allMonths.slice(1).map((month) => <option key={month} value={month}>{month}</option>)}
                  </select>
                </>
              }
            >
              {categoryMoM.isLoading ? <ListSkeleton rows={5} /> :
               categoryMoM.data && categoryMoM.data.items.length > 0 ? (
                 <MoMList items={categoryMoM.data.items} />
               ) : <EmptyState message="비교할 데이터가 없습니다" />}
            </Card>
          </>
        )}

        {lens === 'composition' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="카테고리별 지출" meta={`${range.start} ~ ${range.end} · 클릭하면 소분류와 거래 내역이 필터됩니다`}>
              {breakdown.isLoading ? <ListSkeleton rows={6} /> :
               breakdown.data && breakdown.data.items.length > 0 ? (
                 <HBarList
                   items={breakdown.data.items.map((item) => ({ label: item.category, amount: item.amount }))}
                   selectedLabel={selectedCategory}
                   onSelect={(label) => {
                     setSelectedCategory((current) => (current === label ? null : label))
                     setPanel({ category: selectedCategory === label ? undefined : label })
                   }}
                 />
               ) : <EmptyState message="카테고리 데이터가 없습니다" />}
            </Card>
            <Card title="소분류별 지출" meta={selectedCategory ?? '좌측에서 대분류를 선택하세요'}>
              {!selectedCategory ? <EmptyState message="대분류를 선택하면 소분류가 표시됩니다" /> :
               subBreakdown.isLoading ? <ListSkeleton rows={5} /> :
               subBreakdown.error ? <ErrorState onRetry={() => void subBreakdown.refetch()} /> :
               subBreakdown.data && subBreakdown.data.items.length > 0 ? (
                 <HBarList items={subBreakdown.data.items.map((item) => ({ label: item.category, amount: item.amount }))} />
               ) : <EmptyState message="선택한 대분류에 소분류 데이터가 없습니다" />}
            </Card>
          </div>
        )}

        {lens === 'fixed' && (
          <>
            <Card
              title="고정비 렌즈"
              meta={`${range.start} ~ ${range.end}`}
              action={
                <SegmentedControl
                  ariaLabel="고정비 보기 모드"
                  options={[
                    { value: 'cost-kind', label: '고정/변동' },
                    { value: 'necessity', label: '필수/재량' },
                  ] as const}
                  value={fixedMode}
                  onChange={setFixedMode}
                />
              }
            >
              {fixedTrend.isLoading ? <ChartSkeleton height={220} /> :
               fixedTrend.error ? <ErrorState onRetry={() => void fixedTrend.refetch()} /> :
               fixedTrendItems.length > 0 ? (
                 <StackedBars items={fixedTrendItems} height={220} topN={3} />
               ) : <EmptyState message="고정비 분류 데이터가 없습니다" actionLabel="인박스에서 분류 시작" actionTo="/data/inbox" />}
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="비율" meta={fixedMode === 'cost-kind' ? '고정 / 변동 / 미분류' : '필수 / 재량 / 미분류'}>
                {fixedSummary.isLoading ? <ListSkeleton rows={2} /> :
                 fixedSummary.data ? (
                   <SegmentedBar
                     segments={
                       fixedMode === 'cost-kind'
                         ? [
                             { label: '고정비', value: fixedSummary.data.fixed_total, color: 'var(--ds-transfer-fg)' },
                             { label: '변동비', value: fixedSummary.data.variable_total, color: 'var(--ds-accent-fg)' },
                             { label: '미분류', value: fixedSummary.data.unclassified_total, color: 'var(--ds-chart-other)' },
                           ]
                         : [
                             { label: '필수', value: fixedSummary.data.required_spend_total, color: 'var(--ds-accent-fg)' },
                             { label: '재량', value: fixedSummary.data.discretionary_spend_total, color: 'var(--ds-warn-fg)' },
                             { label: '미분류', value: fixedSummary.data.unclassified_total, color: 'var(--ds-chart-other)' },
                           ]
                     }
                   />
                 ) : <EmptyState message="분류 데이터가 없습니다" />}
              </Card>
              <Card title="미분류" meta="분류 품질">
                {fixedSummary.isLoading ? <ListSkeleton rows={2} /> :
                 fixedSummary.data ? (
                   <div className="flex items-center justify-between gap-3">
                     <div>
                       <div className="tnum text-kpi text-text-primary">
                         {formatWonCompact(fixedSummary.data.unclassified_total)}
                       </div>
                       <div className="mt-0.5 text-caption text-text-muted">
                         미분류 지출 · {fixedSummary.data.unclassified_count}건
                       </div>
                     </div>
                     <Link
                       to="/data/inbox"
                       className="flex items-center gap-1 rounded-md border border-accent-border bg-accent-bg px-3 py-1.5 text-caption font-medium text-accent"
                     >
                       인박스에서 분류
                       <ArrowRight className="h-3 w-3" />
                     </Link>
                   </div>
                 ) : <EmptyState message="데이터가 없습니다" />}
              </Card>
            </div>
          </>
        )}

        {lens === 'merchants' && (
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Card title="거래처별 지출 비중" meta={`${range.start} ~ ${range.end} · 클릭하면 거래 내역이 필터됩니다`}>
              {treemap.isLoading ? <ChartSkeleton height={320} /> :
               treemapItems.length > 0 ? (
                 <Treemap items={treemapItems} onSelect={(item) => setPanel({ search: item.name })} />
               ) : <EmptyState message="거래처 데이터가 없습니다" />}
            </Card>
            <Card title="거래처 Top" meta="합계 기준">
              {merchantTop.isLoading ? <ListSkeleton rows={8} /> :
               merchantTop.data && merchantTop.data.items.length > 0 ? (
                 <HBarList
                   items={merchantTop.data.items.map((item) => ({
                     label: item.merchant,
                     amount: item.amount,
                     sub: `${item.count}건`,
                   }))}
                   onSelect={(label) => setPanel({ search: label })}
                   selectedLabel={panelFilter.search ?? null}
                 />
               ) : <EmptyState message="거래처 데이터가 없습니다" />}
            </Card>
          </div>
        )}

        {lens === 'calendar' && (
          <Card
            title="일별 지출 달력"
            meta={effectiveCalendarMonth !== range.end ? '전역 기간과 다름 ●' : effectiveCalendarMonth}
            action={
              <>
                <label className="sr-only" htmlFor="calendar-month">달력 월</label>
                <select
                  id="calendar-month"
                  className="tnum rounded-md border border-border bg-bg-inset px-2 py-1 text-caption text-text-secondary"
                  value={effectiveCalendarMonth}
                  onChange={(event) => {
                    setCalendarMonth(event.target.value)
                    clearPanelKey('date')
                  }}
                >
                  {allMonths.map((month) => <option key={month} value={month}>{month}</option>)}
                </select>
              </>
            }
          >
            {dailySpend.isLoading ? <ChartSkeleton height={280} /> :
             dailySpend.data ? (
               <CalendarHeat
                 month={effectiveCalendarMonth}
                 items={dailySpend.data.items}
                 selectedDate={panelFilter.date ?? null}
                 onSelectDay={(date) => setPanel({ date: panelFilter.date === date ? undefined : date })}
               />
             ) : <EmptyState message="달력 데이터가 없습니다" />}
          </Card>
        )}

        {lens === 'income' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="월별 수입 구성" meta={`${range.start} ~ ${range.end}`}>
              {incomeTimeline.isLoading ? <ChartSkeleton height={220} /> :
               incomeTimeline.error ? <ErrorState onRetry={() => void incomeTimeline.refetch()} /> :
               incomeTimeline.data && incomeTimeline.data.items.length > 0 ? (
                 <StackedBars
                   items={incomeTimeline.data.items}
                   height={220}
                   onSegmentClick={(_, category) => setPanel({ category })}
                 />
               ) : <EmptyState message="수입 데이터가 없습니다" />}
            </Card>
            <Card title="수입원별 합계" meta="조회 기간 누적">
              {incomeBreakdown.isLoading ? <ListSkeleton rows={4} /> :
               incomeBreakdown.data && incomeBreakdown.data.items.length > 0 ? (
                 <HBarList
                   items={incomeBreakdown.data.items.map((item) => ({
                     label: item.category,
                     amount: item.amount,
                     color: 'var(--ds-income-fg)',
                   }))}
                   onSelect={(label) => setPanel({ category: panelFilter.category === label ? undefined : label })}
                   selectedLabel={panelFilter.category ?? null}
                 />
               ) : <EmptyState message="수입 데이터가 없습니다" />}
            </Card>
          </div>
        )}

        {/* 공통 거래 내역 패널 */}
        <Card
          title="거래 내역"
          meta={
            <span className="flex flex-wrap items-center gap-1.5">
              {activeChips.length === 0 ? '전역 기간 기준' : null}
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => clearPanelKey(chip.key)}
                  className="inline-flex items-center gap-1 rounded-sm border border-accent-border bg-accent-bg px-1.5 py-0.5 text-micro font-medium text-accent"
                >
                  {chip.label}
                  <X className="h-2.5 w-2.5" />
                </button>
              ))}
            </span>
          }
          action={
            <Link to="/data/transactions" className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline">
              거래에서 편집
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {transactions.isLoading ? <div className="p-4"><ListSkeleton rows={6} /></div> :
           transactions.data && transactions.data.items.length > 0 ? (
             <>
               <table className="w-full border-collapse text-label">
                 <thead className="bg-bg-inset">
                   <tr>
                     {['날짜', '거래처', '카테고리', '금액'].map((header) => (
                       <th key={header} className="px-4 py-2 text-left text-micro font-medium text-text-muted">
                         {header}
                       </th>
                     ))}
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-border-subtle">
                   {transactions.data.items.map((tx) => (
                     <tr key={tx.id}>
                       <td className="tnum px-4 py-2 text-text-faint">{tx.date.slice(5)}</td>
                       <td className="max-w-[160px] truncate px-4 py-2 text-text-primary">{tx.merchant}</td>
                       <td className="px-4 py-2 text-text-muted">
                         {tx.effective_category_major}
                         {tx.effective_category_minor ? ` / ${tx.effective_category_minor}` : ''}
                       </td>
                       <td className={`tnum px-4 py-2 text-right font-semibold ${tx.amount < 0 ? 'text-expense' : 'text-income'}`}>
                         {formatSignedWon(tx.amount)}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               <Pagination page={txPage} perPage={20} total={transactions.data.total} onPageChange={setTxPage} />
             </>
           ) : (
             <EmptyState className="py-10" message={`조건에 맞는 거래가 없습니다 ${activeChips.length > 0 ? EM_DASH + ' 필터를 해제해보세요' : ''}`} />
           )}
        </Card>
      </div>
    </>
  )
}
