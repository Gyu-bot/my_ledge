import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { Select } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { EM_DASH, formatNetWon, formatSignedWon } from '../../ds/format'
import { useNetWorthReconciliation } from '../../hooks/useNetWorth'
import { cn } from '../../lib/utils'
import type { NetWorthReconciliationResponse, SnapshotIntervalItem, SnapshotIntervalsResponse } from '../../types/netWorth'
import { AmountDrilldown, type DrillTarget } from '../analysis/AmountDrilldown'
import { formatDateKo } from '../analysis/periods'
import { loadErrorMessage, sharePct } from '../analysis/text'
import type { IntervalMeasureKey, IntervalRange, IntervalValues } from './intervalMeasures'
import {
  KIND_TEXT,
  PAIR_STATUS_TEXT,
  STATUS_TEXT,
  reconciliationReasons,
  withheldKindReason,
  withheldUnexplainedReason,
} from './netWorthText'
import { pairKey, transferPurposeLink, type SnapshotPair } from './pairs'

interface EquationRowProps {
  sign: '=' | '+' | ''
  label: string
  description: ReactNode
  value: number | null
  withheldReason: string
  emphasis?: boolean
  onOpen?: () => void
  open?: boolean
}

function EquationRow({ sign, label, description, value, withheldReason, emphasis, onOpen, open }: EquationRowProps) {
  return (
    <li className={cn('flex items-start gap-2 px-3 py-2.5', emphasis ? 'bg-bg-inset' : undefined)}>
      <span aria-hidden="true" className="tnum w-4 shrink-0 pt-0.5 text-center text-label font-semibold text-text-muted">{sign}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-label', emphasis ? 'font-semibold text-text-primary' : 'text-text-primary')}>
          {sign === '+' ? <span className="sr-only">더하기 </span> : sign === '=' ? <span className="sr-only">같음 </span> : null}
          {label}
        </span>
        <span className="mt-0.5 block text-micro text-text-muted">{description}</span>
        {value == null ? <span className="mt-0.5 block text-micro font-medium text-warn">보류 이유: {withheldReason}</span> : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {value == null ? (
          <Badge variant="warn">계산 보류</Badge>
        ) : (
          <span className={cn('tnum text-label', emphasis ? 'font-bold text-text-primary' : 'font-semibold text-text-primary')}>{formatSignedWon(value)}</span>
        )}
        {onOpen && value != null ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={onOpen}
            className="text-micro font-medium text-transfer hover:underline"
            aria-label={`${label} 근거와 거래 열기`}
          >
            근거·거래
          </button>
        ) : null}
      </span>
    </li>
  )
}

