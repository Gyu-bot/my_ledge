import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from '../../ds/Card'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { formatNetWon, formatSignedWon } from '../../ds/format'
import { useContributions } from '../../hooks/useMetrics'
import { cn } from '../../lib/utils'
import type { BaselineMethod, ContributionAdjustability, ContributionItem } from '../../types/metrics'
import { BaselineControl, BasisNote } from '../analysis/ComparisonBasis'
import { loadErrorMessage } from '../analysis/text'

const VIEW_OPTIONS = [
  { value: 'all', label: '전체 지출' },
  { value: 'protected', label: '보호만' },
  { value: 'adjustable', label: '조정 가능만' },
] as const

function changeText(change: number | null): string {
  if (change == null) return '비교 불가'
  if (change === 0) return '변화 없음'
  return `${formatSignedWon(change)} ${change > 0 ? '늘어남' : '줄어듦'}`
}

function ContributionRow({ item, expandable, open, onToggle }: { item: ContributionItem; expandable: boolean; open: boolean; onToggle: () => void }) {
  const name = item.merchant ?? item.category
  const content = (
    <>
      {expandable ? (open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label text-text-primary">{name || '미분류'}</span>
        <span className="tnum block text-micro text-text-muted">
          이번 {formatNetWon(item.target_amount)} · 기준 {item.baseline_amount == null ? '없음' : formatNetWon(item.baseline_amount)}
          {item.baseline_note ? ` · ${item.baseline_note}` : ''}
        </span>
      </span>
      <span className={cn('tnum shrink-0 text-label font-semibold', item.change_amount == null ? 'text-text-muted' : 'text-text-primary')}>
        {changeText(item.change_amount)}
      </span>
    </>
  )
  if (!expandable) return <div className="flex items-center gap-2 px-2 py-1.5">{content}</div>
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-inset', open && 'bg-bg-inset')}>
      {content}
    </button>
  )
}

function MerchantContributions({ period, view, category, baseline }: { period: string; view: ContributionAdjustability; category: string; baseline: BaselineMethod }) {
  const query = useContributions({ period, adjustability: view, level: 'merchant', category, baseline, limit: 30 })
  if (query.isLoading) return <ListSkeleton rows={3} />
  if (query.error || !query.data) return <ErrorState message={loadErrorMessage(query.error)} onRetry={() => void query.refetch()} />
  const items = [...query.data.items, ...query.data.twelve_month_items]
  if (items.length === 0) return <p className="ml-6 text-caption text-text-muted">거래처별 변화가 없습니다.</p>
  return (
    <ul aria-label={`${category} 거래처별 변화`} className="ml-3 border-l border-border-subtle pl-3">
      {items.map((item) => (
        <li key={`${item.merchant ?? ''}-${item.window}`}>
          <ContributionRow item={item} expandable={false} open={false} onToggle={() => undefined} />
        </li>
      ))}
    </ul>
  )
}

/** 기준 대비 변화 기여 (Q2·Q3). 정렬은 백엔드의 금액 기여 절댓값 순 그대로. */
export function ContributionsCard({ period }: { period: string }) {
  const [baseline, setBaseline] = useState<BaselineMethod>('median_of_recent_closed_months')
  const [view, setView] = useState<ContributionAdjustability>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const query = useContributions({ period, adjustability: view, level: 'category', baseline, limit: 100 })
  const data = query.data

  return (
    <Card title="무엇이 변했나" meta="기준 기간 대비 금액 기여가 큰 순서입니다. 증감률이 아니라 원 단위 차이로 정렬합니다.">
      <div className="mb-3"><BaselineControl value={baseline} onChange={(value) => { setBaseline(value); setExpanded(null) }} /></div>
      <SegmentedControl
        className="mb-3"
        ariaLabel="변화를 볼 지출 범위"
        options={VIEW_OPTIONS}
        value={view}
        onChange={(value) => { setView(value); setExpanded(null) }}
      />
      {query.isLoading ? (
        <ListSkeleton rows={6} />
      ) : query.error || !data ? (
        <ErrorState message={loadErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : data.comparison.target_coverage === 'no_data' ? (
        <EmptyState message="이 달은 자료가 없는 달이라 비교하지 않습니다." />
      ) : (
        <div className="space-y-3">
          <dl className="tnum grid grid-cols-3 gap-2 rounded-md border border-border bg-bg-inset p-2.5 text-caption">
            <div>
              <dt className="text-text-muted">이번 달</dt>
              <dd className="font-semibold text-text-primary">{data.target_total == null ? '—' : formatNetWon(data.target_total)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">기준 금액</dt>
              <dd className="font-semibold text-text-primary">{data.baseline_total == null ? '없음' : formatNetWon(data.baseline_total)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">차이</dt>
              <dd className="font-semibold text-text-primary">{changeText(data.change_total)}</dd>
            </div>
          </dl>
          <BasisNote basis={data.comparison} />
          {data.items.length === 0 ? (
            <p className="text-caption text-text-muted">매달 나가는 지출 중 비교할 항목이 없습니다.</p>
          ) : (
            <ul aria-label="카테고리별 변화 기여" className="space-y-0.5">
              {data.items.map((item) => {
                const open = expanded === item.category
                return (
                  <li key={item.category}>
                    <ContributionRow item={item} expandable open={open} onToggle={() => setExpanded(open ? null : item.category)} />
                    {open ? <MerchantContributions period={period} view={view} category={item.category} baseline={baseline} /> : null}
                  </li>
                )
              })}
            </ul>
          )}
          <div className="border-t border-border-subtle pt-2">
            <h3 className="text-label font-semibold text-text-primary">해마다 한두 번 나가는 지출 (12개월 합계 비교)</h3>
            {data.twelve_month_items.length > 0 ? (
              <ul aria-label="12개월 창 비교" className="mt-1 space-y-0.5">
                {data.twelve_month_items.map((item) => (
                  <li key={item.category}>
                    <ContributionRow item={item} expandable={false} open={false} onToggle={() => undefined} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-caption text-text-muted">
                {data.twelve_month_window.target_window_complete
                  ? '12개월 중 한두 달에만 나간 지출이 없습니다.'
                  : '최근 12개월이 모두 자료가 있는 달은 아니어서(자료가 12개월이 안 되었거나 자료 없는 달이 있음) 판정하지 않았습니다.'}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
