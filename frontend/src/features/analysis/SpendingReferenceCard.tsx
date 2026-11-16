import { Link } from 'react-router-dom'
import { Card } from '../../ds/Card'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { formatNetWon } from '../../ds/format'
import { useSpendingReference } from '../../hooks/useSpendingLimits'
import { loadErrorMessage } from './text'

/** T062 — reference amounts stay outside the flow table and actuals. */
export function SpendingReferenceCard({ period }: { period: string }) {
  const query = useSpendingReference(period)
  const data = query.data?.data
  return (
    <Card title="연간성 지출 참고 · 한도 대비" meta="월 환산은 참고값입니다. 총지급이나 한도 대비 실적에 다시 더하지 않습니다.">
      {query.isLoading ? <ListSkeleton rows={4} /> : query.error || !data ? (
        <ErrorState message={loadErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-3 text-caption">
          <p className="text-text-muted">{data.period} 기록 · 총지급 {data.total_outflow == null ? '자료 없음' : formatNetWon(data.total_outflow)}</p>
          <div>
            <h3 className="font-semibold text-text-primary">연간성 지출과 등록 연간 약정의 월 환산</h3>
            <p className="text-micro text-text-muted">{data.window_start_period} ~ {data.window_end_period} · 자료가 완전한 12개월 중 순지출이 양수인 달이 1~2개인 대분류·소분류 쌍과 사람이 등록한 연간 약정입니다. 중복되는 약정 지출은 쌍에서 빼고, 각 순액을 12로 나눠 원 단위로 반올림합니다. 지출 합계에 포함하지 않는 참고값입니다.</p>
            {data.annual_missing_reason_label ? <p className="mt-1 text-text-muted">{data.annual_missing_reason_label}</p> : data.annual_items.length === 0 ? (
              <p className="mt-1 text-text-muted">이 조건에 해당하는 지출이 없습니다.</p>
            ) : (
              <ul aria-label="연간성 지출 월 환산" className="mt-2 space-y-2">
                {data.annual_items.map((item) => <li key={JSON.stringify([item.source, item.category, item.category_minor, item.commitment_id])} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words">{item.category || '대분류 없음'} › {item.category_minor || '소분류 없음'}{item.source === 'registered_yearly_commitment' ? ` · 사람이 등록한 연간 약정 (${item.commitment_label || `#${item.commitment_id}`})` : ' · 관측 패턴'} · {item.active_months_in_window}개월 관측 ({item.observed_periods.join(', ')})</span>
                  <span className="tnum">12개월 {formatNetWon(item.window_amount)} → 월 {formatNetWon(item.monthly_equivalent)} (참고)</span>
                </li>)}
              </ul>
            )}
          </div>
          <div className="border-t border-border-subtle pt-2">
            <h3 className="font-semibold text-text-primary">사람이 정한 월 한도와 실적</h3>
            <p className="text-micro text-text-muted">완전한 마감월에만 비교합니다. 카테고리와 조정 가능성은 겹치는 보기이므로 서로 더하지 않습니다.</p>
            <ul aria-label="월 한도 대비" className="mt-2 space-y-2">
              {data.comparisons.map((item) => <li key={`${item.target_kind}:${item.target_value}`} className="rounded-md border border-border-subtle p-2">
                <p className="font-medium text-text-primary">{item.target_kind === 'category' ? '대분류' : '조정 가능성'} · {item.target_label}</p>
                <p className="tnum text-text-secondary">실적 {item.actual_amount == null ? '자료 없음' : formatNetWon(item.actual_amount)} · 한도 {item.limit_amount == null ? '미설정' : formatNetWon(item.limit_amount)}</p>
                <p className="text-text-muted">{item.missing_reason_label ?? (item.difference_amount === 0 ? '한도와 같음' : `${formatNetWon(Math.abs(item.difference_amount ?? 0))} ${item.difference_amount != null && item.difference_amount > 0 ? '초과' : '한도 미만'}`)}</p>
                {item.effective_from_period ? <p className="text-micro text-text-muted">적용 시작 {item.effective_from_period} · 이력 #{item.limit_revision_id}</p> : null}
              </li>)}
            </ul>
          </div>
          <details className="text-text-muted"><summary className="cursor-pointer">계산 근거와 이력 규칙</summary><p className="mt-1">{query.data?.basis.scope}</p><p>{query.data?.basis.rules.annual_like}</p><p>{query.data?.basis.rules.annual_deduplication}</p><p>{query.data?.basis.rules.limit_history}</p></details>
          <Link to="/data/settings#spending-limits" className="inline-block text-transfer hover:underline">설정에서 한도 입력·변경 이력 보기</Link>
        </div>
      )}
    </Card>
  )
}