function KindTable({ data }: { data: NetWorthReconciliationResponse }) {
  const interval = data.interval
  if (!interval) return null
  const other = data.other_kinds
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full table-fixed text-caption">
        <caption className="sr-only">스냅샷 종류별 날짜와 값</caption>
        <thead className="bg-bg-inset text-micro text-text-muted">
          <tr>
            <th scope="col" className="w-[22%] px-2 py-1.5 text-left font-medium">종류</th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">시작 쪽</th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">끝 쪽</th>
            <th scope="col" className="w-[30%] px-2 py-1.5 text-left font-medium">짝</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          <tr>
            <th scope="row" className="px-2 py-1.5 text-left font-medium text-text-primary">자산(순자산)</th>
            <td className="tnum px-2 py-1.5 break-words">{interval.start_snapshot_date}<br /><span className="text-text-muted">{data.net_worth_start ? formatNetWon(data.net_worth_start.net_worth) : EM_DASH}</span></td>
            <td className="tnum px-2 py-1.5 break-words">{interval.end_snapshot_date}<br /><span className="text-text-muted">{data.net_worth_end ? formatNetWon(data.net_worth_end.net_worth) : EM_DASH}</span></td>
            <td className="px-2 py-1.5">구간의 기준</td>
          </tr>
          {data.kinds.map((kind) => (
            <tr key={kind.kind}>
              <th scope="row" className="px-2 py-1.5 text-left font-medium text-text-primary">{KIND_TEXT[kind.kind]}</th>
              {(['start', 'end'] as const).map((side) => {
                const value = kind[`${side}_value`]
                const knownTotal = kind[`${side}_known_value_total`]
                const missing = kind[`${side}_value_withheld_reason`] === 'snapshot_value_missing'
                return (
                  <td key={side} className="tnum px-2 py-1.5 break-words">
                    {kind[`${side}_as_of`] ?? '없음'}<br />
                    <span className="text-text-muted">
                      {value != null ? formatNetWon(value) : missing ? '값 누락' : EM_DASH}
                      {knownTotal != null ? <><br />확인된 값 합계 {formatNetWon(knownTotal)}</> : null}
                    </span>
                  </td>
                )
              })}
              <td className="px-2 py-1.5">
                {kind.pair_status === 'mismatched' || kind.pair_status === 'incomplete'
                  ? <Badge variant="warn">{PAIR_STATUS_TEXT[kind.pair_status]}</Badge>
                  : PAIR_STATUS_TEXT[kind.pair_status]}
              </td>
            </tr>
          ))}
          {other ? (
            <>
              <tr>
                <th scope="row" className="px-2 py-1.5 text-left font-medium text-text-primary">보험</th>
                <td className="tnum px-2 py-1.5">{other.insurance_start_as_of ?? '없음'}</td>
                <td className="tnum px-2 py-1.5">{other.insurance_end_as_of ?? '없음'}</td>
                <td className="px-2 py-1.5 text-text-muted">대조에 쓰지 않음</td>
              </tr>
              <tr>
                <th scope="row" className="px-2 py-1.5 text-left font-medium text-text-primary">프로필</th>
                <td className="tnum px-2 py-1.5">{other.profile_start_as_of ?? '없음'}</td>
                <td className="tnum px-2 py-1.5">{other.profile_end_as_of ?? '없음'}</td>
                <td className="px-2 py-1.5 text-text-muted">대조에 쓰지 않음</td>
              </tr>
            </>
          ) : null}
        </tbody>
      </table>
      <p className="border-t border-border-subtle px-2 py-1.5 text-micro text-text-muted">
        날짜는 종류마다 그 날 또는 그 전의 가장 가까운 스냅샷입니다. 종류마다 날짜를 따로 두며 하나로 합치지 않습니다.
      </p>
    </div>
  )
}

