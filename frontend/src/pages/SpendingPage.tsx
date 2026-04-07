import { useState, useEffect } from 'react'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Pagination } from '../components/ui/Pagination'
import { SegmentedBar } from '../components/ui/SegmentedBar'
import { RangeSlider } from '../components/ui/RangeSlider'
import { DailyCalendar } from '../components/ui/DailyCalendar'
import { StackedBarChart } from '../components/charts/StackedBarChart'
import { Treemap, ResponsiveContainer } from 'recharts'
import { HorizontalBarList } from '../components/charts/HorizontalBarList'
import { useCategoryTimeline, useCategoryBreakdown, useSubcategoryBreakdown, useTransactionList, useDailySpend } from '../hooks/useTransactions'
import { useFixedCostSummary, useMerchantSpend } from '../hooks/useAnalytics'
import { useChromeContext } from '../components/layout/chromeContext'
import { monthRange, formatKRWCompact } from '../lib/utils'
import { TREEMAP_COLORS } from '../lib/chartTheme'

function MerchantCell(props: Record<string, unknown>) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const height = Number(props.height ?? 0)
  const name = String(props.name ?? '')
  const value = Number(props.value ?? 0)
  const index = Number(props.index ?? 0)
  if (width < 10 || height < 10) return <g />
  const label = name.length > 6 ? name.slice(0, 5) + '…' : name
  const showAmount = height > 38 && width > 35
  return (
    <g>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2}
        fill={TREEMAP_COLORS[index % TREEMAP_COLORS.length]} rx={3} />
      {width > 28 && (
        <text x={x + width / 2} y={y + height / 2 + (showAmount ? -6 : 4)}
          textAnchor="middle" dominantBaseline="middle"
          fill="var(--chart-label-strong)" fontSize={10} fontWeight="600">
          {label}
        </text>
      )}
      {showAmount && (
        <text x={x + width / 2} y={y + height / 2 + 10}
          textAnchor="middle" dominantBaseline="middle"
          fill="var(--chart-label-muted)" fontSize={8}>
          ₩{formatKRWCompact(value)}
        </text>
      )}
    </g>
  )
}

