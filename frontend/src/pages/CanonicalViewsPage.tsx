import { useEffect } from 'react'
import { ArrowRight, Database, Table2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DualBarChart } from '../components/charts/DualBarChart'
import { useChromeContext } from '../components/layout/chromeContext'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { KpiCard } from '../components/ui/KpiCard'
import { LoadingState } from '../components/ui/LoadingState'
import { SectionCard } from '../components/ui/SectionCard'
import { useCanonicalViewsDashboard } from '../hooks/useCanonicalViews'
import { useSchemaDocument } from '../hooks/useSchema'
import { formatKRWCompact, formatPct } from '../lib/utils'
import type {
  CanonicalMerchantMonthlyBaselineItem,
  CanonicalMonthlyCashflowItem,
  CanonicalTrueSpendableMonthlyItem,
  CanonicalViewsDashboardResponse,
} from '../types/canonicalViews'
import type { MonthlyCashflowItem } from '../types/analytics'
import type { SchemaRelation } from '../types/schema'

const ADVISOR_VIEW_NAMES = [
  'vw_monthly_cashflow',
  'vw_loan_repayment_monthly',
  'vw_true_spendable_monthly',
  'vw_merchant_monthly_baseline',
  'vw_unclassified_work_queue',
]

const VIEW_LABELS: Record<string, string> = {
  vw_monthly_cashflow: '월별 현금흐름',
  vw_loan_repayment_monthly: '대출 상환 월별 집계',
  vw_true_spendable_monthly: '실질 가용액',
  vw_merchant_monthly_baseline: '거래처 기준선',
  vw_unclassified_work_queue: '분류 품질 큐',
  vw_fixed_cost_monthly_summary: '고정비 월별 요약',
  vw_transactions_effective: '거래 canonical row',
  vw_category_monthly_spend: '카테고리 월별 지출',
}

const OPERATION_LINKS = [
  { to: '/operations/auto-classification', label: '자동분류' },
  { to: '/operations/loan-mapping', label: '대출 연결' },
  { to: '/operations/recurring-classification', label: '반복 결제 분류' },
]

function viewLabel(viewName: string): string {
  return VIEW_LABELS[viewName] ?? viewName
}

function sortAdvisorViews(views: SchemaRelation[]): SchemaRelation[] {
  return ADVISOR_VIEW_NAMES.map((name) => views.find((view) => view.name === name)).filter(
    (view): view is SchemaRelation => view != null,
  )
}

function latest<T>(items: T[]): T | undefined {
  return items[items.length - 1]
}

function money(value: number | null | undefined): string {
  if (value == null) return '—'
  return value < 0 ? `-₩ ${formatKRWCompact(value)}` : `₩ ${formatKRWCompact(value)}`
}

function cashflowChartItems(items: CanonicalMonthlyCashflowItem[]): MonthlyCashflowItem[] {
  return items.map((item) => ({
    period: item.period,
    income: item.income_total,
    expense: -item.expense_total,
    transfer: item.transfer_activity_total,
    net_cashflow: item.net_cashflow,
    savings_rate: item.savings_rate == null ? null : item.savings_rate * 100,
  }))
}

function isEstimatedSpendable(item: CanonicalTrueSpendableMonthlyItem | undefined): boolean {
  return item?.is_income_estimated === true && item.estimated_income_total != null
}

function displayIncomeTotal(
  cashflow: CanonicalMonthlyCashflowItem | undefined,
  spendable: CanonicalTrueSpendableMonthlyItem | undefined,
): number | null | undefined {
  return isEstimatedSpendable(spendable) ? spendable?.estimated_income_total : cashflow?.income_total
}

function displaySpendableBeforeVariable(item: CanonicalTrueSpendableMonthlyItem | undefined): number | null | undefined {
  if (isEstimatedSpendable(item)) return item?.estimated_spendable_before_variable_spend
  return item?.spendable_before_variable_spend
}

function displaySpendableAfterVariable(item: CanonicalTrueSpendableMonthlyItem | undefined): number | null | undefined {
  if (isEstimatedSpendable(item)) return item?.estimated_remaining_after_variable_spend
  return item?.remaining_after_variable_spend
}

function incomeEstimateSourceLabel(item: CanonicalTrueSpendableMonthlyItem): string {
  if (item.income_estimate_source === 'trailing_6_outlier_adjusted_avg') {
    return `최근 6개월 이상치 제외 평균 수입 기준`
  }
  if (item.income_estimate_source === 'trailing_6_income_median') {
    return '최근 6개월 중앙값 수입 기준'
  }
  if (item.income_estimate_source === 'trailing_6_closed_month_avg') {
    return '최근 6개월 평균 수입 기준'
  }
  return `${item.income_estimate_month_count}개월 수입 기준`
}

