import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { EM_DASH, formatNetWon } from '../../ds/format'
import { useEmergencyFund } from '../../hooks/useNetWorth'
import type { EmergencyFundStatus } from '../../types/netWorth'
import { formatDateKo } from '../analysis/periods'
import { loadErrorMessage, sharePct } from '../analysis/text'
import { baselineText, emergencyFundReasons, hasUndecidedExpenses } from './netWorthText'

const STATUS_LABEL: Record<EmergencyFundStatus, string> = {
  complete: '분류 완료 기준',
  incomplete_classification: '미정 지출 있음',
  no_baseline: '기준 기간 없음',
  no_asset_snapshot: '자산 스냅샷 없음',
}

/** 비상금 개월 수 = 현금성 자산 ÷ 월 보호 지급 (Implentation-plan.md 3.3, /metrics/net-worth/emergency-fund) */
export function EmergencyFundCard() {
  const fund = useEmergencyFund()
  const data = fund.data
  return (
    <Card
      title="비상금 개월 수"
      meta="현금성 자산 ÷ 월 보호 지급. 기록된 값으로 계산한 비율이며, 얼마가 적당한지에 대한 조언이 아닙니다."
      action={
        <Link to="/data/assets" className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline">
          자산 메타 편집
          <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      {fund.isLoading ? (
        <ListSkeleton rows={4} />
      ) : fund.error || !data ? (
        <ErrorState message={loadErrorMessage(fund.error)} onRetry={() => void fund.refetch()} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <div className="tnum text-kpi text-text-primary">
                {data.emergency_fund_months != null ? `${data.emergency_fund_months.toFixed(2)}개월` : '계산 보류'}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={data.status === 'complete' ? 'accent' : 'warn'}>
                  {data.status === 'complete' ? '✓ ' : '! '}
                  {STATUS_LABEL[data.status]}
                </Badge>
              </div>
            </div>
          </div>
          <dl className="grid gap-2 text-caption sm:grid-cols-2">
            <div className="rounded-md border border-border bg-bg-inset p-2.5">
              <dt className="text-micro text-text-muted">현금성 자산 (나누는 수)</dt>
              <dd className="tnum mt-0.5 font-semibold text-text-primary">{data.cash_like_total != null ? formatNetWon(data.cash_like_total) : EM_DASH}</dd>
              <dd className="mt-0.5 text-micro text-text-muted">
                자산 스냅샷 {formatDateKo(data.asset_snapshot_date)} 기준
                {(data.cash_like_name_rule_total ?? 0) > 0 ? ` · 그중 이름으로 판단 ${formatNetWon(data.cash_like_name_rule_total ?? 0)}` : ''}
              </dd>
            </div>
            <div className="rounded-md border border-border bg-bg-inset p-2.5">
              <dt className="text-micro text-text-muted">월 보호 지급 (나누는 값)</dt>
              <dd className="tnum mt-0.5 font-semibold text-text-primary">{data.monthly_protected_outflow != null ? formatNetWon(data.monthly_protected_outflow) : EM_DASH}</dd>
              <dd className="mt-0.5 text-micro text-text-muted">{baselineText(data)}</dd>
            </div>
            <div className="rounded-md border border-border bg-bg-inset p-2.5">
              <dt className="text-micro text-text-muted">조정 가능성 미정 비중 (기준 기간, 금액 기준)</dt>
              <dd className="tnum mt-0.5 font-semibold text-text-primary">{sharePct(data.adjustability_undecided_share)}</dd>
              <dd className="mt-0.5 text-micro text-text-muted">
                미정 지출 월 중앙값 {data.monthly_adjustability_undecided_outflow != null ? formatNetWon(data.monthly_adjustability_undecided_outflow) : EM_DASH}
                {hasUndecidedExpenses(data) ? (
                  <>
                    {' · '}
                    <Link to="/data/inbox" className="text-transfer hover:underline">분류하러 가기</Link>
                  </>
                ) : null}
              </dd>
            </div>
            <div className="rounded-md border border-border bg-bg-inset p-2.5">
              <dt className="text-micro text-text-muted">거래 기준일</dt>
              <dd className="tnum mt-0.5 font-semibold text-text-primary">{formatDateKo(data.contract.as_of.transaction_as_of)}</dd>
              <dd className="mt-0.5 text-micro text-text-muted">월 보호 지급 = 대출·할부를 포함해 조정 가능성이 "보호"인 지출</dd>
            </div>
          </dl>
          {(() => {
            const reasons = emergencyFundReasons(data, data.contract.as_of.transaction_as_of)
            return reasons.length > 0 ? (
              <ul aria-label="비상금 개월 수의 근거와 한계" className="list-inside list-disc space-y-0.5 text-caption text-text-secondary">
                {reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            ) : null
          })()}
        </div>
      )}
    </Card>
  )
}