function ReconciliationBody({
  data,
  pair,
  assetSnapshotCount,
}: {
  data: NetWorthReconciliationResponse
  pair: SnapshotPair | null
  assetSnapshotCount: number | null
}) {
  const [drill, setDrill] = useState<IntervalMeasureKey | null>(null)
  const status = STATUS_TEXT[data.status]
  const reasons = reconciliationReasons(data, assetSnapshotCount)
  const header = (
    <div className="space-y-2">
      <div role="group" aria-label="대조 상태" className="flex flex-wrap items-center gap-2">
        <Badge variant={status.variant}>{data.status === 'complete' ? '✓ ' : '! '}{status.label}</Badge>
        <span className="text-caption text-text-secondary">{status.description}</span>
      </div>
      <p className="text-caption text-text-muted">{data.status_note?.replace(/status=complete/g, '대조 항목 계산 완료').replace(/unexplained_difference/g, '설명되지 않는 차이').replace(/unexplained_share_of_change/g, '설명되지 않는 차이의 비중')}</p>
      {reasons.length > 0 ? (
        <ul aria-label="상태의 이유" className="list-inside list-disc space-y-0.5 text-caption text-text-secondary">
          {reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      ) : null}
    </div>
  )
  if (data.status === 'no_snapshot_pair' || !data.interval || !data.items) {
    return header
  }

  const interval = data.interval
  const items = data.items
  const flow = data.flow
  const transfers = data.transfers
  const range: IntervalRange = {
    start_snapshot_date: interval.start_snapshot_date,
    end_snapshot_date: interval.end_snapshot_date,
    start_date: interval.transaction_start_date,
    end_date: interval.transaction_end_date,
  }
  const values: IntervalValues | null = flow && transfers
    ? {
        income_total: flow.income_total,
        total_outflow: flow.total_outflow,
        residual: flow.residual,
        transaction_count: flow.transaction_count,
        investment_savings_net: transfers.investment_savings_net,
        internal_move_net: transfers.internal_move_net,
        undecided_net: transfers.undecided_net,
      }
    : null
  const loans = data.kinds.find((kind) => kind.kind === 'loans')
  const investments = data.kinds.find((kind) => kind.kind === 'investments')
  const parts = [items.residual, items.loan_balance_decrease, items.investment_valuation_change, items.unexplained_difference]
  const allPresent = parts.every((part): part is number => part != null)
  const addsUp = allPresent && parts.reduce<number>((sum, part) => sum + (part ?? 0), 0) === items.net_worth_change
  const back = pair ?? { start_date: interval.start_snapshot_date, end_date: interval.end_snapshot_date }

  function toggle(measure: IntervalMeasureKey) {
    setDrill((current) => (current === measure ? null : measure))
  }
  const drillPanel = (measures: IntervalMeasureKey[]) =>
    drill && values && measures.includes(drill) ? (
      <AmountDrilldown
        target={{ kind: 'interval', measure: drill, range, values }}
        onClose={() => setDrill(null)}
        onNavigate={(next: DrillTarget) => {
          if (next.kind === 'interval') setDrill(next.measure)
        }}
        nonKrwCount={data.transactions?.non_krw_transaction_count ?? 0}
      />
    ) : null

  return (
    <div className="space-y-4">
      {header}

      <p className="rounded-md border border-border-subtle bg-bg-inset px-3 py-2 text-caption text-text-secondary">
        <strong className="font-semibold text-text-primary">구간의 거래</strong>{' '}
        <span className="tnum">{formatDateKo(interval.transaction_start_date)} ~ {formatDateKo(interval.transaction_end_date)}</span>
        {' · '}스냅샷은 그날 끝의 잔액으로 봅니다. 그래서 시작 스냅샷일({interval.start_snapshot_date})의 거래는 이미 시작 잔액에 들어 있어 빼고, 다음 날부터 끝 스냅샷일({interval.end_snapshot_date})까지의 거래를 셉니다. 이어지는 구간이 같은 날을 두 번 세지 않습니다.
        {flow ? <> 이 구간의 거래 {flow.transaction_count}건.</> : null}
      </p>

      <section aria-label="순자산 변동 대조식">
        <h3 className="mb-1.5 text-label font-semibold text-text-primary">순자산 변동 = 잔여 + 대출 잔액 감소 + 투자 평가 변동 + 설명되지 않는 차이</h3>
        <ul className="divide-y divide-border-subtle rounded-md border border-border">
          <EquationRow
            sign=""
            emphasis
            label="순자산 변동"
            description={
              data.net_worth_start && data.net_worth_end
                ? `끝 순자산 ${formatNetWon(data.net_worth_end.net_worth)} − 시작 순자산 ${formatNetWon(data.net_worth_start.net_worth)} (자산 스냅샷)`
                : '자산 스냅샷 두 날짜의 순자산 차이'
            }
            value={items.net_worth_change}
            withheldReason=""
          />
          <EquationRow
            sign="="
            label="잔여 (수입 − 총지급)"
            description={
              flow
                ? `구간 거래의 수입 ${formatNetWon(flow.income_total)} − 총지급 ${formatNetWon(flow.total_outflow)}. 대출 원리금 ${formatNetWon(flow.committed_loan_total)}이 총지급에 들어 있습니다.`
                : '구간 거래의 수입 − 총지급'
            }
            value={items.residual}
            withheldReason="구간의 거래 기록이 없어 계산하지 않았습니다."
            onOpen={values ? () => toggle('residual') : undefined}
            open={drill === 'residual' || drill === 'income_total' || drill === 'total_outflow'}
          />
          <EquationRow
            sign="+"
            label="대출 잔액 감소"
            description={
              loans && loans.start_value != null && loans.end_value != null
                ? `대출 스냅샷 잔액 ${formatNetWon(loans.start_value)} → ${formatNetWon(loans.end_value)}. 원리금 중 원금만큼 순자산으로 돌아오는 몫이며, 원금·이자를 추정으로 나누지 않습니다.`
                : '대출 스냅샷의 시작 잔액 − 끝 잔액. 원금·이자를 추정으로 나누지 않습니다.'
            }
            value={items.loan_balance_decrease}
            withheldReason={withheldKindReason(loans)}
          />
          <EquationRow
            sign="+"
            label={items.investment_valuation_change_provisional ? '투자 평가 변동 · 잠정' : '투자 평가 변동'}
            description={
              items.investment_value_change != null
                ? `투자 평가액 변화 ${formatSignedWon(items.investment_value_change)} − 투자 이체로 들어간 돈 ${formatSignedWon(items.investment_net_transfer_in)}. 시세를 따로 조회하지 않고 스냅샷 값만 씁니다.`
                : '투자 스냅샷 평가액 변화 − 투자 이체로 들어간 돈'
            }
            value={items.investment_valuation_change}
            withheldReason={withheldKindReason(investments)}
          />
          <EquationRow
            sign="+"
            label="설명되지 않는 차이"
            description="기록으로 설명되지 않는 나머지입니다. 추정 항목으로 채우지 않고 그대로 둡니다. 기록되지 않은 수수료, 장부에 없는 계좌로 보낸 돈, 이체로 들어온 대출금, 예금 이자, 스냅샷을 찍은 시각 뒤의 같은 날 거래 같은 것이 여기에 남습니다."
            value={items.unexplained_difference}
            withheldReason={withheldUnexplainedReason(data.status)}
          />
        </ul>
        {items.investment_valuation_change_provisional ? (
          <p className="mt-2 text-caption text-warn"><Badge variant="warn">잠정</Badge> {items.investment_valuation_change_provisional_reason}</p>
        ) : null}
        <p className="mt-2 text-caption text-text-secondary">
          설명되지 않는 차이의 비중 (순자산 변동 절댓값 대비): {sharePct(items.unexplained_share_of_change)}
          {items.unexplained_share_withheld_reason === 'net_worth_change_zero' ? ' · 순자산 변동이 0원이어서 비중을 내지 않습니다.' : null}
          {items.unexplained_share_withheld_reason === 'unexplained_not_computable' ? ' · 설명되지 않는 차이를 계산할 수 없어 비중을 내지 않습니다.' : null}
        </p>
        {allPresent ? (
          <p className="mt-1.5 text-micro text-text-muted">
            {addsUp ? '네 항목을 더하면 순자산 변동과 같습니다.' : '네 항목의 합이 순자산 변동과 다릅니다. 응답 값을 그대로 보이고 있으니 알려 주세요.'}
          </p>
        ) : null}
        <div className="mt-2">{drillPanel(['residual', 'income_total', 'total_outflow'])}</div>
      </section>

      {transfers ? (
        <section aria-label="잔여의 행방">
          <h3 className="mb-1.5 text-label font-semibold text-text-primary">잔여의 행방 (이체)</h3>
          <p className="mb-1.5 text-caption text-text-muted">
            이체는 수입·지출에 넣지 않고 따로 봅니다. 받은 돈은 +, 보낸 돈은 − 그대로 더합니다. 내 장부 안의 두 계좌 사이 이동은 양쪽 거래를 모두 "그 밖의 계좌 간 이동"으로 정하면 서로 지워져 두 번 세지 않습니다.
          </p>
          <ul className="divide-y divide-border-subtle rounded-md border border-border">
            {([
              ['transfer_investment_savings', '투자·저축 이체', transfers.investment_savings_net, `투자 ${formatSignedWon(transfers.investment_net)} · 저축 ${formatSignedWon(transfers.savings_net)}`],
              ['transfer_internal_move', '그 밖의 계좌 간 이동', transfers.internal_move_net, '내 계좌 사이에서 오간 돈'],
              ['transfer_undecided', '목적 미정 이체', transfers.undecided_net, '아직 목적을 정하지 않은 이체'],
            ] as const).map(([measure, label, value, description]) => (
              <EquationRow
                key={measure}
                sign=""
                label={label}
                description={description}
                value={value}
                withheldReason=""
                onOpen={values ? () => toggle(measure) : undefined}
                open={drill === measure}
              />
            ))}
            <EquationRow sign="=" emphasis label="이체 합계" description="세 줄의 합" value={transfers.transfer_net} withheldReason="" />
          </ul>
          <div className="mt-2">{drillPanel(['transfer_investment_savings', 'transfer_internal_move', 'transfer_undecided'])}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border-subtle px-3 py-2 text-caption">
            <span className="text-text-secondary">
              목적이 정해지지 않은 이체: 이체 금액의{' '}
              <strong className="tnum font-semibold text-text-primary">{sharePct(transfers.undecided_share)}</strong>
              {transfers.activity_total > 0 ? (
                <span className="tnum text-text-muted"> ({formatNetWon(transfers.undecided_activity_total)} / {formatNetWon(transfers.activity_total)}, 오간 금액 기준)</span>
              ) : <span className="text-text-muted"> (이 구간에 이체 없음)</span>}
            </span>
            <Link to={transferPurposeLink(range, transfers.undecided_activity_total > 0, back)} className="inline-flex items-center gap-1 font-medium text-transfer hover:underline">
              이체 목적 정하기
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </section>
      ) : null}

      <section aria-label="스냅샷 종류별 짝">
        <h3 className="mb-1.5 text-label font-semibold text-text-primary">스냅샷 종류별 짝</h3>
        <KindTable data={data} />
      </section>
    </div>
  )
}

const STATUS_FILTER_TEXT = (item: SnapshotIntervalItem) => STATUS_TEXT[item.status].label

function IntervalList({
  intervals,
  selectedKey,
  onSelect,
}: {
  intervals: SnapshotIntervalItem[]
  selectedKey: string | null
  onSelect: (pair: SnapshotPair) => void
}) {
  return (
    <ul aria-label="스냅샷 구간 목록" className="divide-y divide-border-subtle rounded-md border border-border">
      {intervals.map((item) => {
        const key = pairKey({ start_date: item.start_snapshot_date, end_date: item.end_snapshot_date })
        const selected = key === selectedKey
        return (
          <li key={key}>
            <button
              type="button"
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect({ start_date: item.start_snapshot_date, end_date: item.end_snapshot_date })}
              className={cn(
                'flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-caption transition-colors duration-fast',
                selected ? 'bg-bg-selected' : 'hover:bg-bg-inset',
              )}
            >
              <span className="tnum min-w-0 flex-1 basis-44 font-medium text-text-primary">
                {selected ? <span className="sr-only">보고 있는 구간: </span> : null}
                {item.start_snapshot_date} → {item.end_snapshot_date}
              </span>
              <Badge variant={STATUS_TEXT[item.status].variant}>{STATUS_FILTER_TEXT(item)}</Badge>
              <span className="tnum text-text-secondary">순자산 변동 {formatSignedWon(item.net_worth_change)}</span>
              <span className="tnum text-text-secondary">
                설명되지 않는 차이 {item.unexplained_difference != null ? formatSignedWon(item.unexplained_difference) : '계산 보류'}
              </span>
              <span className="tnum text-text-muted">이체 미정 {sharePct(item.transfer_undecided_share)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

interface ReconciliationSectionProps {
  intervals: SnapshotIntervalsResponse | undefined
  intervalsLoading: boolean
  intervalsError: unknown
  onRetryIntervals: () => void
  /** 주소에서 고른 구간. null이면 최근 두 자산 스냅샷 */
  pair: SnapshotPair | null
  onSelect: (pair: SnapshotPair | null) => void
}

/** 순자산 대조 (Implentation-plan.md 2.5) — 값은 응답 그대로, 보류된 값은 보류로 보인다. */
export function ReconciliationSection({ intervals, intervalsLoading, intervalsError, onRetryIntervals, pair, onSelect }: ReconciliationSectionProps) {
  const reconciliation = useNetWorthReconciliation(pair)
  const list = intervals?.intervals ?? []
  const data = reconciliation.data
  const currentKey = data?.interval
    ? pairKey({ start_date: data.interval.start_snapshot_date, end_date: data.interval.end_snapshot_date })
    : pair
      ? pairKey(pair)
      : null
  const badRequest = reconciliation.error instanceof Error && reconciliation.error.message.startsWith('422')

  const picker = list.length > 0 ? (
    <Select
      aria-label="대조할 스냅샷 구간"
      value={currentKey && list.some((item) => pairKey({ start_date: item.start_snapshot_date, end_date: item.end_snapshot_date }) === currentKey) ? currentKey : ''}
      onChange={(event) => {
        const [start, end] = event.target.value.split('~')
        if (start && end) onSelect({ start_date: start, end_date: end })
      }}
      className="max-w-full"
    >
      {currentKey && !list.some((item) => pairKey({ start_date: item.start_snapshot_date, end_date: item.end_snapshot_date }) === currentKey) ? (
        <option value="">구간 고르기</option>
      ) : null}
      {list.map((item, index) => {
        const key = pairKey({ start_date: item.start_snapshot_date, end_date: item.end_snapshot_date })
        return (
          <option key={key} value={key}>
            {item.start_snapshot_date} → {item.end_snapshot_date}{index === 0 ? ' (최근)' : ''}
          </option>
        )
      })}
    </Select>
  ) : null

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="순자산 대조"
        meta="두 자산 스냅샷 사이의 순자산 변동을 같은 구간의 거래 기록과 대출·투자 스냅샷으로 설명합니다. 설명되지 않는 나머지는 따로 둡니다."
      >
        {picker ? (
          <label className="mb-3 flex flex-wrap items-center gap-2 text-caption text-text-muted">
            대조할 구간
            {picker}
          </label>
        ) : null}
        {reconciliation.isLoading ? (
          <ListSkeleton rows={6} />
        ) : badRequest ? (
          <EmptyState message="주소에 적힌 날짜가 자산 스냅샷 날짜가 아니거나 순서가 바뀌었습니다.">
            <button type="button" onClick={() => onSelect(null)} className="text-caption font-medium text-transfer hover:underline">최근 구간 보기</button>
          </EmptyState>
        ) : reconciliation.error || !data ? (
          <ErrorState message={loadErrorMessage(reconciliation.error)} onRetry={() => void reconciliation.refetch()} />
        ) : (
          <ReconciliationBody data={data} pair={pair} assetSnapshotCount={intervals ? intervals.snapshot_dates.assets.length : null} />
        )}
      </Card>

      <Card title="스냅샷 구간" meta="이어지는 두 자산 스냅샷마다 한 구간입니다. 누르면 위의 대조가 그 구간으로 바뀝니다.">
        {intervalsLoading ? (
          <ListSkeleton rows={3} />
        ) : intervalsError ? (
          <ErrorState message={loadErrorMessage(intervalsError)} onRetry={onRetryIntervals} />
        ) : list.length === 0 ? (
          <EmptyState message="자산 스냅샷이 두 날짜 이상 있어야 구간이 생깁니다." actionLabel="가져오기" actionTo="/data/import" />
        ) : (
          <IntervalList intervals={list} selectedKey={currentKey} onSelect={onSelect} />
        )}
      </Card>
    </div>
  )
}
