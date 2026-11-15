import { useState, type ComponentType } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, CircleAlert, CircleHelp, CircleMinus, Link2Off } from 'lucide-react'
import { Badge, type BadgeVariant } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { Select, Toggle } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { formatNetWon, formatWon } from '../../ds/format'
import { useCommitments, useDataStatus } from '../../hooks/useMetrics'
import { PageHeader } from '../../shell/PageHeader'
import type { CommitmentItem, CommitmentItemKind, ObservationState } from '../../types/readSurface'
import { DataStatusStrip } from '../analysis/DataStatusStrip'
import { formatDateKo, formatPeriodKo } from '../analysis/periods'
import { loadErrorMessage } from '../analysis/text'
import { TransactionIdRows } from '../transactions/TransactionRows'

/** 관측 상태 — 계획 3.1의 세 상태와 API의 두 상태. "미납"이라는 말은 쓰지 않는다. */
const OBSERVATION_TEXT: Record<ObservationState, string> = {
  observed: '관측됨',
  expected_not_observed: '주기상 있어야 하는데 관측 안 됨',
  unlinked_transaction_present: '거래는 있으나 연결 미확인',
  not_expected: '이 달에는 예정 없음',
  not_determinable: '판단할 기록 없음',
}

const OBSERVATION_STYLE: Record<ObservationState, { variant: BadgeVariant; Icon: ComponentType<{ className?: string }> }> = {
  observed: { variant: 'accent', Icon: CheckCircle2 },
  expected_not_observed: { variant: 'warn', Icon: CircleAlert },
  unlinked_transaction_present: { variant: 'warn', Icon: Link2Off },
  not_expected: { variant: 'neutral', Icon: CircleMinus },
  not_determinable: { variant: 'neutral', Icon: CircleHelp },
}

const STATE_ORDER: ObservationState[] = ['observed', 'expected_not_observed', 'unlinked_transaction_present', 'not_expected', 'not_determinable']
const KIND_ORDER: CommitmentItemKind[] = ['loan', 'installment', 'recurring']
const KIND_TEXT: Record<CommitmentItemKind, string> = { loan: '대출', installment: '할부', recurring: '정기 지급' }
type KindFilter = 'all' | CommitmentItemKind
type StateFilter = 'all' | ObservationState

function isKindFilter(value: string | null): value is KindFilter {
  return value === 'all' || value === 'loan' || value === 'installment' || value === 'recurring'
}

function isStateFilter(value: string | null): value is StateFilter {
  return value === 'all' || STATE_ORDER.includes(value as ObservationState)
}

function burdenText(item: CommitmentItem): string {
  if (item.monthly_burden == null) return '기록 없음'
  return formatWon(item.monthly_burden)
}

function burdenBasis(item: CommitmentItem): string {
  switch (item.monthly_burden_basis) {
    case 'recorded_monthly_payment':
      return item.monthly_burden_source === 'manual' ? '대출 월 상환액 (직접 입력한 값)' : '대출 스냅샷의 월 상환액'
    case 'plan_monthly_amount':
      return '할부 계획의 월 금액'
    case 'last_observed_closed_month':
      return item.last_observed_period ? `${formatPeriodKo(item.last_observed_period)}에 관측된 묶음 합계` : '최근 마감월에 관측된 묶음 합계'
    default:
      if (item.cycle === 'yearly' || item.cycle === 'n_times') return '매달 나가는 약정이 아니라 월 부담을 내지 않습니다'
      return '월 금액이 기록되지 않았습니다'
  }
}

function countText(item: CommitmentItem): string {
  if (item.kind === 'installment' && item.total_count != null) {
    return item.remaining_count != null ? `남은 회차 ${item.remaining_count}회 / 전체 ${item.total_count}회` : `전체 ${item.total_count}회`
  }
  if (item.cycle === 'n_times' && item.total_count != null) {
    return item.remaining_count != null ? `남은 횟수 ${item.remaining_count}회 / 전체 ${item.total_count}회` : `전체 ${item.total_count}회`
  }
  return '남은 회차 기록 없음'
}

function endText(item: CommitmentItem): string {
  if (!item.end_date) return '종료 시점 기록 없음'
  const label = item.kind === 'loan' ? '만기' : item.kind === 'installment' ? '마지막 회차 예정일' : '종료일'
  return `${label} ${formatDateKo(item.end_date)}`
}

