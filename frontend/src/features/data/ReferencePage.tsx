import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, Table2 } from 'lucide-react'
import { Card } from '../../ds/Card'
import { Badge } from '../../ds/Badge'
import { Pagination } from '../../ds/Pagination'
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

const QUEUE_REASON_LABELS = new Map<string, string>([
  ['loan_link_review', '대출 상환 연결 검토'],
  ['missing_cost_kind', '고정·변동 지출 분류 필요'],
  ['missing_fixed_necessity', '고정 지출 필요도 분류 필요'],
  ['missing_spend_necessity', '지출 필요도 분류 필요'],
  ['missing_recurring_kind', '반복 결제 유형 분류 필요'],
  ['review', '분류 정보 검토 필요'],
])

function money(value: number | null | undefined) {
  if (value == null) return EM_DASH
  return value < 0 ? `-${formatWonCompact(value)}` : formatWonCompact(value)
}

export function ReferencePage() {
  const [queuePage, setQueuePage] = useState(1)
  const dashboard = useCanonicalViewsDashboard({ queue_page: queuePage, queue_limit: 10 })
  const schema = useSchemaDocument()

  const data = dashboard.data
  const cashflow = data?.monthly_cashflow ?? []
  const latestCashflow = cashflow[cashflow.length - 1]
  const projection = data?.month_projection
  const coverage = data?.data_coverage
  const views = (schema.data?.views ?? [])
  const orderedViews = [
    ...ADVISOR_VIEWS.map((name) => views.find((view) => view.name === name)).filter((view): view is NonNullable<typeof view> => view != null),
    ...views.filter((view) => !ADVISOR_VIEWS.includes(view.name)),
  ]

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
        <Card title="관측 실적 · 외부 에이전트와 같은 canonical 수치" meta={`${latestCashflow?.period ?? '관측 없음'} · ${latestCashflow?.is_complete_month ? '수집 확인된 마감월' : '부분 수집·진행월'}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="관측 수입" value={money(latestCashflow?.income_total)} sub="실제 수입 거래 합계" />
            <Stat label="관측 순지출" value={money(latestCashflow?.expense_total)} sub={`대출상환 포함 ${money(latestCashflow?.loan_repayment_total)}`} />
            <Stat label="관측 순현금흐름" value={money(latestCashflow?.net_cashflow)} sub="관측 수입 − 관측 순지출" subTone={(latestCashflow?.net_cashflow ?? 0) >= 0 ? 'good' : 'bad'} />
            <Stat label="관측 저축률" value={formatPct(latestCashflow?.savings_rate == null ? null : latestCashflow.savings_rate * 100)} sub={latestCashflow?.savings_rate_basis === 'insufficient_partial_month_income' ? '부분월 수입 부족으로 산출하지 않음' : '같은 기간의 관측 수입·순현금흐름 기준'} />
          </div>
        </Card>

        <Card title="월간 전망 · 관측 실적과 별도" meta={projection ? `${projection.period} · 기준일 ${projection.as_of_date}` : '전망 없음'}>
          {projection ? <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="월 예상 수입" value={money(projection.projected_month_income)} badge={<Badge variant="estimate">예상</Badge>} sub={`관측 ${money(projection.observed_income)} + 남은 예상 ${money(projection.expected_remaining_income)}`} />
              <Stat label="월 예상 순지출" value={projection.projected_month_expense == null ? '산출 불가' : money(projection.projected_month_expense)} sub={`관측 ${money(projection.observed_net_expense)} + 남은 예상 ${projection.expected_remaining_expense == null ? '미확정' : money(projection.expected_remaining_expense)}`} />
              <Stat label="월말 예상 순현금흐름" value={projection.projected_month_end_net == null ? '산출 불가' : money(projection.projected_month_end_net)} badge={<Badge variant={projection.projected_month_end_net == null || projection.confidence === 'low' ? 'warn' : 'estimate'}>{projection.projected_month_end_net == null ? '입력 부족' : projection.confidence === 'low' ? '예상 · 신뢰도 낮음' : '예상'}</Badge>} sub="현재 계좌 잔액과 별개" />
              <Stat label="전망 신뢰도" value={({ high: '높음', medium: '보통', low: '낮음', unavailable: '산출 불가' })[projection.confidence]} sub={`거래 관측 ${projection.observed_through ?? '없음'}`} />
            </div>
            {projection.projected_month_end_net == null ? <p className="tnum mt-3 text-caption text-warn">추정 가능한 항목의 잔여 지출 {money(projection.known_expected_remaining_expense)} · 일부 항목의 추정만 반영한 차액 {money(projection.net_after_known_remaining_expense)} · 월말 전망 아님 (추정하지 못한 지출 미반영)</p> : null}
            <p className="mt-3 text-caption text-text-muted">최신 업로드 {projection.coverage.latest_upload_date ?? '없음'} · 포함 월 {projection.included_periods.join(', ') || '없음'} · 제외 월 {projection.excluded_periods.join(', ') || '없음'} · 누락 월 {projection.coverage.missing_periods.join(', ') || '없음'}</p>
            {projection.missing_reasons.length > 0 ? <p className="mt-2 text-caption text-warn">산출 제한: {projection.missing_reasons.join(' · ')}</p> : null}
            {projection.warnings.length > 0 ? <details className="mt-2 rounded-md border border-border bg-bg-inset p-3 text-caption text-warn">
              <summary className="cursor-pointer font-medium">전망 확인 사항 {projection.warnings.length}건</summary>
              <ul className="mt-2 list-inside list-disc">{projection.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details> : null}
            {projection.limitations.length > 0 ? <p className="mt-2 text-caption text-text-muted">{projection.limitations.join(' · ')}</p> : null}
            <Link to="/" className="mt-2 inline-block text-caption text-transfer hover:underline">홈에서 입금 일정과 반복결제 거래처별 전망 근거 보기</Link>
          </> : <EmptyState message="월간 전망 데이터가 없습니다" />}
        </Card>

        <Card title="월별 현금흐름" meta={`${cashflow.length}개월 · 수집 범위 미확인 월 표시`} bodyClassName="p-0">
          <p className="px-4 py-3 text-caption text-text-muted">월간 전망 근거는 최근 6개월이며, 표의 마감월 여부는 각 월의 관측 범위로 판정합니다. 배지는 진행월과 부분 수집 월을 표시합니다.</p>
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
                        {!item.is_complete_month ? <Badge variant="warn" className="ml-1.5">부분 수집·진행월</Badge> : null}
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
          <Card title="분류 품질 큐" meta={`전체 ${data?.unclassified_work_queue_total ?? 0}건`} action={<Link to="/data/inbox" className="text-caption text-transfer hover:underline">인박스에서 처리</Link>} bodyClassName="p-0">
            <div className="divide-y divide-border-subtle">
              {(data?.unclassified_work_queue ?? []).map((item) => (
                <div key={item.transaction_id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-label text-text-primary">{item.merchant}</div>
                    <div className="tnum text-caption text-text-muted">{item.date} · {QUEUE_REASON_LABELS.get(item.priority_reason) ?? '분류 정보 검토 필요'}</div>
                  </div>
                  <span className="tnum shrink-0 text-label text-text-secondary">{money(item.amount_abs)}</span>
                </div>
              ))}
              {(data?.unclassified_work_queue.length ?? 0) === 0 ? <EmptyState className="py-6" message="이 페이지에 미분류 거래가 없습니다" /> : null}
            </div>
            <Pagination page={data?.unclassified_work_queue_page ?? queuePage} perPage={data?.unclassified_work_queue_per_page ?? 10} total={data?.unclassified_work_queue_total ?? 0} onPageChange={setQueuePage} />
          </Card>

          <Card title="거래처 기준선" meta={`요약 ${data?.merchant_monthly_baseline.length ?? 0} / 전체 ${data?.merchant_monthly_baseline_total ?? 0}건`} bodyClassName="p-0">
            <p className="px-4 py-2 text-caption text-text-muted">API가 반환한 상위 요약입니다. 반복 거래처도 요약 {data?.recurring_merchant_monthly.length ?? 0} / 전체 {data?.recurring_merchant_monthly_total ?? 0}건을 제공합니다.</p>
            <div className="divide-y divide-border-subtle">
              {(data?.merchant_monthly_baseline ?? []).map((item) => (
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
            불일치는 경고로 기록되며 업로드 성공을 막지 않습니다. 검증 결과는 가져오기 화면의 업로드 결과와 원본 파일을 대조해 확인하세요.
          </p>
        </Card>
      </div>
    </>
  )
}
