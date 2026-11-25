import { useState } from 'react'
import { Toggle } from '../../ds/Field'
import type { ReadPeriodState } from '../../types/readSurface'
import { MonthCoverageLabel } from '../analysis/MonthCoverageLabel'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { CashflowChart } from '../../ds/charts/CashflowChart'
import { formatNetWon, formatSignedWon, formatWon } from '../../ds/format'
import { cn } from '../../lib/utils'
import type { MonthlyFlowMonth } from '../../types/metrics'
import { lastMonths } from '../analysis/periods'
import { sharePct } from '../analysis/text'

interface TrendCardProps {
  items: MonthlyFlowMonth[]
  coveragePeriods?: ReadPeriodState[]
  coverageError?: unknown
  /** 추이의 마지막 달 (진행월이 있으면 진행월) */
  endPeriod: string
  /** 첫 거래가 있는 달 — 그 전 달은 "가져오기 전"으로 구분 */
  firstPeriod: string | null
  selectedPeriod: string | null
  onSelect: (period: string) => void
}

/** 최근 12개월 흐름 — 자료 없는 달은 0원이 아니라 "자료 없음"으로 둔다. */
export function TrendCard({ items, coveragePeriods, coverageError, endPeriod, firstPeriod, selectedPeriod, onSelect }: TrendCardProps) {
  const [includeOneOff, setIncludeOneOff] = useState(false)
  const coverageByPeriod = new Map(coveragePeriods?.map((item) => [item.period, item]))
  const periods = lastMonths(endPeriod, 12)
  const byPeriod = new Map(items.map((item) => [item.period, item]))
  const withData = periods.map((period) => byPeriod.get(period)).filter((item): item is MonthlyFlowMonth => item != null)
  const beforeData = (period: string) => firstPeriod == null || period < firstPeriod
  const noData = periods.filter((period) => !byPeriod.has(period) && !beforeData(period))
  const inProgress = new Set(withData.filter((item) => item.month_status === 'in_progress').map((item) => item.period))

  return (
    <Card
      title="최근 12개월"
      meta="관측 기록만. 진행월은 흐리게, 자료 없는 달은 따로 표시합니다."
      action={<Toggle label="일회성 포함" checked={includeOneOff} onChange={setIncludeOneOff} />}
    >
      {coverageError ? <p role="note" className="text-caption text-warn">달별 자료 범위를 불러오지 못했습니다.</p> : null}
      <p className="text-micro text-text-muted">달 전체 범위도 수집 완전성을 뜻하지 않습니다. 거래 기록 없는 달은 추정이며 확인되지 않았습니다.</p>
      {withData.length > 0 ? (
        <CashflowChart
          items={withData.map((item) => ({ period: item.period, income: item.income_total, expense: includeOneOff ? item.total_outflow : item.ongoing_outflow, net: item.residual }))}
          incompletePeriods={inProgress}
          outflowOnly={!includeOneOff}
          labels={{ income: '수입', expense: includeOneOff ? '총지급' : '경상 지급', net: '잔여' }}
        />
      ) : null}
      {noData.length > 0 ? (
        <p className="mt-2 text-caption text-text-muted">거래 기록 없는 달(추정 · 확인 안 됨, 0원과 다름): {noData.join(', ')}</p>
      ) : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-caption" aria-label="최근 12개월 월 흐름">
          <thead className="text-micro text-text-muted">
            <tr>
              <th className="py-1.5 pr-2 font-medium">달</th>
              <th className="py-1.5 pr-2 text-right font-medium">수입</th>
              <th className="py-1.5 pr-2 text-right font-medium">{includeOneOff ? '총지급' : '경상 지급'}</th>
              <th className="py-1.5 pr-2 text-right font-medium">일회성</th>
              <th className="py-1.5 pr-2 text-right font-medium">총지급 기준 잔여</th>
              <th className="py-1.5 text-right font-medium">미정 비중</th>
            </tr>
          </thead>
          <tbody className="tnum divide-y divide-border-subtle text-text-secondary">
            {[...periods].reverse().map((period) => {
              const item = byPeriod.get(period)
              const selected = period === selectedPeriod
              return (
                <tr key={period} className={cn(selected && 'bg-bg-selected')}>
                  <th className="py-1.5 pr-2 font-normal">
                    {item?.month_status === 'closed' ? (
                      <button
                        type="button"
                        onClick={() => onSelect(period)}
                        aria-pressed={selected}
                        className={cn('hover:underline', selected ? 'font-semibold text-text-primary' : 'text-transfer')}
                      >
                        {period}
                      </button>
                    ) : (
                      <span>{period}</span>
                    )}
                    {item?.month_status === 'in_progress' ? <Badge variant="warn" className="ml-1">부분 기록</Badge> : null}
                    <MonthCoverageLabel month={coverageByPeriod.get(period)} />
                  </th>
                  {item ? (
                    <>
                      <td className="py-1.5 pr-2 text-right">{formatWon(item.income_total)}</td>
                      <td className="py-1.5 pr-2 text-right">{formatNetWon(includeOneOff ? item.total_outflow : item.ongoing_outflow)}</td>
                      <td className="py-1.5 pr-2 text-right">{formatNetWon(item.one_off_total)}</td>
                      <td className="py-1.5 pr-2 text-right">{formatSignedWon(item.residual)}</td>
                      <td className="py-1.5 text-right">{sharePct(item.adjustability_undecided_share)}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="py-1.5 text-right text-text-muted">{beforeData(period) ? '가져오기 전' : '자료 없음'}</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
