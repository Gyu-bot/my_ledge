import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { formatSignedWon, formatWon } from '../../ds/format'
import { useProjectionAccuracy } from '../../hooks/useMetrics'
import type { ExpenseProjectionComponent, MonthlyProjection, ProjectionConfidence } from '../../types/canonicalViews'
import type { ProjectionAccuracyBandKey } from '../../types/metrics'
import { formatDateKo, formatPeriodKo } from '../analysis/periods'
import { loadErrorMessage, withoutCodeNames } from '../analysis/text'

const CONFIDENCE_LABELS: Record<ProjectionConfidence, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
  unavailable: '낼 수 없음',
}
const COMPONENT_LABELS: Record<ExpenseProjectionComponent['kind'], string> = {
  loan: '대출 원리금',
  installment: '할부 회차',
  recurring: '정기 지급',
  variable: '그 밖의 지출 (보호·조정 가능·미정)',
}
const INCOME_STATUS_LABELS = {
  expected: '들어올 예정',
  received: '들어옴',
  partial: '일부 들어옴',
  late: '예정일 지남',
  stopped: '중단',
  uncertain: '확인 필요',
} as const
const AS_OF_BASIS_LABELS = {
  transaction_as_of: '거래 기준일',
  requested_date: '요청한 날짜',
  today_no_data: '자료가 없어 오늘 날짜',
} as const
const BAND_LABELS: Record<ProjectionAccuracyBandKey, string> = {
  day_01_10: '1–10일 기준',
  day_11_20: '11–20일 기준',
  day_21_31: '21일 이후 기준',
}

function maybeWon(value: number | null | undefined): string {
  return value == null ? '추정 못 함' : formatWon(value)
}

