import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { formatNetWon, formatSignedWon } from '../../ds/format'
import { useMonthlyFlowComparison, useSpendCube, useTransferTransactions } from '../../hooks/useMetrics'
import { useTransactionList } from '../../hooks/useTransactions'
import { cn } from '../../lib/utils'
import type { FlowRowKey, MonthStatus, MonthlyFlowMonth, SpendCubeFilters, SpendCubeRow, TransferPurpose } from '../../types/metrics'
import type { TransactionListParams } from '../../types/transaction'
import { TransactionRows, type TxRow } from '../transactions/TransactionRows'
import { INTERVAL_MEASURES, OUTFLOW_FLOW_ROWS, type IntervalMeasureKey, type IntervalRange, type IntervalValues } from '../networth/intervalMeasures'
import {
  FLOW_MEASURES,
  FLOW_ROW_LABELS,
  FLOW_ROW_MEASURE,
  type FlowMeasureKey,
  formatMeasure,
  formulaWithValues,
  lineFiltersFor,
  measureAmount,
  measureTransactionCount,
} from './flowMeasures'
import { formatDateKo, formatPeriodKo, periodDateRange } from './periods'
import { loadErrorMessage } from './text'

/** 드릴다운 대상: 흐름표의 한 금액이거나, 지출 큐브의 한 칸(카테고리·거래처 등). */
export type DrillTarget =
  | { kind: 'flow'; measure: FlowMeasureKey; month: MonthlyFlowMonth }
  | {
      kind: 'cube'
      period: string
      monthStatus: MonthStatus | null
      label: string
      amount: number
      filters: SpendCubeFilters
      formula: string
      includes: string[]
      excludes: string[]
    }
  /** 순자산 대조의 스냅샷 구간 금액 (T061) — 달이 아니라 날짜 범위로 거래를 연다 */
  | { kind: 'interval'; measure: IntervalMeasureKey; range: IntervalRange; values: IntervalValues }

interface AmountDrilldownProps {
  target: DrillTarget
  onClose: () => void
  /** 다른 금액으로 옮겨 가기 (잔여 → 수입 등) */
  onNavigate?: (target: DrillTarget) => void
  nonKrwCount?: number
}

const TRANSFER_PURPOSE_LABELS: Record<TransferPurpose, string> = {
  investment: '투자',
  savings: '저축',
  internal_move: '그 밖의 계좌 간 이동',
  undecided: '목적 미정',
}

interface DateRange {
  start_date: string
  end_date: string
}

const TX_LIMIT = 200

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
      <h4 className="text-label font-semibold text-text-primary">{title}</h4>
      <div className="mt-1.5 text-caption text-text-secondary">{children}</div>
    </section>
  )
}

/** 목록의 합계가 설명하는 금액과 같은지 밝힌다. 다르면 이유를 쉬운 말로. */
function ListTotalCheck({ rows, amount, count, truncated }: { rows: TxRow[]; amount: number; count: number; truncated: boolean }) {
  if (truncated) return null
  const paid = -rows.reduce((sum, row) => sum + row.amount, 0)
  if (paid === amount && rows.length === count) {
    return <p className="text-text-muted">아래 {rows.length}건의 합계가 이 금액과 같습니다.</p>
  }
  return (
    <p className="rounded-md border border-warn-border bg-warn-bg px-2.5 py-2 text-warn">
      아래 {rows.length}건의 합계는 {formatNetWon(paid)}로, 이 금액({formatNetWon(amount)}, {count}건)과 다릅니다. 환불의 일부만 이 금액에 들어갔거나(목록에는 환불 전체 금액이 보입니다),
      다른 카테고리·거래처로 기록된 환불이 이 구매에 연결된 경우입니다.
    </p>
  )
}