function adjustabilityText(item: CommitmentItem): string {
  if (item.kind !== 'recurring') return '보호 (대출·할부는 끝날 때까지 고정)'
  if (item.adjustability === 'undecided') return '미정 (묶음 단위 값 없음 — 거래마다 카테고리 기본값이 적용됩니다)'
  return `${item.adjustability_label} (묶음에서 정함)`
}

function editLink(item: CommitmentItem): { to: string; label: string } {
  if (item.kind === 'loan') return { to: '/data/loans', label: '대출 화면에서 열기' }
  if (item.kind === 'installment') return { to: '/data/installments', label: '할부 화면에서 열기' }
  return { to: `/data/nature?tab=recurring${item.source_id != null ? `&edit=${item.source_id}` : ''}`, label: '정기 지급 고치기' }
}

function ObservationBlock({ item }: { item: CommitmentItem }) {
  const [open, setOpen] = useState(false)
  const observation = item.observation
  const style = OBSERVATION_STYLE[observation.state]
  const ids = observation.transaction_ids
  const unlinked = observation.state === 'unlinked_transaction_present'
  return (
    <div className="mt-2 rounded-md border border-border-subtle bg-bg-inset px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
        <span className="text-text-muted">{observation.period ? formatPeriodKo(observation.period) : '이 달'}</span>
        <Badge variant={style.variant}>
          <style.Icon className="h-3 w-3" aria-hidden="true" />
          {OBSERVATION_TEXT[observation.state]}
        </Badge>
        <span className="text-text-muted">{observation.reason_label}</span>
        {observation.observed_transaction_count > 0 ? (
          <span className="tnum text-text-secondary">관측 {formatNetWon(observation.observed_amount)} · {observation.observed_transaction_count}건</span>
        ) : null}
      </div>
      {ids.length > 0 ? (
        <div className="mt-1.5">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 text-caption font-medium text-transfer hover:underline"
          >
            {unlinked ? `연결 미확인 거래 ${ids.length}건 보기` : `연결된 거래 ${ids.length}건 보기`}
            <ArrowRight className={open ? 'h-3 w-3 rotate-90' : 'h-3 w-3'} />
          </button>
          {open ? (
            <div className="mt-1.5 space-y-1.5">
              <TransactionIdRows ids={ids} caption={`${item.name} ${unlinked ? '연결 미확인' : '연결된'} 거래`} />
              {unlinked ? (
                <p className="text-caption text-text-muted">
                  할부로 표시됐지만 할부 계획에 연결되지 않은 거래입니다. 맞으면{' '}
                  <Link to="/data/installments?linked=unlinked" className="text-transfer hover:underline">할부 화면에서 연결</Link>
                  하세요. 연결은 사람이 확인한 뒤에만 합니다.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {observation.state === 'expected_not_observed' ? (
        <p className="mt-1.5 text-caption text-text-muted">
          연결된 거래가 기록에 없다는 뜻입니다. 지급하지 않았다는 뜻은 아닙니다. 해당 거래가 있으면 {item.kind === 'recurring' ? '묶음의 거래처·카테고리·기간을' : '연결을'} 확인하세요.
        </p>
      ) : null}
    </div>
  )
}

function CommitmentCard({ item }: { item: CommitmentItem }) {
  const link = editLink(item)
  return (
    <li className="rounded-md border border-border bg-bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral">{KIND_TEXT[item.kind]}</Badge>
            {item.lifecycle !== 'active' ? <Badge variant="neutral">{item.lifecycle === 'ended' ? '끝남' : '상태 확인 불가'}</Badge> : null}
            <h3 className="break-words text-label font-semibold text-text-primary">{item.name}</h3>
          </div>
        </div>
        <Link to={link.to} className="inline-flex shrink-0 items-center gap-0.5 text-caption font-medium text-transfer hover:underline">
          {link.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-caption sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-text-muted">월 부담</dt>
          <dd className="text-text-primary">
            <span className="tnum font-semibold">{burdenText(item)}</span>
            <span className="text-text-muted"> · {burdenBasis(item)}</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-muted">주기</dt>
          <dd className="text-text-primary">{item.cycle ? item.cycle_label : '주기 기록 없음'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-muted">남은 회차와 종료 시점</dt>
          <dd className="tnum text-text-primary">{countText(item)} · {endText(item)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-muted">조정 가능성</dt>
          <dd className="text-text-primary">{adjustabilityText(item)}</dd>
        </div>
      </dl>
      <ObservationBlock item={item} />
    </li>
  )
}

function sortItems(items: CommitmentItem[]): CommitmentItem[] {
  return [...items].sort((a, b) => {
    const active = Number(b.lifecycle === 'active') - Number(a.lifecycle === 'active')
    if (active !== 0) return active
    const kind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
    if (kind !== 0) return kind
    return (b.monthly_burden ?? 0) - (a.monthly_burden ?? 0)
  })
}

/** 약정 현황 (Implentation-plan.md 3.1, Q4) — 기록된 약정의 속성과 한 달의 관측 여부. 전망이 아니다. */
export function CommitmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = useDataStatus()
  const closed = status.data?.closed_periods ?? []
  const inProgress = status.data?.in_progress_period ?? null
  const choices = [...(inProgress ? [inProgress] : []), ...[...closed].reverse()]
  const requested = searchParams.get('period')
  const period = requested && choices.includes(requested) ? requested : null
  const commitments = useCommitments(period)
  const kindParam = searchParams.get('kind')
  const stateParam = searchParams.get('state')
  const kind: KindFilter = isKindFilter(kindParam) ? kindParam : 'all'
  const stateFilter: StateFilter = isStateFilter(stateParam) ? stateParam : 'all'
  const showEnded = searchParams.get('ended') === '1'

  function setParam(key: string, value: string | null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value === null) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }

  const data = commitments.data?.data
  const shownPeriod = data?.period ?? period
  const items = data?.items ?? []
  const endedCount = items.filter((item) => item.lifecycle !== 'active').length
  const visible = sortItems(items).filter(
    (item) =>
      (showEnded || item.lifecycle === 'active') &&
      (kind === 'all' || item.kind === kind) &&
      (stateFilter === 'all' || item.observation.state === stateFilter),
  )
  const counts = STATE_ORDER.map((state) => ({
    state,
    count: items.filter((item) => (showEnded || item.lifecycle === 'active') && (kind === 'all' || item.kind === kind) && item.observation.state === state).length,
  }))

  const picker = choices.length > 0 ? (
    <label className="flex items-center gap-2 text-caption text-text-muted">
      관측을 볼 달
      <Select aria-label="관측을 볼 달" value={shownPeriod ?? ''} onChange={(event) => setParam('period', event.target.value)}>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {formatPeriodKo(choice)}{choice === inProgress ? ' (진행월 · 부분 기록)' : ''}
          </option>
        ))}
      </Select>
    </label>
  ) : null

  return (
    <>
      <PageHeader title="약정 현황" controls={picker} />
      <DataStatusStrip />

      {commitments.isLoading ? (
        <Card title="약정 목록"><ListSkeleton rows={6} /></Card>
      ) : commitments.error || !data ? (
        <Card title="약정 목록">
          <ErrorState message={loadErrorMessage(commitments.error)} onRetry={() => void commitments.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card title="약정 목록">
          <EmptyState
            message="기록된 약정이 없습니다. 대출과 할부는 가져온 자료와 할부 화면에서, 정기 지급은 작업대에서 직접 등록합니다."
            actionLabel="정기 지급 등록하러 가기"
            actionTo="/data/nature?tab=recurring"
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="note" className="rounded-md border border-border bg-bg-surface px-3 py-2 text-caption text-text-secondary">
            기록된 약정의 속성입니다. 앞으로의 지급을 내다보지 않습니다. "관측 안 됨"은 연결된 거래가 기록에 없다는 뜻이고, 지급하지 않았다는 뜻이 아닙니다.
            {data.period_month_status === 'in_progress' ? ' 진행월은 아직 다 오지 않은 달이라 "관측 안 됨"을 판단하지 않습니다.' : ''}
          </p>

          <section aria-label="약정 합계" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-bg-surface px-4 py-3">
              <div className="text-caption text-text-muted">{shownPeriod ? `${formatPeriodKo(shownPeriod)} 관측된 약정 지급` : '관측된 약정 지급'}</div>
              <div className="tnum mt-1 text-kpi text-text-primary">{formatNetWon(data.totals.observed_committed_total ?? 0)}</div>
              <div className="mt-1 text-caption text-text-muted">월 결산 흐름표의 "약정 지급"과 같은 거래의 합계</div>
            </div>
            <div className="rounded-md border border-border bg-bg-surface px-4 py-3">
              <div className="text-caption text-text-muted">기록된 월 부담 합계 (진행 중 약정)</div>
              <div className="tnum mt-1 text-kpi text-text-primary">{formatWon(data.totals.monthly_burden_recorded ?? 0)}</div>
              <div className="mt-1 text-caption text-text-muted">대출 월 상환액·할부 월 금액·매월 묶음의 최근 관측 합계. 월 금액이 기록되지 않은 약정은 빠집니다.</div>
            </div>
          </section>

          {commitments.data && commitments.data.status !== 'ok' && commitments.data.status_reasons.length > 0 ? (
            <div className="rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-caption text-warn">
              <ul className="list-inside list-disc">
                {commitments.data.status_reasons.map((reason) => (
                  <li key={reason.code}>{reason.label}{reason.detail ? ` — ${reason.detail}` : ''}</li>
                ))}
              </ul>
              {commitments.data.status_reasons.some((reason) => reason.code === 'commitment_attributes_missing') ? (
                <Link to="/data/nature?tab=recurring" className="mt-1 inline-flex items-center gap-0.5 font-medium hover:underline">
                  정기 지급의 주기·조정 가능성 정하러 가기
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          ) : null}

          <Card
            title="약정 목록"
            meta={`${visible.length}개 표시 · 대출 ${items.filter((item) => item.kind === 'loan').length} · 할부 ${items.filter((item) => item.kind === 'installment').length} · 정기 지급 ${items.filter((item) => item.kind === 'recurring').length}`}
          >
            <div className="mb-3 flex flex-col gap-2">
              <div role="group" aria-label="종류로 거르기" className="flex flex-wrap gap-1.5">
                {(['all', ...KIND_ORDER] as KindFilter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={kind === value}
                    onClick={() => setParam('kind', value === 'all' ? null : value)}
                    className={kind === value ? 'rounded-md border border-accent-border bg-accent-bg px-2.5 py-1 text-caption font-medium text-accent' : 'rounded-md border border-border px-2.5 py-1 text-caption text-text-secondary hover:border-border-strong'}
                  >
                    {value === 'all' ? '모든 종류' : KIND_TEXT[value]}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="관측 상태로 거르기" className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={stateFilter === 'all'}
                  onClick={() => setParam('state', null)}
                  className={stateFilter === 'all' ? 'rounded-md border border-accent-border bg-accent-bg px-2.5 py-1 text-caption font-medium text-accent' : 'rounded-md border border-border px-2.5 py-1 text-caption text-text-secondary hover:border-border-strong'}
                >
                  모든 상태
                </button>
                {counts.map(({ state, count }) => {
                  const style = OBSERVATION_STYLE[state]
                  return (
                    <button
                      key={state}
                      type="button"
                      aria-pressed={stateFilter === state}
                      onClick={() => setParam('state', stateFilter === state ? null : state)}
                      className={stateFilter === state ? 'inline-flex items-center gap-1 rounded-md border border-accent-border bg-accent-bg px-2.5 py-1 text-caption font-medium text-accent' : 'inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-caption text-text-secondary hover:border-border-strong'}
                    >
                      <style.Icon className="h-3 w-3" aria-hidden="true" />
                      {OBSERVATION_TEXT[state]} <span className="tnum">{count}</span>
                    </button>
                  )
                })}
              </div>
              {endedCount > 0 ? (
                <Toggle label={`끝난 약정도 보기 (${endedCount})`} checked={showEnded} onChange={(value) => setParam('ended', value ? '1' : null)} />
              ) : null}
            </div>
            {visible.length === 0 ? (
              <EmptyState message="조건에 맞는 약정이 없습니다." />
            ) : (
              <ul aria-label="약정" className="flex flex-col gap-2.5">
                {visible.map((item) => <CommitmentCard key={item.commitment_key} item={item} />)}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
