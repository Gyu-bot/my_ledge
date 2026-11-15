import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { formatNetWon } from '../../ds/format'
import { useReadDataStatus } from '../../hooks/useMetrics'
import { useUploadLogs } from '../../hooks/useUpload'
import { PageHeader } from '../../shell/PageHeader'
import type { ReadDataStatusResponse } from '../../types/readSurface'
import { formatDateKo, formatPeriodKo } from '../analysis/periods'
import { loadErrorMessage, sharePct } from '../analysis/text'
import { uploadStatus } from './uploadLabels'

const SNAPSHOT_TEXT: Record<string, string> = {
  assets: '자산',
  loans: '대출',
  investments: '투자',
  insurance: '보험',
  profile: '프로필',
}

function reasonPeriods(periods: string[]): string {
  if (periods.length === 0) return ''
  if (periods.length <= 3) return ` (${periods.map(formatPeriodKo).join(', ')})`
  return ` (${formatPeriodKo(periods[0])} 등 ${periods.length}개월 — 아래 달별 상태 참고)`
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="tnum text-label font-semibold text-text-primary">{value}</dd>
      {sub ? <dd className="text-micro text-text-muted">{sub}</dd> : null}
    </div>
  )
}

function snapshotGap(days: number | null): string {
  if (days == null) return '거래 기준일과 비교할 수 없음'
  if (days === 0) return '거래 기준일과 같은 날'
  return days > 0 ? `거래 기준일보다 ${days}일 앞` : `거래 기준일보다 ${-days}일 뒤`
}

function Coverage({ data }: { data: ReadDataStatusResponse['data'] }) {
  const coverage = data.transaction_coverage
  return (
    <Card title="거래 자료" meta="가져온 거래가 덮는 범위입니다. 값은 모두 거래 기준일까지의 기록입니다.">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="첫 거래일" value={formatDateKo(coverage.first_transaction_date ?? null)} />
        <Stat label="거래 기준일" value={formatDateKo(coverage.transaction_as_of ?? null)} sub="반영된 거래가 덮는 마지막 날" />
        <Stat label="가져온 달" value={`${coverage.imported_period_count ?? 0}개월`} sub={coverage.first_period && coverage.last_period ? `${formatPeriodKo(coverage.first_period)} ~ ${formatPeriodKo(coverage.last_period)}` : undefined} />
        <Stat
          label="마감월 / 진행월"
          value={`${data.closed_periods.length}개월 마감`}
          sub={data.in_progress_period ? `${formatPeriodKo(data.in_progress_period)}은 진행월(부분 기록)` : '진행월 없음'}
        />
      </dl>
    </Card>
  )
}