function baselineDelta(item: CanonicalMerchantMonthlyBaselineItem): string {
  if (item.baseline_delta == null) return '신규'
  return item.baseline_delta > 0 ? `+${money(item.baseline_delta)}` : money(item.baseline_delta)
}

function hasDashboardRows(data?: CanonicalViewsDashboardResponse): boolean {
  if (data == null) return false
  return [
    data.monthly_cashflow,
    data.true_spendable_monthly,
    data.loan_repayment_monthly,
    data.merchant_monthly_baseline,
    data.unclassified_work_queue,
  ].some((items) => items.length > 0)
}

export function CanonicalViewsPage() {
  const { setMetaBadge } = useChromeContext()
  const schema = useSchemaDocument()
  const dashboard = useCanonicalViewsDashboard()
  const views = schema.data?.views ?? []
  const advisorViews = sortAdvisorViews(views)
  const canonicalData = dashboard.data
  const latestCashflow = latest(canonicalData?.monthly_cashflow ?? [])
  const latestSpendable = latest(canonicalData?.true_spendable_monthly ?? [])

  useEffect(() => {
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {canonicalData?.monthly_cashflow.length ?? 0}개월 canonical data
      </span>,
    )
    return () => setMetaBadge(null)
  }, [canonicalData?.monthly_cashflow.length, setMetaBadge])

  if (schema.isLoading || dashboard.isLoading) return <LoadingState />
  if (schema.isError || dashboard.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void schema.refetch()
          void dashboard.refetch()
        }}
      />
    )
  }
  if (!hasDashboardRows(canonicalData)) return <EmptyState message="표시할 canonical view 데이터가 없습니다" />

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Latest income"
          value={money(displayIncomeTotal(latestCashflow, latestSpendable))}
          sub={
            isEstimatedSpendable(latestSpendable)
              ? `예상 · 실제 ${money(latestSpendable?.observed_income_total)}`
              : latestCashflow?.period ?? '—'
          }
        />
        <KpiCard
          label="Non-loan spend"
          value={money(latestCashflow?.non_loan_expense_total)}
          sub={`대출상환 ${money(latestCashflow?.loan_repayment_total)}`}
          subVariant="down"
        />
        <KpiCard
          label="Net cashflow"
          value={money(latestCashflow?.net_cashflow)}
          sub={`저축률 ${formatPct(latestCashflow?.savings_rate == null ? null : latestCashflow.savings_rate * 100)}`}
          subVariant={(latestCashflow?.net_cashflow ?? 0) >= 0 ? 'up' : 'down'}
        />
        <KpiCard
          label="Spendable after variable"
          value={money(displaySpendableAfterVariable(latestSpendable))}
          sub={
            isEstimatedSpendable(latestSpendable)
              ? `예상 · 관측 ${money(latestSpendable?.remaining_after_variable_spend)}`
              : `변동 전 ${money(latestSpendable?.spendable_before_variable_spend)}`
          }
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
        <SectionCard title="월별 현금흐름" meta={`${canonicalData?.monthly_cashflow.length ?? 0}개월`}>
          <DualBarChart data={cashflowChartItems(canonicalData?.monthly_cashflow ?? [])} height={180} />
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-caption">
              <thead className="border-b border-border-subtle text-micro uppercase text-text-ghost">
                <tr>
                  <th className="px-2 py-2 font-medium">Month</th>
                  <th className="px-2 py-2 font-medium">Income</th>
                  <th className="px-2 py-2 font-medium">Expense</th>
                  <th className="px-2 py-2 font-medium">Loan</th>
                  <th className="px-2 py-2 font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-faint">
                {(canonicalData?.monthly_cashflow ?? []).map((item) => (
                  <tr key={item.period}>
                    <td className="px-2 py-2 font-semibold text-text-primary">{item.period}</td>
                    <td className="px-2 py-2 text-text-secondary">{money(item.income_total)}</td>
                    <td className="px-2 py-2 text-text-secondary">{money(item.expense_total)}</td>
                    <td className="px-2 py-2 text-text-muted">{money(item.loan_repayment_total)}</td>
                    <td className="px-2 py-2 text-text-secondary">{money(item.net_cashflow)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="실질 가용액" meta="vw_true_spendable_monthly">
          <div className="space-y-3">
            {(canonicalData?.true_spendable_monthly ?? []).slice(-4).map((item) => (
              <div key={item.period} className="rounded-card border border-border-subtle bg-surface-section px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-label font-semibold text-text-primary">
                    {item.period}
                    {isEstimatedSpendable(item) && (
                      <span className="rounded-full border border-accent-muted bg-accent-dim px-2 py-0.5 text-micro text-accent">
                        예상
                      </span>
                    )}
                  </span>
                  <span className="text-label font-semibold text-accent">
                    {money(displaySpendableAfterVariable(item))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-micro text-text-muted">
                  <span>대출 {money(item.loan_repayment_total)}</span>
                  <span>고정 {money(item.fixed_commitment_total)}</span>
                  <span>변동 {money(item.variable_total)}</span>
                  <span>변동 전 {money(displaySpendableBeforeVariable(item))}</span>
                </div>
                {isEstimatedSpendable(item) && (
                  <div className="mt-2 border-t border-border-faint pt-2 text-micro text-text-muted">
                    <div className="flex items-center justify-between gap-3">
                      <span>{incomeEstimateSourceLabel(item)}</span>
                      <span>{money(item.estimated_income_total)}</span>
                    </div>
                    {item.excluded_income_periods.length > 0 && (
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span>제외 월</span>
                        <span>{item.excluded_income_periods.join(', ')}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span>관측</span>
                      <span>{money(item.remaining_after_variable_spend)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <SectionCard title="대출 상환" meta={`${canonicalData?.loan_repayment_monthly.length ?? 0}건`} bodyClassName="p-0">
          <div className="divide-y divide-border-faint">
            {(canonicalData?.loan_repayment_monthly ?? []).slice(0, 6).map((item) => (
              <div key={`${item.period}-${item.loan_account_id}-${item.loan_repayment_type}`} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-caption font-semibold text-text-primary">
                      {item.loan_display_name ?? item.loan_product_name ?? `loan-${item.loan_account_id}`}
                    </div>
                    <div className="mt-1 text-micro text-text-muted">
                      {item.period} · {item.loan_repayment_type ?? 'repayment'}
                    </div>
                  </div>
                  <span className="shrink-0 text-caption font-semibold text-text-secondary">
                    {money(item.repayment_total)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="거래처 기준선" meta={`${canonicalData?.merchant_monthly_baseline.length ?? 0}건`} bodyClassName="p-0">
          <div className="divide-y divide-border-faint">
            {(canonicalData?.merchant_monthly_baseline ?? []).map((item) => (
              <div key={`${item.period}-${item.merchant}-${item.effective_category_minor ?? ''}`} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-caption font-semibold text-text-primary">{item.merchant}</div>
                    <div className="mt-1 text-micro text-text-muted">
                      {item.period} · {item.effective_category_major}
                      {item.effective_category_minor ? `/${item.effective_category_minor}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-caption font-semibold text-text-secondary">{money(item.monthly_spend)}</div>
                    <div className="text-micro text-danger">{baselineDelta(item)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="분류 품질 큐" meta={`${canonicalData?.unclassified_work_queue.length ?? 0}건`} bodyClassName="p-0">
          <div className="divide-y divide-border-faint">
            {(canonicalData?.unclassified_work_queue ?? []).map((item) => (
              <div key={item.transaction_id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-caption font-semibold text-text-primary">{item.merchant}</div>
                    <div className="mt-1 text-micro text-text-muted">
                      {item.date} · {item.effective_category_major}
                      {item.effective_category_minor ? `/${item.effective_category_minor}` : ''}
                    </div>
                    <div className="mt-1 text-micro text-accent">{item.priority_reason}</div>
                  </div>
                  <span className="shrink-0 text-caption font-semibold text-text-secondary">
                    {money(item.amount_abs)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="분류 품질 작업 연결" meta="queue follow-up">
        <div className="grid gap-2 md:grid-cols-3">
          {OPERATION_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center justify-between rounded-card border border-border-subtle bg-surface-section px-3 py-2.5 text-caption text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
            >
              <span>{link.label}</span>
              <ArrowRight className="h-4 w-4 text-text-ghost" />
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Canonical view reference" meta={`${views.length}개 view`} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-caption">
            <thead className="border-b border-border-subtle bg-surface-bar text-micro uppercase text-text-ghost">
              <tr>
                <th className="px-4 py-2 font-medium">View</th>
                <th className="px-4 py-2 font-medium">Label</th>
                <th className="px-4 py-2 font-medium">Columns</th>
                <th className="px-4 py-2 font-medium">AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-faint">
              {advisorViews.map((view) => (
                <tr key={view.name}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-micro text-text-primary">
                    <span className="inline-flex items-center gap-1.5">
                      {ADVISOR_VIEW_NAMES.includes(view.name) ? (
                        <Database className="h-3.5 w-3.5 text-accent" />
                      ) : (
                        <Table2 className="h-3.5 w-3.5 text-text-ghost" />
                      )}
                      {view.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{viewLabel(view.name)}</td>
                  <td className="px-4 py-2.5 text-text-muted">
                    <span className="line-clamp-2">{view.columns.map((column) => column.name).join(', ')}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">
                    {view.recommended_for_ai ? '권장' : '일반'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
