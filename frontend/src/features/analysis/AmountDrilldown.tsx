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
import {
  FLOW_MEASURES,
  FLOW_ROW_LABELS,
  FLOW_ROW_MEASURE,
  type FlowMeasureKey,
  formatMeasure,
  formulaWithValues,
  measureAmount,
  measureTransactionCount,
} from './flowMeasures'
import { formatPeriodKo, periodDateRange } from './periods'
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
  internal_move: '계좌 간 이동',
  undecided: '목적 미정',
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

function TransactionLink({ id }: { id: number }) {
  return (
    <Link
      to={`/data/transactions?transaction_id=${id}`}
      className="inline-flex shrink-0 items-center gap-0.5 text-micro font-medium text-transfer hover:underline"
      aria-label={`거래 ${id} 거래 화면에서 열기`}
    >
      열기
      <ArrowRight className="h-3 w-3" />
    </Link>
  )
}

interface TxRow {
  id: number
  date: string
  title: string
  sub: string
  amount: number
}

function TransactionRows({ rows, caption }: { rows: TxRow[]; caption: string }) {
  if (rows.length === 0) return <p className="text-text-muted">해당하는 거래가 없습니다.</p>
  return (
    <ul aria-label={caption} className="divide-y divide-border-subtle rounded-md border border-border bg-bg-inset">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-2 px-2.5 py-2">
          <span className="tnum w-[4.5rem] shrink-0 text-micro text-text-muted">{row.date}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-label text-text-primary">{row.title}</span>
            <span className="block truncate text-micro text-text-muted">{row.sub}</span>
          </span>
          <span className="tnum shrink-0 text-label font-semibold text-text-primary">{formatSignedWon(row.amount)}</span>
          <TransactionLink id={row.id} />
        </li>
      ))}
    </ul>
  )
}

/** 한 카테고리·거래처의 원본 거래 목록. /transactions에는 흐름표 줄 필터가 없어, 그 칸이 여러 줄에 걸치면 그 사실과 줄별 금액을 함께 보인다. */
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
  const list = useTransactionList({
    type: '지출',
    category_major: category,
    search: merchant,
    start_date: range.start_date,
    end_date: range.end_date,
    per_page: TX_LIMIT,
  })
  const allLines = useSpendCube({
    start_period: period,
    end_period: period,
    group_by: ['flow_row'],
    effective_category_major: category,
    merchant,
    limit: 20,
  })
  const hasExtraFilters = Object.keys(filters).length > 0

  const rows: TxRow[] = (list.data?.items ?? [])
    .filter((tx) => tx.merchant === merchant && tx.effective_category_major === category && tx.currency === 'KRW')
    .map((tx) => ({
      id: tx.id,
      date: tx.date,
      title: tx.merchant,
      sub: [tx.effective_category_major, tx.effective_category_minor, tx.memo].filter(Boolean).join(' · '),
      amount: tx.amount,
    }))

  const allCount = (allLines.data?.rows ?? []).reduce((sum, row) => sum + row.transaction_count, 0)
  const sameAsCell = allLines.data != null && allLines.data.total_amount === cell.amount && allCount === cell.transaction_count

  return (
    <div className="mt-2 space-y-2">
      {allLines.data && hasExtraFilters ? (
        sameAsCell ? (
          <p className="text-text-muted">이 카테고리·거래처의 이 달 지출은 모두 이 금액에 들어갑니다.</p>
        ) : (
          <div className="rounded-md border border-warn-border bg-warn-bg px-2.5 py-2 text-warn">
            <p>이 카테고리·거래처의 지출은 흐름표 여러 줄에 걸쳐 있습니다. 아래 거래 목록은 줄을 나누지 않고 모두 보여 줍니다.</p>
            <ul className="tnum mt-1 list-inside list-disc">
              {allLines.data.rows.map((row) => (
                <li key={row.flow_row ?? 'none'}>
                  {FLOW_ROW_LABELS[(row.flow_row ?? 'other_type') as FlowRowKey]} {formatNetWon(row.amount)} · {row.transaction_count}건
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
      {list.isLoading ? (
        <ListSkeleton rows={3} />
      ) : list.error ? (
        <ErrorState message={loadErrorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <>
          <TransactionRows rows={rows} caption={`${category} · ${merchant} 거래`} />
          {(list.data?.total ?? 0) > TX_LIMIT ? (
            <p className="text-text-muted">거래가 많아 최근 {TX_LIMIT}건까지만 보여 줍니다. 전체는 거래 화면에서 보세요.</p>
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

function IncomeTransactions({ period, expectedCount }: { period: string; expectedCount: number | null }) {
  const range = periodDateRange(period)
  const list = useTransactionList({ type: '수입', start_date: range.start_date, end_date: range.end_date, per_page: TX_LIMIT })
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
        <p className="text-warn">흐름표는 {expectedCount}건인데 거래 목록은 {rows.length}건입니다. 대체된 거래가 목록에 남아 있거나 목록이 잘렸을 수 있습니다.</p>
      ) : null}
      <TransactionRows rows={rows} caption="수입 거래" />
    </div>
  )
}

function TransferTransactions({ period, purposes }: { period: string; purposes: TransferPurpose[] | null }) {
  const range = periodDateRange(period)
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
      <p className="text-text-muted">이체의 목적은 사람이 정합니다. 목적을 정하는 화면은 작업대 재편(T059)에서 붙습니다.</p>
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

export function AmountDrilldown({ target, onClose, onNavigate, nonKrwCount = 0 }: AmountDrilldownProps) {
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
    else if (source.kind === 'income') body = <IncomeTransactions period={period} expectedCount={txCount} />
    else if (source.kind === 'transfer') body = <TransferTransactions period={period} purposes={source.purposes} />
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
        <p className="text-micro text-text-muted">거래 옆 "열기"를 누르면 거래 화면에서 그 거래가 열리고 분류를 고칠 수 있습니다.</p>
      </div>
    </div>
  )
}