function Snapshots({ data }: { data: ReadDataStatusResponse['data'] }) {
  return (
    <Card title="스냅샷 기준일 (종류별)" meta="잔액을 찍은 날입니다. 종류마다 따로 보며 하나로 합치지 않습니다.">
      <ul className="divide-y divide-border-subtle">
        {data.snapshots.map((snapshot) => (
          <li key={snapshot.kind} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-caption">
            <span className="font-medium text-text-primary">{SNAPSHOT_TEXT[snapshot.kind] ?? snapshot.kind_label}</span>
            <span className="tnum text-text-secondary">
              {snapshot.as_of ? formatDateKo(snapshot.as_of) : '가져온 스냅샷 없음'}
              {snapshot.as_of ? <span className="text-text-muted"> · {snapshotGap(snapshot.days_before_transaction_as_of)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Classification({ data }: { data: ReadDataStatusResponse['data'] }) {
  const c = data.classification
  const rows: Array<{ label: string; value: string; to?: string; action?: string; warn: boolean }> = [
    {
      label: '조정 가능성이 미정인 지출',
      value: `${formatNetWon(c.adjustability_undecided_total)} · ${c.adjustability_undecided_transaction_count}건 · 총지급의 ${sharePct(c.adjustability_undecided_share)}`,
      to: '/data/inbox',
      action: '분류 큐로',
      warn: c.adjustability_undecided_total !== 0,
    },
    {
      label: '대분류가 비었거나 "미분류"인 지출',
      value: `${formatNetWon(c.uncategorized_expense_total)} · ${c.uncategorized_expense_transaction_count}건`,
      to: '/data/transactions',
      action: '거래 화면으로',
      warn: c.uncategorized_expense_transaction_count > 0,
    },
    {
      label: '할부로 표시됐지만 할부 계획에 연결되지 않은 지출',
      value: `${c.installment_link_unconfirmed_transaction_count}건`,
      to: '/data/installments?linked=unlinked',
      action: '할부 화면으로',
      warn: c.installment_link_unconfirmed_transaction_count > 0,
    },
    {
      label: '주기가 기록되지 않은 정기 지급',
      value: `${c.commitments_without_cycle}개`,
      to: '/data/nature?tab=recurring',
      action: '정기 지급으로',
      warn: c.commitments_without_cycle > 0,
    },
    {
      label: '조정 가능성이 정해지지 않은 정기 지급',
      value: `${c.commitments_without_adjustability}개`,
      to: '/data/nature?tab=recurring',
      action: '정기 지급으로',
      warn: c.commitments_without_adjustability > 0,
    },
  ]
  return (
    <Card title="분류 상태" meta="분류가 덜 된 만큼 분석 값이 불완전합니다. 숨기지 않고 따로 셉니다.">
      <ul className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <li key={row.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-caption">
            <span className="min-w-0 flex-1 basis-48 text-text-secondary">
              {row.warn ? <Badge variant="warn" className="mr-1.5">남음</Badge> : <Badge variant="accent" className="mr-1.5">없음</Badge>}
              {row.label}
            </span>
            <span className="tnum text-text-primary">{row.value}</span>
            {row.warn && row.to ? (
              <Link to={row.to} className="inline-flex items-center gap-0.5 font-medium text-transfer hover:underline">
                {row.action}
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Periods({ data }: { data: ReadDataStatusResponse['data'] }) {
  const periods = [...data.periods].reverse()
  return (
    <Card title="달별 상태" meta="가져온 달마다 거래 건수와 미정 비중입니다. 자료가 없는 달과 0원인 달을 구분합니다." bodyClassName="p-0">
      {data.coverage_gaps.length > 0 ? (
        <p className="mx-4 mt-3 rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-caption text-warn">
          가져온 기간 안에서 거래가 0건인 달: {data.coverage_gaps.map((gap) => formatPeriodKo(gap.period)).join(', ')}. 내보내기 파일에 빠졌는지 확인하세요.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-caption">
          <caption className="sr-only">달별 자료 상태</caption>
          <thead className="bg-bg-inset">
            <tr>
              {['달', '상태', '거래', '총지급', '미정 비중'].map((header) => (
                <th key={header} scope="col" className="px-4 py-2 text-left text-micro font-medium text-text-muted">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {periods.map((period) => (
              <tr key={period.period}>
                <th scope="row" className="px-4 py-1.5 text-left font-medium text-text-primary">{formatPeriodKo(period.period)}</th>
                <td className="px-4 py-1.5">
                  {period.transaction_count === 0 ? (
                    <Badge variant="warn">거래 0건</Badge>
                  ) : period.month_status === 'in_progress' ? (
                    <Badge variant="warn">진행월 · 부분 기록</Badge>
                  ) : (
                    <Badge variant="neutral">마감월</Badge>
                  )}
                </td>
                <td className="tnum px-4 py-1.5 text-text-secondary">{period.transaction_count}건</td>
                <td className="tnum px-4 py-1.5 text-text-secondary">{formatNetWon(period.total_outflow)}</td>
                <td className="tnum px-4 py-1.5 text-text-secondary">{sharePct(period.adjustability_undecided_share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Uploads() {
  const logs = useUploadLogs(10)
  return (
    <Card
      title="최근 가져오기"
      meta="어떤 파일을 언제 가져왔는지입니다."
      action={<Link to="/data/import" className="text-caption font-medium text-transfer hover:underline">가져오기 화면</Link>}
    >
      {logs.isLoading ? <ListSkeleton rows={3} /> : logs.error ? (
        <ErrorState message={loadErrorMessage(logs.error)} onRetry={() => void logs.refetch()} />
      ) : (logs.data?.items.length ?? 0) === 0 ? (
        <EmptyState message="가져온 기록이 없습니다." actionLabel="가져오기로 가기" actionTo="/data/import" />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {logs.data?.items.map((log) => {
            const status = uploadStatus(log.status)
            return (
              <li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-caption">
                <span className="min-w-0 flex-1 basis-40 truncate text-text-primary">{log.filename ?? '이름 없는 파일'}</span>
                <Badge variant={status.variant}>{status.label}</Badge>
                <span className="tnum text-text-muted">새 거래 {log.tx_new ?? 0}건 · 스냅샷 {log.snapshot_date ?? '—'} · {log.uploaded_at.slice(0, 16).replace('T', ' ')}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** 작업대 · 자료 현황 (Q6) — 무엇을 가져왔고, 언제까지의 자료이며, 어디가 비었고, 분류는 얼마나 되었나. */
export function DataStatusPage() {
  const status = useReadDataStatus()
  const data = status.data?.data

  return (
    <>
      <PageHeader title="작업대 · 자료 현황" />
      {status.isLoading ? (
        <Card title="자료 현황"><ListSkeleton rows={6} /></Card>
      ) : status.error || !data || !status.data ? (
        <Card title="자료 현황"><ErrorState message={loadErrorMessage(status.error)} onRetry={() => void status.refetch()} /></Card>
      ) : !data.transaction_coverage.transaction_as_of ? (
        <div className="flex flex-col gap-4">
          <Card title="자료 현황">
            <EmptyState message="아직 가져온 거래가 없습니다. BankSalad 내보내기 파일을 올리면 채워집니다." actionLabel="가져오기로 가기" actionTo="/data/import" />
          </Card>
          <Uploads />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {status.data.status !== 'ok' ? (
            <div role="note" className="rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-caption text-warn">
              <p className="font-medium">{status.data.status_label}</p>
              <ul className="mt-0.5 list-inside list-disc">
                {status.data.status_reasons.map((reason) => (
                  <li key={reason.code}>{reason.label}{reasonPeriods(reason.periods)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Coverage data={data} />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            <Snapshots data={data} />
            <Uploads />
          </div>
          <Classification data={data} />
          {data.non_krw_transaction_count > 0 ? (
            <p className="rounded-md border border-border bg-bg-surface px-3 py-2 text-caption text-text-secondary">
              원화가 아닌 거래 {data.non_krw_transaction_count}건은 모든 합계에서 빠져 있습니다(환율로 바꾸지 않습니다).
            </p>
          ) : null}
          <Periods data={data} />
        </div>
      )}
    </>
  )
}