export function SpendingPage() {
  const now = new Date()
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const startOfRange = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const allMonths = monthRange(startOfRange, endMonth)

  const [timelineRange, setTimelineRange] = useState<[string, string]>([
    allMonths[Math.max(0, allMonths.length - 6)],
    endMonth,
  ])
  const [detailRange, setDetailRange] = useState<[string, string]>([
    allMonths[Math.max(0, allMonths.length - 6)],
    endMonth,
  ])
  const [includeIncome, setIncludeIncome] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(endMonth)
  const [txPage, setTxPage] = useState(1)
  const [accordionOpen, setAccordionOpen] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [detailStart, detailEnd] = detailRange

  const { setMetaBadge } = useChromeContext()
  useEffect(() => {
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {detailStart} ~ {detailEnd}
      </span>
    )
    return () => setMetaBadge(null)
  }, [detailStart, detailEnd, setMetaBadge])

  const timeline = useCategoryTimeline({ start_month: timelineRange[0], end_month: timelineRange[1] })
  const breakdown = useCategoryBreakdown({
    start_month: detailStart,
    end_month: detailEnd,
    include_income: includeIncome,
    level: 'major',
  })
  const subcategoryBreakdown = useSubcategoryBreakdown(selectedCategory
    ? {
        start_month: detailStart,
        end_month: detailEnd,
        include_income: includeIncome,
        category_major: selectedCategory,
      }
    : null)
  const fixedCost = useFixedCostSummary({ start_month: detailStart, end_month: detailEnd })
  const merchantWindowMonths = Math.max(1, monthRange(detailStart, detailEnd).length)
  const merchants = useMerchantSpend({ months: merchantWindowMonths, limit: 10 })
  const dailySpend = useDailySpend({ month: calendarMonth, include_income: includeIncome })
  const transactions = useTransactionList({
    page: txPage, per_page: 20,
    start_month: detailStart, end_month: detailEnd,
    type: includeIncome ? 'all' : '지출',
  })

  useEffect(() => {
    const categories = [...new Set((breakdown.data?.items ?? []).map((item) => item.category))]
    if (categories.length === 0) {
      if (selectedCategory !== '') setSelectedCategory('')
      return
    }
    if (!selectedCategory || !categories.includes(selectedCategory)) {
      setSelectedCategory(categories[0])
    }
  }, [breakdown.data?.items, selectedCategory])

  const categories = [...new Set((breakdown.data?.items ?? []).map((item) => item.category))]

  return (
    <div className="flex flex-col gap-4">

      {/* 1. 범위 슬라이더 */}
      <SectionCard title="조회 범위">
        <RangeSlider months={allMonths} value={timelineRange} onChange={setTimelineRange} />
      </SectionCard>

      {/* 2. 월별 카테고리 추이 */}
      <SectionCard title="월별 카테고리 추이" badge="상위 카테고리">
        {timeline.isLoading ? <LoadingState /> :
         timeline.error ? <ErrorState onRetry={() => timeline.refetch()} /> :
         timeline.data && timeline.data.items.length > 0 ? (
           <StackedBarChart items={timeline.data.items} height={180} />
         ) : <EmptyState />}
      </SectionCard>

      {/* 3. 상세 필터 */}
      <div className="bg-surface-card border border-border rounded-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-faint">상세 필터</span>
          <div className="w-px h-4 bg-border-strong" />
          <select
            value={detailStart}
            onChange={(e) => { setDetailRange(([, end]) => [e.target.value, end]); setTxPage(1) }}
            className="text-caption text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2.5 py-1.5"
          >
            {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="text-caption text-text-ghost">~</span>
          <select
            value={detailEnd}
            onChange={(e) => { setDetailRange(([start]) => [start, e.target.value]); setTxPage(1) }}
            className="text-caption text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2.5 py-1.5"
          >
            {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="w-px h-4 bg-border-strong" />
          <label className="flex items-center gap-1.5 cursor-pointer text-caption text-text-faint">
            <input
              type="checkbox" checked={includeIncome}
              onChange={(e) => { setIncludeIncome(e.target.checked); setTxPage(1) }}
              className="w-3 h-3 accent-accent"
            />
            수입 포함
          </label>
        </div>
      </div>

      {/* 4. 카테고리 + 소분류 */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="카테고리별 지출" badge={`${detailStart} ~ ${detailEnd}`}>
          {breakdown.isLoading ? <LoadingState /> :
           breakdown.data && breakdown.data.items.length > 0 ? (
             <HorizontalBarList items={breakdown.data.items.map((i) => ({ label: i.category, amount: i.amount }))} />
           ) : <EmptyState />}
        </SectionCard>
        <SectionCard title="소분류별 지출">
          <div className="mb-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-micro text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2 py-1.5"
            >
              <option value="">대분류 선택</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {!selectedCategory ? <EmptyState message="대분류를 선택하세요" /> :
           subcategoryBreakdown.isLoading ? <LoadingState /> :
           subcategoryBreakdown.error ? <ErrorState onRetry={() => subcategoryBreakdown.refetch()} /> :
           subcategoryBreakdown.data && subcategoryBreakdown.data.items.length > 0 ? (
             <HorizontalBarList
               items={subcategoryBreakdown.data.items.map((item) => ({ label: item.category, amount: item.amount }))}
             />
           ) : <EmptyState message="선택한 대분류에 소분류 데이터가 없습니다" />}
        </SectionCard>
      </div>

      {/* 5. 고정비/변동비 + 필수/비필수 */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="고정비 / 변동비 비율" badge={`${detailStart} ~ ${detailEnd}`}>
          {fixedCost.isLoading ? <LoadingState /> :
           fixedCost.data ? (
             fixedCost.data.unclassified_count > 0 && fixedCost.data.fixed_ratio == null ? (
               <EmptyState message="cost_kind 미분류 데이터입니다. 작업대에서 분류해주세요." />
             ) : (
               <>
                 <SegmentedBar
                   segments={[
                     { label: '고정비', value: (fixedCost.data.fixed_ratio ?? 0) * 100, color: 'var(--chart-info-soft)' },
                     { label: '변동비', value: (1 - (fixedCost.data.fixed_ratio ?? 0)) * 100, color: 'var(--chart-accent)' },
                   ]}
                 />
                 <div className="grid grid-cols-2 gap-3 mt-3">
                   {[
                     { label: '고정비', amount: fixedCost.data.fixed_total, color: 'text-blue-400' },
                     { label: '변동비', amount: fixedCost.data.variable_total, color: 'text-accent' },
                   ].map((s) => (
                     <div key={s.label} className="bg-surface-bar border border-border rounded-lg p-3">
                       <div className={`text-caption ${s.color} font-semibold mb-1`}>{s.label}</div>
                       <div className="text-body font-bold text-text-primary">₩ {formatKRWCompact(s.amount)}</div>
                     </div>
                   ))}
                 </div>
               </>
             )
           ) : <EmptyState />}
        </SectionCard>

        <SectionCard title="고정비 — 필수 / 비필수" badge="고정비 기준">
          {fixedCost.isLoading ? <LoadingState /> :
           fixedCost.data && fixedCost.data.fixed_total > 0 ? (
             <>
               <SegmentedBar
                 segments={[
                   { label: '필수', value: fixedCost.data.fixed_total > 0 ? (fixedCost.data.essential_fixed_total / fixedCost.data.fixed_total) * 100 : 0, color: 'var(--chart-accent-muted)' },
                   { label: '비필수', value: fixedCost.data.fixed_total > 0 ? (fixedCost.data.discretionary_fixed_total / fixedCost.data.fixed_total) * 100 : 0, color: 'var(--chart-warning)' },
                 ]}
               />
               <div className="grid grid-cols-2 gap-3 mt-3">
                 {[
                   { label: '필수 고정비', amount: fixedCost.data.essential_fixed_total, color: 'text-accent-bright' },
                   { label: '비필수 고정비', amount: fixedCost.data.discretionary_fixed_total, color: 'text-warn' },
                 ].map((s) => (
                   <div key={s.label} className="bg-surface-bar border border-border rounded-lg p-3">
                     <div className={`text-caption ${s.color} font-semibold mb-1`}>{s.label}</div>
                     <div className="text-body font-bold text-text-primary">₩ {formatKRWCompact(s.amount)}</div>
                   </div>
                 ))}
               </div>
             </>
           ) : <EmptyState message="고정비 분류 데이터가 없습니다" />}
        </SectionCard>
      </div>

      {/* 6. 거래처 Treemap */}
      <SectionCard title="거래처별 지출 비중" badge={`${detailStart} ~ ${detailEnd}`}>
        {merchants.isLoading ? <LoadingState /> :
         merchants.data && merchants.data.items.length > 0 ? (
           <ResponsiveContainer width="100%" height={130}>
             <Treemap
               data={merchants.data.items.slice(0, 10).map((m) => ({ name: m.merchant, size: Math.abs(m.amount) }))}
               dataKey="size"
               aspectRatio={4 / 3}
               content={<MerchantCell />}
             />
           </ResponsiveContainer>
         ) : <EmptyState />}
      </SectionCard>

      {/* 7. 달력 + 거래내역 */}
      <div className="grid md:grid-cols-[3fr_2fr] gap-4">
        <SectionCard title="일별 지출 달력">
          <div className="flex items-center gap-2 mb-3">
            <select
              value={calendarMonth}
              onChange={(e) => setCalendarMonth(e.target.value)}
              className="text-micro text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2 py-1.5"
            >
              {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {dailySpend.isLoading ? <LoadingState /> :
           dailySpend.data ? (
             <DailyCalendar month={calendarMonth} data={dailySpend.data.items} includeIncome={includeIncome} />
           ) : <EmptyState />}
        </SectionCard>

        <div className="flex flex-col">
          <div
            className="flex items-center justify-between px-4 py-3 bg-surface-card border border-border rounded-t-card cursor-pointer"
            onClick={() => setAccordionOpen((o) => !o)}
          >
            <div>
              <div className="text-label font-semibold text-text-secondary">거래 내역</div>
              <div className="text-caption text-text-ghost mt-0.5">
                {txPage} / {Math.ceil((transactions.data?.total ?? 0) / 20)} 페이지 · 총 {transactions.data?.total ?? 0}건
              </div>
            </div>
            <span className="text-text-ghost text-body-sm">{accordionOpen ? '▲' : '▼'}</span>
          </div>
          {accordionOpen && (
            <div className="bg-surface-card border border-border border-t-0 rounded-b-card">
              {transactions.isLoading ? <LoadingState /> :
               transactions.data && transactions.data.items.length > 0 ? (
                 <>
                   <table className="w-full border-collapse text-caption">
                     <thead>
                       <tr>
                         {['날짜', '거래처', '카테고리', '금액'].map((h) => (
                           <th key={h} className="text-micro text-text-ghost px-3 py-2 text-left border-b border-border-subtle">{h}</th>
                         ))}
                       </tr>
                     </thead>
                     <tbody>
                       {transactions.data.items.map((tx) => (
                         <tr key={tx.id} className="border-b border-border-faint last:border-0">
                           <td className="px-3 py-2 text-text-ghost">{tx.date.slice(5)}</td>
                           <td className="px-3 py-2 text-text-secondary truncate max-w-[80px]">{tx.merchant}</td>
                           <td className="px-3 py-2 text-text-faint">{tx.effective_category_major}</td>
                           <td className={`px-3 py-2 text-right font-semibold ${tx.amount < 0 ? 'text-danger' : 'text-accent'}`}>
                             {tx.amount < 0 ? '-' : '+'}₩{Math.abs(tx.amount).toLocaleString()}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                   <Pagination
                     page={txPage} perPage={20}
                     total={transactions.data.total}
                     onPageChange={setTxPage}
                   />
                 </>
               ) : <EmptyState />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
