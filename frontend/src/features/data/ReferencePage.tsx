import { Database, Table2 } from 'lucide-react'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { Stat } from '../../ds/Stat'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { EM_DASH, formatPct, formatWonCompact } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import { useCanonicalViewsDashboard } from '../../hooks/useCanonicalViews'
import { useSchemaDocument } from '../../hooks/useSchema'

const ADVISOR_VIEWS = [
  'vw_monthly_cashflow',
  'vw_loan_repayment_monthly',
  'vw_true_spendable_monthly',
  'vw_merchant_monthly_baseline',
  'vw_recurring_merchant_monthly',
  'vw_unclassified_work_queue',
  'vw_loan_account_canonical',
  'vw_income_monthly_by_category',
]

const VIEW_LABELS: Record<string, string> = {
  vw_monthly_cashflow: '월별 현금흐름',
  vw_loan_repayment_monthly: '대출 상환 월별',
  vw_true_spendable_monthly: '실질 가용액',
  vw_merchant_monthly_baseline: '거래처 기준선',
  vw_recurring_merchant_monthly: '반복 거래처 월별',
  vw_unclassified_work_queue: '분류 품질 큐',
  vw_loan_account_canonical: '대출 계좌 구조',
  vw_income_monthly_by_category: '월별 수입 카테고리',
}

function money(value: number | null | undefined) {
  if (value == null) return EM_DASH
  return value < 0 ? `-${formatWonCompact(value)}` : formatWonCompact(value)
}

