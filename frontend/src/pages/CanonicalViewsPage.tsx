import { useEffect } from 'react'
import { ArrowRight, Database, Table2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useChromeContext } from '../components/layout/chromeContext'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { KpiCard } from '../components/ui/KpiCard'
import { LoadingState } from '../components/ui/LoadingState'
import { SectionCard } from '../components/ui/SectionCard'
import { useSchemaDocument } from '../hooks/useSchema'
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

function fieldPreview(view: SchemaRelation): string[] {
  const preferred = [
    'income_total',
    'expense_total',
    'non_loan_expense_total',
    'loan_repayment_total',
    'spendable_before_variable_spend',
    'remaining_after_variable_spend',
    'trailing_3_month_avg',
    'baseline_delta',
    'needs_cost_kind',
    'needs_loan_link_review',
    'priority_score',
  ]
  const fieldNames = view.columns.map((column) => column.name)
  const highlighted = preferred.filter((name) => fieldNames.includes(name))
  return highlighted.length > 0 ? highlighted : fieldNames.slice(0, 4)
}

function sortAdvisorViews(views: SchemaRelation[]): SchemaRelation[] {
  return ADVISOR_VIEW_NAMES.map((name) => views.find((view) => view.name === name)).filter(
    (view): view is SchemaRelation => view != null,
  )
}

export function CanonicalViewsPage() {
  const { setMetaBadge } = useChromeContext()
  const schema = useSchemaDocument()
  const views = schema.data?.views ?? []
  const advisorViews = sortAdvisorViews(views)
  const recommendedViews = views.filter((view) => view.recommended_for_ai)
  const totalColumns = views.reduce((sum, view) => sum + view.columns.length, 0)

  useEffect(() => {
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {advisorViews.length}개 advisor view
      </span>,
    )
    return () => setMetaBadge(null)
  }, [advisorViews.length, setMetaBadge])

  if (schema.isLoading) return <LoadingState />
  if (schema.isError) return <ErrorState onRetry={() => void schema.refetch()} />
  if (views.length === 0) return <EmptyState message="등록된 canonical view가 없습니다" />

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Canonical views" value={String(views.length)} sub={`${recommendedViews.length}개 AI 권장`} />
        <KpiCard label="Advisor views" value={String(advisorViews.length)} sub="P0/P0.5 read model" />
        <KpiCard label="Columns" value={String(totalColumns)} sub="schema registry 기준" />
        <KpiCard label="Operations links" value={String(OPERATION_LINKS.length)} sub="분류 품질 후속 작업" />
      </div>

      <SectionCard
        title="Advisor canonical views"
        meta={`${advisorViews.length}개`}
        description="readonly SQL과 외부 에이전트가 재사용하는 재무 해석 기준입니다."
        bodyClassName="p-0"
      >
        <div className="divide-y divide-border-subtle">
          {advisorViews.map((view) => (
            <div key={view.name} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Database className="h-4 w-4 text-accent" />
                  <span className="text-label font-semibold text-text-secondary">{view.name}</span>
                  <span className="rounded-full border border-border-subtle bg-surface-bar px-2 py-0.5 text-micro text-text-muted">
                    {viewLabel(view.name)}
                  </span>
                </div>
                {view.description != null && (
                  <p className="mt-2 text-caption leading-relaxed text-text-muted">{view.description}</p>
                )}
              </div>
              <div className="flex flex-wrap content-start gap-1.5">
                {fieldPreview(view).map((field) => (
                  <span
                    key={field}
                    className="rounded-md border border-border-subtle bg-surface-section px-2 py-1 text-micro text-text-secondary"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

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

      <SectionCard title="Canonical view columns" meta={`${views.length}개 view`} bodyClassName="p-0">
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
              {views.map((view) => (
                <tr key={view.name}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-micro text-text-primary">
                    <span className="inline-flex items-center gap-1.5">
                      <Table2 className="h-3.5 w-3.5 text-text-ghost" />
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