function AccuracySection() {
  const accuracy = useProjectionAccuracy()
  if (accuracy.isLoading) return <ListSkeleton rows={3} />
  if (accuracy.error || !accuracy.data) {
    return <ErrorState message={`지난 오차: ${loadErrorMessage(accuracy.error)}`} onRetry={() => void accuracy.refetch()} />
  }
  const data = accuracy.data
  if (data.bands.length === 0 || data.evaluated_periods.length === 0) {
    return <p className="text-caption text-text-muted">되짚어 볼 지난 마감월이 아직 없습니다.</p>
  }
  return (
    <div className="space-y-2 text-caption">
      <p className="text-text-muted">
        지난 마감월 {data.evaluated_periods.join(', ')}에 같은 전망을 그 달 {data.as_of_days.join('·')}일 기준으로 다시 내서, 실제 그 달 잔여와 비교한 오차입니다.
        +는 전망이 실제보다 컸다는 뜻, −는 작았다는 뜻입니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left" aria-label="지난 마감월 되짚기 오차">
          <thead className="text-micro text-text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">기준일</th>
              <th className="py-1 pr-2 font-medium">오차 중앙값</th>
              <th className="py-1 pr-2 font-medium">수입 대비</th>
              <th className="py-1 font-medium">비교 횟수</th>
            </tr>
          </thead>
          <tbody className="tnum divide-y divide-border-subtle text-text-secondary">
            {data.bands.map((band) => {
              const current = band.band === data.current_band
              return (
                <tr key={band.band} className={current ? 'bg-bg-selected' : undefined}>
                  <th className="py-1.5 pr-2 font-normal">
                    {BAND_LABELS[band.band]}
                    {current ? <Badge variant="accent" className="ml-1">지금 구간</Badge> : null}
                  </th>
                  <td className="py-1.5 pr-2">{band.net_median_signed_error == null ? '—' : formatSignedWon(band.net_median_signed_error)}</td>
                  <td className="py-1.5 pr-2">{band.net_median_signed_error_pct_of_income == null ? '—' : `${band.net_median_signed_error_pct_of_income > 0 ? '+' : ''}${band.net_median_signed_error_pct_of_income.toFixed(1)}%`}</td>
                  <td className="py-1.5">
                    {band.evaluated_points}회{band.withheld_points > 0 ? ` · 보류 ${band.withheld_points}회` : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <details className="rounded-md border border-border bg-bg-inset p-2.5">
        <summary className="cursor-pointer font-medium text-text-secondary">오차를 잰 방법과 한계</summary>
        <p className="mt-2 text-text-muted">{withoutCodeNames(data.definition)}</p>
        {data.limitations.length > 0 ? (
          <ul className="mt-1 list-inside list-disc text-text-muted">
            {data.limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
      </details>
    </div>
  )
}

interface ForecastCardProps {
  projection: MonthlyProjection | null | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  inProgressPeriod: string | null
}

/**
 * 진행월의 월말 순현금흐름 전망 — 유일한 전망(Implentation-plan.md 2.6).
 * 관측 누적과 다른 카드에 두고, 관측 부분과 남은 기간 가정을 나눠 보인다.
 */
export function ForecastCard({ projection, isLoading, error, onRetry, inProgressPeriod }: ForecastCardProps) {
  const title = (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      월말 순현금흐름 전망
      <Badge variant="estimate">추정</Badge>
    </span>
  )
  if (isLoading) {
    return (
      <Card title={title} className="border-t-2 border-t-estimate">
        <ListSkeleton rows={5} />
      </Card>
    )
  }
  if (error) {
    return (
      <Card title={title} className="border-t-2 border-t-estimate">
        <ErrorState message={loadErrorMessage(error)} onRetry={onRetry} />
      </Card>
    )
  }
  if (!projection || !inProgressPeriod || projection.period !== inProgressPeriod) {
    return (
      <Card title={title} className="border-t-2 border-t-estimate">
        <EmptyState message="지금 진행 중인 달이 없어 월말 전망을 내지 않습니다. 전망은 진행월에만 냅니다." />
      </Card>
    )
  }

  const withheld = projection.projected_month_end_net == null
  const adjustability = projection.remaining_expense_adjustability
  const asOfBasis = projection.as_of_basis ? AS_OF_BASIS_LABELS[projection.as_of_basis] : null

  return (
    <Card
      title={title}
      meta={`${formatPeriodKo(projection.period)} · 지금까지의 관측 + 남은 기간의 가정. 오늘 계좌 잔액이 아닙니다.`}
      className="border-t-2 border-t-estimate"
      action={
        <Link to="/data/settings" className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline">
          수입 예상 설정
          <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="space-y-4 text-caption">
        <section aria-label="전망의 관측 부분">
          <h3 className="text-label font-semibold text-text-primary">① 관측 ({formatDateKo(projection.as_of_date)}까지)</h3>
          <dl className="tnum mt-1.5 space-y-1 text-text-secondary">
            <div className="flex justify-between gap-3"><dt>들어온 수입</dt><dd>+{formatWon(projection.observed_income)}</dd></div>
            <div className="flex justify-between gap-3"><dt>나간 순지출</dt><dd>−{formatWon(projection.observed_net_expense)}</dd></div>
            <div className="flex justify-between gap-3 font-semibold text-text-primary"><dt>관측 순현금흐름</dt><dd>{formatSignedWon(projection.observed_net_cashflow)}</dd></div>
          </dl>
          {asOfBasis ? <p className="mt-1 text-text-muted">기준일은 {asOfBasis}로 정했습니다.</p> : null}
        </section>

        <section aria-label="전망의 남은 기간 가정" className="rounded-md border border-estimate-border bg-estimate-bg p-3">
          <h3 className="text-label font-semibold text-estimate">
            ② 남은 기간의 가정 ({projection.remaining_period_start ? `${formatDateKo(projection.remaining_period_start)}부터 월말까지` : '남은 기간 없음'})
          </h3>
          <dl className="tnum mt-1.5 space-y-1 text-estimate">
            <div className="flex justify-between gap-3"><dt>아직 안 들어온 정기 수입</dt><dd>+{formatWon(projection.expected_remaining_income)}</dd></div>
            {projection.expense_components.map((component) => (
              <div key={component.kind} className="flex justify-between gap-3">
                <dt>남은 {COMPONENT_LABELS[component.kind]}</dt>
                <dd>{component.expected_remaining == null ? '추정 못 함' : `−${formatWon(component.expected_remaining)}`}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 font-semibold"><dt>남은 지출 가정 합계</dt><dd>{projection.expected_remaining_expense == null ? '추정 못 함' : `−${formatWon(projection.expected_remaining_expense)}`}</dd></div>
          </dl>
          {adjustability ? (
            <p className="tnum mt-2 text-text-secondary">
              남은 지출 가정 중 조정 가능성 미정 {adjustability.undecided_share_pct == null ? '—' : `${adjustability.undecided_share_pct.toFixed(1)}%`}
              {' '}(보호 {formatWon(adjustability.protected_amount)} · 조정 가능 {formatWon(adjustability.adjustable_amount)} · 미정 {formatWon(adjustability.undecided_amount)})
            </p>
          ) : null}
          <details className="mt-2">
            <summary className="cursor-pointer font-medium text-text-secondary">가정의 근거 보기</summary>
            <div className="mt-2 space-y-2 text-text-muted">
              <div>
                <p className="font-medium text-text-secondary">정기 수입</p>
                {projection.income_sources.length === 0 ? (
                  <p>들어올 정기 수입으로 잡은 입금처가 없습니다.</p>
                ) : (
                  <ul className="list-inside list-disc">
                    {projection.income_sources.map((source) => (
                      <li key={source.source_key}>
                        {source.merchant} · {INCOME_STATUS_LABELS[source.status]} · 남은 {formatWon(source.remaining_amount)}
                        {source.expected_date ? ` · 예정일 ${source.expected_date}` : ''} · {source.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {projection.expense_components.map((component) => (
                <div key={component.kind}>
                  <p className="font-medium text-text-secondary">{COMPONENT_LABELS[component.kind]} · {maybeWon(component.expected_remaining)}</p>
                  <p>{withoutCodeNames(component.basis)}</p>
                  {component.missing_reasons.length > 0 ? <p className="text-warn">{component.missing_reasons.join(' · ')}</p> : null}
                  {(component.link_unconfirmed_count ?? 0) > 0 ? (
                    <p>연결 미확인 결제 {component.link_unconfirmed_count}건 {formatWon(component.link_unconfirmed_amount ?? 0)}은 이미 나간 것으로 보고 다시 더하지 않았습니다.</p>
                  ) : null}
                  {(component.not_in_expense_commitments ?? []).map((item) => (
                    <p key={item.name}>더하지 않은 대출: {item.name} — {item.reason}</p>
                  ))}
                  {(component.annual_items ?? []).map((item) => (
                    <p key={item.category}>해마다 한두 번 나가는 지출: {item.category} 남은 {formatWon(item.expected_remaining)} ({item.basis})</p>
                  ))}
                </div>
              ))}
              <p>가정에 쓴 달: {projection.included_periods.join(', ') || '없음'}{projection.excluded_periods.length > 0 ? ` · 뺀 달: ${projection.excluded_periods.join(', ')}` : ''}</p>
              {adjustability ? <p>{withoutCodeNames(adjustability.basis)}</p> : null}
            </div>
          </details>
        </section>

        <section aria-label="월말 전망 값">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-label font-semibold text-text-primary">③ 월말 순현금흐름 (① + ②)</h3>
            {withheld ? (
              <Badge variant="warn">전망 보류</Badge>
            ) : (
              <span className="tnum text-kpi text-estimate">{formatSignedWon(projection.projected_month_end_net ?? 0)}</span>
            )}
          </div>
          {withheld ? (
            <p className="mt-1 text-warn">
              남은 지출 일부를 추정하지 못해 월말 값을 내지 않습니다. 추정한 항목만 반영하면 {formatSignedWon(projection.net_after_known_remaining_expense)}이지만, 이것은 월말 전망이 아닙니다.
            </p>
          ) : null}
          <p className="mt-1 text-text-muted">
            신뢰도 표시: {CONFIDENCE_LABELS[projection.confidence]} — 가정이 기록으로 얼마나 뒷받침되는지를 나타내는 표시이며, 판단이나 권고가 아닙니다. 실제 정확도는 아래 지난 오차로 보세요.
          </p>
          {projection.missing_reasons.length > 0 ? (
            <div className="mt-2">
              <p className="font-medium text-warn">{withheld ? '보류 이유' : '전망에서 빠진 것'}</p>
              <ul className="list-inside list-disc text-warn">
                {projection.missing_reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          ) : null}
          {projection.warnings.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-warn">확인할 점 {projection.warnings.length}건</summary>
              <ul className="mt-1 list-inside list-disc text-text-muted">
                {projection.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </details>
          ) : null}
          {projection.limitations.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-text-secondary">전망의 한계</summary>
              <ul className="mt-1 list-inside list-disc text-text-muted">
                {projection.limitations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          ) : null}
        </section>

        <section aria-label="지난 오차">
          <h3 className="text-label font-semibold text-text-primary">지난 마감월로 되짚은 오차</h3>
          <div className="mt-1.5">
            <AccuracySection />
          </div>
        </section>
      </div>
    </Card>
  )
}
