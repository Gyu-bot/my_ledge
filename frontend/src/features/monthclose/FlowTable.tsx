import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatNetWon } from '../../ds/format'
import { monthToDateRange } from '../../lib/dateRange'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { MonthlyFlowMonth } from '../../types/metrics'
import { FLOW_MEASURES, type FlowMeasureKey, formatMeasure, measureAmount } from '../analysis/flowMeasures'
import { sharePct } from '../analysis/text'

type FlowLine =
  | { type: 'measure'; key: FlowMeasureKey; indent?: boolean; strong?: boolean; sign?: string; label?: string }
  | { type: 'heading'; label: string; sign?: string }
  | { type: 'reference'; key: 'one_off_total' | 'ongoing_outflow'; label: string }

const OUTLAY_REFERENCES: FlowLine[] = [
  { type: 'reference', key: 'one_off_total', label: '총지급 중 일회성' },
  { type: 'reference', key: 'ongoing_outflow', label: '경상 지급' },
]

/** 월 흐름표의 줄 순서 (Implentation-plan.md 2.3) */
const FULL_LINES: FlowLine[] = [
  { type: 'measure', key: 'income_total', strong: true, sign: '' },
  { type: 'measure', key: 'committed_total', strong: true, sign: '−' },
  { type: 'measure', key: 'committed_loan_total', indent: true },
  { type: 'measure', key: 'committed_installment_total', indent: true },
  { type: 'measure', key: 'committed_recurring_total', indent: true },
  { type: 'heading', label: '수시 지출', sign: '−' },
  { type: 'measure', key: 'ad_hoc_protected_total', indent: true, label: '보호', sign: '' },
  { type: 'measure', key: 'ad_hoc_adjustable_total', indent: true, label: '조정 가능', sign: '' },
  { type: 'measure', key: 'undecided_total', strong: true, sign: '−', label: '미정 (조정 가능성 미정인 수시 지출)' },
  { type: 'measure', key: 'total_outflow', strong: true, sign: '=', label: '총지급 (약정 + 수시 + 미정)' },
  ...OUTLAY_REFERENCES,
  { type: 'measure', key: 'residual', strong: true, sign: '=', label: '잔여 (수입 − 총지급)' },
  { type: 'heading', label: '잔여의 행방 (이체)' },
  { type: 'measure', key: 'transfer_investment_savings', indent: true },
  { type: 'measure', key: 'transfer_internal_move', indent: true },
  { type: 'measure', key: 'transfer_undecided', indent: true },
  { type: 'measure', key: 'transfer_net', indent: true },
  { type: 'heading', label: '함께 보는 값' },
  { type: 'measure', key: 'living_spend', indent: true, label: '생활 지출 (총지급 − 대출 원리금)' },
  { type: 'measure', key: 'protected_spend', indent: true },
  { type: 'measure', key: 'adjustable_spend', indent: true },
]

/** 진행월 관측 누적: 비율 없이 핵심 줄만 */
const COMPACT_LINES: FlowLine[] = [
  { type: 'measure', key: 'income_total', strong: true, sign: '' },
  { type: 'measure', key: 'committed_total', strong: true, sign: '−' },
  { type: 'measure', key: 'ad_hoc_protected_total', sign: '−' },
  { type: 'measure', key: 'ad_hoc_adjustable_total', sign: '−' },
  { type: 'measure', key: 'undecided_total', sign: '−' },
  { type: 'measure', key: 'total_outflow', strong: true, sign: '=' },
  ...OUTLAY_REFERENCES,
  { type: 'measure', key: 'residual', strong: true, sign: '=', label: '잔여 (지금까지)' },
]

interface FlowTableProps {
  month: MonthlyFlowMonth
  variant?: 'full' | 'compact'
  openMeasure: FlowMeasureKey | null
  onToggle: (measure: FlowMeasureKey) => void
  /** 열린 금액 아래에 그대로 끼워 넣는 드릴다운 */
  drilldown: ReactNode
  caption: string
}

export function FlowTable({ month, variant = 'full', openMeasure, onToggle, drilldown, caption }: FlowTableProps) {
  const lines = variant === 'full' ? FULL_LINES : COMPACT_LINES
  return (
    <div>
      <ul aria-label={caption} className="divide-y divide-border-subtle">
        {lines.map((line, index) => {
          if (line.type === 'heading') {
            return (
              <li key={`h-${line.label}`} className="flex items-center gap-2 px-1 pb-1 pt-3 text-caption font-semibold text-text-muted">
                <span className="w-3 text-center" aria-hidden>{line.sign}</span>
                {line.label}
              </li>
            )
          }
          if (line.type === 'reference') {
            const range = monthToDateRange(month.period)
            const params = new URLSearchParams({
              start_date: range.start_date,
              end_date: range.end_date,
              type: '지출',
              one_off: String(line.key === 'one_off_total'),
            })
            return (
              <li key={line.key}>
                <Link to={`/data/transactions?${params}`} className="flex items-center justify-between gap-2 py-2 pl-6 pr-1 text-caption text-text-secondary hover:bg-bg-inset">
                  <span>{line.label}</span><span className="tnum">{formatNetWon(month[line.key])}</span>
                </Link>
              </li>
            )
          }
          const def = FLOW_MEASURES[line.key]
          const amount = measureAmount(month, line.key)
          const open = openMeasure === line.key
          const sign = line.sign ?? def.sign
          return (
            <Fragment key={`${line.key}-${index}`}>
              <li>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => onToggle(line.key)}
                  className={cn(
                    'flex w-full items-center gap-2 px-1 py-2 text-left transition-colors duration-fast hover:bg-bg-inset',
                    open && 'bg-bg-selected',
                  )}
                >
                  <span className="w-3 shrink-0 text-center text-label text-text-muted" aria-hidden>{sign}</span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-label',
                      line.indent && 'pl-3',
                      line.strong ? 'font-semibold text-text-primary' : 'text-text-secondary',
                    )}
                  >
                    {line.label ?? def.label}
                  </span>
                  <span className={cn('tnum shrink-0 text-label', line.strong ? 'font-semibold text-text-primary' : 'text-text-secondary')}>
                    {formatMeasure(def, amount)}
                  </span>
                  {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />}
                </button>
              </li>
              {open && drilldown ? <li className="py-2">{drilldown}</li> : null}
            </Fragment>
          )
        })}
      </ul>
      <dl className="tnum mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border-subtle pt-2 text-caption text-text-muted">
        {variant === 'full' ? (
          <div>
            <dt className="inline">현금 잔여율 (잔여 ÷ 수입) </dt>
            <dd className="inline text-text-secondary">
              {month.month_status === 'closed' ? sharePct(month.residual_rate) : '진행월에는 내지 않음'}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="inline">조정 가능성 미정 비중 </dt>
          <dd className="inline text-text-secondary">{sharePct(month.adjustability_undecided_share)}</dd>
        </div>
        <div>
          <dt className="inline">총지급에서 뺀 환불 </dt>
          <dd className="inline text-text-secondary">{formatMeasure(FLOW_MEASURES.total_outflow, month.refund_total)}</dd>
        </div>
        <div>
          <dt className="inline">거래 </dt>
          <dd className="inline text-text-secondary">{month.transaction_count.toLocaleString('ko-KR')}건</dd>
        </div>
        {month.other_type_total !== 0 ? (
          <div>
            <dt className="inline">수입·지출·이체가 아닌 유형 (합계에 넣지 않음) </dt>
            <dd className="inline text-text-secondary">{formatMeasure(FLOW_MEASURES.residual, month.other_type_total)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}