/** 한 카테고리·거래처 칸의 거래 목록 — 금액과 같은 흐름표 줄 조건으로 거른다. */
function CellTransactions({
  period,
  cell,
  filters,
}: {
  period: string
  cell: SpendCubeRow
  filters: SpendCubeFilters
}) {
  const category = cell.effective_category_major ?? ''
  const merchant = cell.merchant ?? ''
  const range = periodDateRange(period)
  const params: TransactionListParams = {
    type: '지출',
    category_major: category,
    search: merchant,
    start_date: range.start_date,
    end_date: range.end_date,
    per_page: TX_LIMIT,
    ...lineFiltersFor(filters),
  }
  const list = useTransactionList(params)

  const rows: TxRow[] = (list.data?.items ?? [])
    .filter((tx) => tx.merchant === merchant && tx.effective_category_major === category && tx.currency === 'KRW')
    .map((tx) => ({
      id: tx.id,
      date: tx.date,
      title: tx.merchant,
      sub: [tx.effective_category_major, tx.effective_category_minor, tx.memo].filter(Boolean).join(' · '),
      amount: tx.amount,
    }))
  const truncated = (list.data?.total ?? 0) > TX_LIMIT
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([key, value]) => value !== undefined && key !== 'per_page')
      .map(([key, value]) => [key, String(value)]),
  )

  return (
    <div className="mt-2 space-y-2">
      {list.isLoading ? (
        <ListSkeleton rows={3} />
      ) : list.error ? (
        <ErrorState message={loadErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <ListTotalCheck rows={rows} amount={cell.amount} count={cell.transaction_count} truncated={truncated} />
          <TransactionRows rows={rows} caption={`${category} · ${merchant} 거래`} />
          {truncated ? (
            <p className="text-text-muted">
              거래가 많아 최근 {TX_LIMIT}건까지만 보여 줍니다.{' '}
              <Link to={`/data/transactions?${query.toString()}`} className="text-transfer hover:underline">거래 화면에서 전체 보기</Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

const INITIAL_CELLS = 10

function CubeBreakdown({ period, filters }: { period: string; filters: SpendCubeFilters }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const cube = useSpendCube({
    start_period: period,
    end_period: period,
    group_by: ['effective_category_major', 'merchant'],
    ...filters,
    limit: 100,
  })
  if (cube.isLoading) return <ListSkeleton rows={4} />
  if (cube.error || !cube.data) return <ErrorState message={loadErrorMessage(cube.error)} onRetry={() => void cube.refetch()} />
  const rows = cube.data.rows
  if (rows.length === 0) return <p className="text-text-muted">이 금액에 들어간 지출이 없습니다.</p>
  const keyOf = (row: SpendCubeRow) => `${row.effective_category_major ?? ''}\u0000${row.merchant ?? ''}`
  const activeKey = selected ?? (rows.length === 1 ? keyOf(rows[0]) : null)
  return (
    <div className="space-y-1.5">
      <p className="text-text-muted">
        카테고리를 유지한 채 거래처별로 나눈 금액입니다(같은 거래처라도 카테고리가 다르면 따로). 합계 {formatNetWon(cube.data.total_amount)}
        {rows.length >= 100 ? ' · 금액이 큰 100칸까지 표시' : ''}. 칸을 누르면 거래가 열립니다.
      </p>
      <ul aria-label="카테고리·거래처 구성" className="space-y-1">
        {(showAll ? rows : rows.slice(0, INITIAL_CELLS)).map((row) => {
          const key = keyOf(row)
          const open = key === activeKey
          return (
            <li key={key}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setSelected(open ? '' : key)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors duration-fast',
                  open ? 'border-accent-border bg-bg-selected' : 'border-border hover:border-border-strong',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label text-text-primary">{row.merchant ?? '거래처 없음'}</span>
                  <span className="block truncate text-micro text-text-muted">{row.effective_category_major ?? '미분류'}</span>
                </span>
                <span className="tnum shrink-0 text-micro text-text-muted">{row.transaction_count}건</span>
                <span className="tnum shrink-0 text-label font-semibold text-text-primary">{formatNetWon(row.amount)}</span>
              </button>
              {open ? <CellTransactions period={period} cell={row} filters={filters} /> : null}
            </li>
          )
        })}
      </ul>
      {!showAll && rows.length > INITIAL_CELLS ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded-md border border-border px-2.5 py-1.5 text-caption font-medium text-text-secondary hover:border-border-strong"
        >
          나머지 {rows.length - INITIAL_CELLS}칸 더 보기
        </button>
      ) : null}
    </div>
  )
}

function FlowRowsBreakdown({
  month,
  excludedRows,
  onNavigate,
}: {
  month: MonthlyFlowMonth
  excludedRows: FlowRowKey[]
  onNavigate?: (target: DrillTarget) => void
}) {
  const spendRows = month.rows.filter((row) => row.section !== 'income' && row.section !== 'transfer' && row.section !== 'other')
  if (spendRows.length === 0) return <p className="text-text-muted">이 달에 지출 줄이 없습니다.</p>
  return (
    <ul aria-label="흐름표 줄별 구성" className="space-y-1">
      {spendRows.map((row) => {
        const excluded = excludedRows.includes(row.row)
        const measure = FLOW_ROW_MEASURE[row.row]
        return (
          <li key={row.row} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <span className="min-w-0 flex-1 text-label text-text-primary">
              {FLOW_ROW_LABELS[row.row]}
              {excluded ? <Badge variant="neutral" className="ml-1.5">빠짐</Badge> : <Badge variant="accent" className="ml-1.5">포함</Badge>}
            </span>
            <span className="tnum shrink-0 text-label font-semibold">{formatNetWon(row.amount)}</span>
            {measure && onNavigate ? (
              <button
                type="button"
                className="shrink-0 text-micro font-medium text-transfer hover:underline"
                onClick={() => onNavigate({ kind: 'flow', measure, month })}
              >
                내역
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function IncomeTransactions({ range, expectedCount }: { range: DateRange; expectedCount: number | null }) {
  const list = useTransactionList({ type: '수입', flow_row: 'income_undetermined', start_date: range.start_date, end_date: range.end_date, per_page: TX_LIMIT })
  if (list.isLoading) return <ListSkeleton rows={3} />
  if (list.error) return <ErrorState message={loadErrorMessage(list.error)} onRetry={() => void list.refetch()} />
  const rows: TxRow[] = (list.data?.items ?? [])
    .filter((tx) => tx.currency === 'KRW')
    .map((tx) => ({
      id: tx.id,
      date: tx.date,
      title: tx.merchant,
      sub: [tx.effective_category_major, tx.effective_category_minor, tx.memo].filter(Boolean).join(' · '),
      amount: tx.amount,
    }))
  return (
    <div className="space-y-1.5">
      {expectedCount != null && expectedCount !== rows.length ? (
        <p className="text-warn">흐름표는 {expectedCount}건인데 거래 목록은 {rows.length}건입니다. 거래가 많아 목록이 잘렸을 수 있습니다.</p>
      ) : null}
      <TransactionRows rows={rows} caption="수입 거래" />
    </div>
  )
}

function TransferTransactions({ range, purposes }: { range: DateRange; purposes: TransferPurpose[] | null }) {
  const list = useTransferTransactions({ start_date: range.start_date, end_date: range.end_date })
  if (list.isLoading) return <ListSkeleton rows={3} />
  if (list.error || !list.data) return <ErrorState message={loadErrorMessage(list.error)} onRetry={() => void list.refetch()} />
  const rows: TxRow[] = list.data.items
    .filter((item) => item.effective && item.purpose != null && (purposes == null || purposes.includes(item.purpose)))
    .map((item) => ({
      id: item.transaction_id,
      date: item.date,
      title: item.merchant,
      sub: [item.purpose ? `목적: ${TRANSFER_PURPOSE_LABELS[item.purpose]}` : null, item.effective_category_major].filter(Boolean).join(' · '),
      amount: item.amount,
    }))
  return (
    <div className="space-y-1.5">
      <TransactionRows rows={rows} caption="이체 거래" />
      <p className="text-text-muted">
        이체의 목적은 사람이 정합니다. 거래 옆 "고치기"에서 그 거래의 목적을 정하거나,{' '}
        <Link
          to={`/data/transfers?${new URLSearchParams({ start: range.start_date, end: range.end_date }).toString()}`}
          className="text-transfer hover:underline"
        >
          이체 목적 정하기 화면
        </Link>
        에서 같은 거래처를 규칙으로 한꺼번에 정할 수 있습니다.
      </p>
    </div>
  )
}

/** 날짜 범위 안에서 흐름표 줄 하나에 든 거래 (스냅샷 구간용) */
function RangeRowTransactions({ range, flowRow }: { range: DateRange; flowRow: FlowRowKey }) {
  const params: TransactionListParams = { flow_row: flowRow, start_date: range.start_date, end_date: range.end_date, per_page: TX_LIMIT }
  const list = useTransactionList(params)
  if (list.isLoading) return <ListSkeleton rows={3} />
  if (list.error || !list.data) return <ErrorState message={loadErrorMessage(list.error)} onRetry={() => void list.refetch()} />
  const rows: TxRow[] = list.data.items
    .filter((tx) => tx.currency === 'KRW')
    .map((tx) => ({
      id: tx.id,
      date: tx.date,
      title: tx.merchant,
      sub: [tx.effective_category_major, tx.effective_category_minor, tx.memo].filter(Boolean).join(' · '),
      amount: tx.amount,
    }))
  const query = new URLSearchParams({ flow_row: flowRow, start_date: range.start_date, end_date: range.end_date })
  return (
    <div className="space-y-1.5">
      <p className="text-text-muted">{list.data.total}건</p>
      <TransactionRows rows={rows} caption={`${FLOW_ROW_LABELS[flowRow]} 거래`} />
      {list.data.total > TX_LIMIT ? (
        <p className="text-text-muted">
          거래가 많아 {TX_LIMIT}건까지만 보여 줍니다.{' '}
          <Link to={`/data/transactions?${query.toString()}`} className="text-transfer hover:underline">거래 화면에서 전체 보기</Link>
        </p>
      ) : null}
    </div>
  )
}

/** 총지급을 이루는 흐름표 줄을 골라 그 줄의 거래를 연다 (구간별 줄 금액은 응답에 없어 거래만 보인다) */
function OutflowRowsPicker({ range }: { range: DateRange }) {
  const [row, setRow] = useState<FlowRowKey | null>(null)
  return (
    <div className="space-y-2">
      <p className="text-text-muted">총지급은 아래 줄로 이루어집니다. 줄을 누르면 이 구간의 거래가 열립니다.</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="총지급의 흐름표 줄">
        {OUTFLOW_FLOW_ROWS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={row === key}
            onClick={() => setRow(row === key ? null : key)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-caption font-medium',
              row === key ? 'border-accent-border bg-bg-selected text-text-primary' : 'border-border text-text-secondary hover:border-border-strong',
            )}
          >
            {FLOW_ROW_LABELS[key]}
          </button>
        ))}
      </div>
      {row ? <RangeRowTransactions range={range} flowRow={row} /> : null}
    </div>
  )
}

function ComparisonLine({ period, comparisonKey }: { period: string; comparisonKey: string }) {
  const comparison = useMonthlyFlowComparison(period)
  if (comparison.isLoading) return <ListSkeleton rows={1} />
  if (comparison.error || !comparison.data) return <p className="text-text-muted">비교를 불러오지 못했습니다.</p>
  const measure = comparison.data.measures.find((item) => item.key === comparisonKey)
  const basis = comparison.data.comparison
  if (!measure || measure.baseline_amount == null) {
    return <p className="text-text-muted">비교할 기준 기간(이전 마감월)이 없습니다.</p>
  }
  const periods = basis.baseline_periods
  return (
    <div className="space-y-1">
      <p className="tnum">
        {basis.baseline_method_label} {formatNetWon(measure.baseline_amount)}
        {measure.change_amount != null ? ` · 차이 ${formatSignedWon(measure.change_amount)}` : ''}
      </p>
      <p className="text-text-muted">
        기준 기간 {periods.length > 0 ? `${periods[0]} ~ ${periods[periods.length - 1]} (${basis.baseline_month_count}개월)` : '없음'}
        {basis.skipped_periods.length > 0 ? ` · 자료 없는 달 제외 ${basis.skipped_periods.map((item) => item.period).join(', ')}` : ''}
        {' · '}
        {basis.partial_month_note}
      </p>
    </div>
  )
}

function IntervalDrilldown({ target, onClose, onNavigate, nonKrwCount }: AmountDrilldownProps & { target: Extract<DrillTarget, { kind: 'interval' }>; nonKrwCount: number }) {
  const def = INTERVAL_MEASURES[target.measure]
  const amount = def.amount(target.values)
  const withValues = def.withValues(target.values)
  const range: DateRange = { start_date: target.range.start_date, end_date: target.range.end_date }
  const source = def.source
  let body: ReactNode
  if (source.kind === 'parts') {
    body = (
      <div className="flex flex-wrap gap-2">
        {source.parts.map((part) => (
          <button
            key={part}
            type="button"
            onClick={() => onNavigate?.({ ...target, measure: part })}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-caption font-medium text-text-secondary hover:border-border-strong"
          >
            {INTERVAL_MEASURES[part].label} 내역 열기
            <ArrowRight className="h-3 w-3" />
          </button>
        ))}
      </div>
    )
  } else if (source.kind === 'income') {
    body = <IncomeTransactions range={range} expectedCount={null} />
  } else if (source.kind === 'outflow_rows') {
    body = <OutflowRowsPicker range={range} />
  } else {
    body = <TransferTransactions range={range} purposes={source.purposes} />
  }
  return (
    <div role="region" aria-label={`${def.label} 근거`} className="rounded-md border border-accent-border bg-bg-raised p-3 shadow-raised">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-label font-semibold text-text-primary">
            {def.label} <span className="tnum">{def.signed ? formatSignedWon(amount) : formatNetWon(amount)}</span>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-micro text-text-muted">
            <span className="tnum">{formatDateKo(range.start_date)} ~ {formatDateKo(range.end_date)}</span>
            <Badge variant="neutral">스냅샷 구간</Badge>
          </p>
        </div>
        <button type="button" aria-label="근거 닫기" onClick={onClose} className="shrink-0 text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-3">
        <Section title="산식">
          <p>{def.formula}</p>
          {withValues ? <p className="tnum mt-1 text-text-primary">{withValues}</p> : null}
        </Section>
        <Section title="포함하는 것">
          <ul className="list-inside list-disc space-y-0.5">
            {def.includes.map((item) => <li key={item}>{item}</li>)}
            {nonKrwCount > 0 ? <li>원화가 아닌 거래 {nonKrwCount}건은 따로 세고 더하지 않았습니다.</li> : null}
          </ul>
        </Section>
        <Section title="빼는 것">
          <ul className="list-inside list-disc space-y-0.5">
            {def.excludes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Section>
        <Section title={source.kind === 'parts' ? '이루는 금액' : '거래'}>{body}</Section>
        <p className="text-micro text-text-muted">거래 옆 "고치기"를 누르면 이 화면 위에서 그 거래의 분류를 고칠 수 있습니다. 닫으면 보던 자리로 돌아옵니다.</p>
      </div>
    </div>
  )
}

export function AmountDrilldown({ target, onClose, onNavigate, nonKrwCount = 0 }: AmountDrilldownProps) {
  if (target.kind === 'interval') {
    return <IntervalDrilldown target={target} onClose={onClose} onNavigate={onNavigate} nonKrwCount={nonKrwCount} />
  }
  const isFlow = target.kind === 'flow'
  const def = isFlow ? FLOW_MEASURES[target.measure] : null
  const period = isFlow ? target.month.period : target.period
  const monthStatus = isFlow ? target.month.month_status : target.monthStatus
  const label = def ? def.label : target.kind === 'cube' ? target.label : ''
  const amountText = isFlow && def ? formatMeasure(def, measureAmount(target.month, target.measure)) : target.kind === 'cube' ? formatNetWon(target.amount) : ''
  const formula = def ? def.formula : target.kind === 'cube' ? target.formula : ''
  const withValues = isFlow ? formulaWithValues(target.month, target.measure) : null
  const includes = def ? def.includes : target.kind === 'cube' ? target.includes : []
  const excludes = def ? def.excludes : target.kind === 'cube' ? target.excludes : []
  const txCount = isFlow && def ? measureTransactionCount(target.month, def) : null

  let body: ReactNode = null
  if (target.kind === 'cube') {
    body = <CubeBreakdown period={period} filters={target.filters} />
  } else if (def) {
    const source = def.source
    if (source.kind === 'cube') body = <CubeBreakdown period={period} filters={source.filters} />
    else if (source.kind === 'cube_rows') body = <FlowRowsBreakdown month={target.month} excludedRows={source.excludedRows} onNavigate={onNavigate} />
    else if (source.kind === 'income') body = <IncomeTransactions range={periodDateRange(period)} expectedCount={txCount} />
    else if (source.kind === 'transfer') body = <TransferTransactions range={periodDateRange(period)} purposes={source.purposes} />
    else {
      body = (
        <div className="flex flex-wrap gap-2">
          {source.parts.map((part) => (
            <button
              key={part}
              type="button"
              onClick={() => onNavigate?.({ kind: 'flow', measure: part, month: target.month })}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-caption font-medium text-text-secondary hover:border-border-strong"
            >
              {FLOW_MEASURES[part].label} 내역 열기
              <ArrowRight className="h-3 w-3" />
            </button>
          ))}
        </div>
      )
    }
  }

  return (
    <div role="region" aria-label={`${label} 근거`} className="rounded-md border border-accent-border bg-bg-raised p-3 shadow-raised">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-label font-semibold text-text-primary">
            {label} <span className="tnum">{amountText}</span>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-micro text-text-muted">
            {formatPeriodKo(period)}
            {monthStatus === 'in_progress' ? <Badge variant="warn">진행월 · 부분 기록</Badge> : monthStatus === 'closed' ? <Badge variant="neutral">마감월</Badge> : null}
            {txCount != null ? <span>{txCount}건</span> : null}
          </p>
        </div>
        <button type="button" aria-label="근거 닫기" onClick={onClose} className="shrink-0 text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-3">
        <Section title="산식">
          <p>{formula}</p>
          {withValues ? <p className="tnum mt-1 text-text-primary">{withValues}</p> : null}
        </Section>
        <Section title="포함하는 것">
          <ul className="list-inside list-disc space-y-0.5">
            {includes.map((item) => <li key={item}>{item}</li>)}
            {nonKrwCount > 0 ? <li>원화가 아닌 거래 {nonKrwCount}건은 따로 세고 더하지 않았습니다.</li> : null}
          </ul>
        </Section>
        <Section title="빼는 것">
          <ul className="list-inside list-disc space-y-0.5">
            {excludes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Section>
        {def?.comparisonKey ? (
          <Section title="기준 기간과 비교">
            <ComparisonLine period={period} comparisonKey={def.comparisonKey} />
          </Section>
        ) : null}
        <Section title={def?.source.kind === 'parts' ? '이루는 금액' : '구성과 거래'}>{body}</Section>
        <p className="text-micro text-text-muted">거래 옆 "고치기"를 누르면 이 화면 위에서 그 거래의 분류를 고칠 수 있습니다. 닫으면 보던 자리로 돌아옵니다.</p>
      </div>
    </div>
  )
}
