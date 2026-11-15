import { useState } from 'react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { formatNetWon, formatWon } from '../../ds/format'
import { useSpendCube } from '../../hooks/useMetrics'
import { cn } from '../../lib/utils'
import type { MonthlyFlowMonth } from '../../types/metrics'
import { AmountDrilldown, type DrillTarget } from '../analysis/AmountDrilldown'
import { COMMITMENT_KIND_LABELS, type FlowMeasureKey } from '../analysis/flowMeasures'
import { loadErrorMessage } from '../analysis/text'

const KIND_MEASURE: Record<string, FlowMeasureKey> = {
  loan: 'committed_loan_total',
  installment: 'committed_installment_total',
  recurring: 'committed_recurring_total',
}

function adHocTarget(month: MonthlyFlowMonth, amount: number): DrillTarget {
  return {
    kind: 'cube',
    period: month.period,
    monthStatus: month.month_status,
    label: '약정이 아닌 지출 (수시·미정)',
    amount,
    filters: { payment_form: 'ad_hoc' },
    formula: '대출·할부·정기 지급에 속하지 않는 지출의 합계 = 수시 지출(보호 + 조정 가능) + 미정',
    includes: [
      '삭제·병합되었거나 새 거래로 대체된 거래는 빼고, 남아 있는 원화 지출만 셉니다.',
      '환불은 환불이 기록된 달에서 지출을 줄입니다.',
    ],
    excludes: ['대출 원리금, 할부 회차, 등록한 정기 지급은 빠집니다.', '수입과 이체는 넣지 않습니다.'],
  }
}

/**
 * 기존 할부 회차를 뺀 지출 (T058 완료 기준). 읽기 색인(/read/index)에 적힌 정의 그대로:
 * 월 흐름표의 총지급 − 할부 회차, 구성은 지출 큐브 group_by=commitment_kind.
 */
export function NewPurchaseCard({ month }: { month: MonthlyFlowMonth | null }) {
  const [open, setOpen] = useState<string | null>(null)
  const cube = useSpendCube(month ? { start_period: month.period, end_period: month.period, group_by: ['commitment_kind'], limit: 10 } : null)

  if (!month) {
    return (
      <Card title="기존 할부 회차를 뺀 지출">
        <EmptyState message="이 달은 자료가 없습니다." />
      </Card>
    )
  }

  const withoutInstallment = month.total_outflow - month.committed_installment_total
  const order = [null, 'loan', 'recurring', 'installment']
  const rows = [...(cube.data?.rows ?? [])].sort((a, b) => order.indexOf(a.commitment_kind) - order.indexOf(b.commitment_kind))

  return (
    <Card
      title="기존 할부 회차를 뺀 지출"
      meta="예전에 산 물건의 이번 달 할부 회차를 빼고, 이 달에 새로 나간 돈을 봅니다."
    >
      <div className="space-y-3">
        <div>
          <p className="tnum text-kpi text-text-primary">{formatWon(withoutInstallment)}</p>
          <p className="tnum mt-1 text-caption text-text-muted">
            총지급 {formatWon(month.total_outflow)} − 할부 회차 {formatWon(month.committed_installment_total)}
          </p>
        </div>
        {cube.isLoading ? (
          <ListSkeleton rows={4} />
        ) : cube.error ? (
          <ErrorState message={loadErrorMessage(cube.error)} onRetry={() => void cube.refetch()} />
        ) : (
          <ul aria-label="지급 형태별 구성" className="space-y-1">
            {rows.map((row) => {
              const kind = row.commitment_kind
              const key = kind ?? 'ad_hoc'
              const isOpen = open === key
              const label = kind ? COMMITMENT_KIND_LABELS[kind] ?? kind : '약정이 아닌 지출 (수시·미정)'
              const target: DrillTarget = kind && KIND_MEASURE[kind]
                ? { kind: 'flow', measure: KIND_MEASURE[kind], month }
                : adHocTarget(month, row.amount)
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : key)}
                    className={cn('flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left hover:border-border-strong', isOpen && 'bg-bg-selected')}
                  >
                    <span className="min-w-0 flex-1 text-label text-text-primary">
                      {label}
                      {kind === 'installment' ? <Badge variant="neutral" className="ml-1.5">빠짐</Badge> : <Badge variant="accent" className="ml-1.5">포함</Badge>}
                    </span>
                    <span className="tnum shrink-0 text-micro text-text-muted">{row.transaction_count}건</span>
                    <span className="tnum shrink-0 text-label font-semibold">{formatNetWon(row.amount)}</span>
                  </button>
                  {isOpen ? (
                    <div className="py-2">
                      <AmountDrilldown target={target} onClose={() => setOpen(null)} />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-caption text-text-muted">
          할부에 연결되지 않은 할부 결제는 "약정이 아닌 지출"에 남습니다. 연결은 할부 화면에서 사람이 합니다.
        </p>
      </div>
    </Card>
  )
}