export function ReferencePage() {
  const dashboard = useCanonicalViewsDashboard()
  const schema = useSchemaDocument()

  const data = dashboard.data
  const cashflow = data?.monthly_cashflow ?? []
  const latestCashflow = cashflow[cashflow.length - 1]
  const spendable = data?.true_spendable_monthly ?? []
  const latestSpendable = spendable[spendable.length - 1]
  const coverage = data?.data_coverage
  const views = (schema.data?.views ?? [])
  const orderedViews = ADVISOR_VIEWS.map((name) => views.find((view) => view.name === name)).filter((view): view is NonNullable<typeof view> => view != null)

  if (dashboard.isLoading || schema.isLoading) {
    return (<><PageHeader title="데이터 · 데이터 사전" /><ListSkeleton rows={6} /></>)
  }
  if (dashboard.isError || schema.isError) {
    return (<><PageHeader title="데이터 · 데이터 사전" /><ErrorState onRetry={() => { void dashboard.refetch(); void schema.refetch() }} /></>)
  }

  return (
    <>
      <PageHeader
        title="데이터 · 데이터 사전"
        meta={coverage ? <span className="tnum">관측 {coverage.first_transaction_date ?? '—'} ~ {coverage.last_transaction_date ?? '—'}</span> : undefined}
      />

      <div className="flex flex-col gap-4">
        <Card title="외부 에이전트가 보는 것과 같은 canonical 수치입니다">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Latest income" value={money(latestSpendable?.is_income_estimated ? latestSpendable.estimated_income_total : latestCashflow?.income_total)} sub={latestCashflow?.period} />
            <Stat label="Non-loan spend" value={money(latestCashflow?.non_loan_expense_total)} sub={`대출상환 ${money(latestCashflow?.loan_repayment_total)}`} />
            <Stat label="Net cashflow" value={money(latestCashflow?.net_cashflow)} sub={`저축률 ${formatPct(latestCashflow?.savings_rate == null ? null : latestCashflow.savings_rate * 100)}`} subTone={(latestCashflow?.net_cashflow ?? 0) >= 0 ? 'good' : 'bad'} />
            <Stat label="Spendable after variable" value={money(latestSpendable?.is_income_estimated ? latestSpendable.estimated_remaining_after_variable_spend : latestSpendable?.remaining_after_variable_spend)} sub={latestSpendable?.is_income_estimated ? '예상' : '관측'} />
          </div>
        </Card>

        <Card title="월별 현금흐름" meta={`${cashflow.length}개월 · 진행중 월은 배지 표시`} bodyClassName="p-0">
          {cashflow.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-label">
                <thead className="bg-bg-inset">
                  <tr>{['Month', 'Income', 'Expense', 'Loan', 'Discretionary', 'Net'].map((h) => <th key={h} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {cashflow.map((item) => (
                    <tr key={item.period}>
                      <td className="tnum px-4 py-2 font-semibold text-text-primary">
                        {item.period}
                        {!item.is_complete_month ? <Badge variant="warn" className="ml-1.5">진행중</Badge> : null}
                      </td>
                      <td className="tnum px-4 py-2 text-text-secondary">{money(item.income_total)}</td>
                      <td className="tnum px-4 py-2 text-text-secondary">{money(item.expense_total)}</td>
                      <td className="tnum px-4 py-2 text-text-muted">{money(item.loan_repayment_total)}</td>
                      <td className="tnum px-4 py-2 text-text-muted">{money(item.discretionary_spend_total)}</td>
                      <td className="tnum px-4 py-2 text-text-secondary">{money(item.net_cashflow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState className="py-8" message="canonical 데이터가 없습니다" />}
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="분류 품질 큐" meta={`${data?.unclassified_work_queue.length ?? 0}건`} bodyClassName="p-0">
            <div className="divide-y divide-border-subtle">
              {(data?.unclassified_work_queue ?? []).slice(0, 8).map((item) => (
                <div key={item.transaction_id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-label text-text-primary">{item.merchant}</div>
                    <div className="tnum text-caption text-text-muted">{item.date} · {item.priority_reason}</div>
                  </div>
                  <span className="tnum shrink-0 text-label text-text-secondary">{money(item.amount_abs)}</span>
                </div>
              ))}
              {(data?.unclassified_work_queue.length ?? 0) === 0 ? <EmptyState className="py-6" message="미분류 거래가 없습니다" /> : null}
            </div>
          </Card>

          <Card title="거래처 기준선" meta={`${data?.merchant_monthly_baseline.length ?? 0}건`} bodyClassName="p-0">
            <div className="divide-y divide-border-subtle">
              {(data?.merchant_monthly_baseline ?? []).slice(0, 8).map((item) => (
                <div key={`${item.period}-${item.merchant}`} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-label text-text-primary">{item.merchant}</div>
                    <div className="tnum text-caption text-text-muted">{item.period} · {item.effective_category_major}</div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-label text-text-secondary">{money(item.monthly_spend)}</div>
                    <div className="tnum text-micro text-expense">{item.baseline_delta == null ? '신규' : money(item.baseline_delta)}</div>
                  </div>
                </div>
              ))}
              {(data?.merchant_monthly_baseline.length ?? 0) === 0 ? <EmptyState className="py-6" message="기준선 데이터가 없습니다" /> : null}
            </div>
          </Card>
        </div>

        <Card title="Canonical view reference" meta={`${views.length}개 view`} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-label">
              <thead className="bg-bg-inset">
                <tr>{['View', 'Label', 'Columns', 'AI'].map((h) => <th key={h} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {orderedViews.map((view) => (
                  <tr key={view.name}>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-micro text-text-primary">
                      <span className="inline-flex items-center gap-1.5">
                        {ADVISOR_VIEWS.includes(view.name) ? <Database className="h-3.5 w-3.5 text-accent" /> : <Table2 className="h-3.5 w-3.5 text-text-faint" />}
                        {view.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{VIEW_LABELS[view.name] ?? EM_DASH}</td>
                    <td className="px-4 py-2 text-caption text-text-muted"><span className="line-clamp-2">{view.columns.map((c) => c.name).join(', ')}</span></td>
                    <td className="whitespace-nowrap px-4 py-2 text-text-muted">{view.recommended_for_ai ? '권장' : '일반'}</td>
                  </tr>
                ))}
                {orderedViews.length === 0 ? (
                  <tr><td colSpan={4}><EmptyState className="py-6" message="스키마 view 정보가 없습니다" /></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Import parity 검증" meta="검증 증거 전용">
          <p className="text-caption leading-relaxed text-text-muted">
            업로드 시 <code className="font-mono">2.현금흐름현황</code> 벤치마크는 검증 증거로만 읽고 저장하지 않습니다.
            불일치는 경고로 기록되며 업로드 성공을 막지 않습니다. 경고 노출 UI는 백엔드 표면 확정 후 추가됩니다.
          </p>
        </Card>
      </div>
    </>
  )
}
