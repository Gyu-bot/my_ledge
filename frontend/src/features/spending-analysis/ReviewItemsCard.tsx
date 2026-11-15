import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { formatNetWon, formatSignedWon } from '../../ds/format'
import { useReviewPurchaseGateCandidate } from '../../hooks/useAnalytics'
import { useReviewItems } from '../../hooks/useMetrics'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { ReviewItem } from '../../types/metrics'
import { loadErrorMessage, withoutCodeNames } from '../analysis/text'

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: '아직 안 봄',
  reviewed: '봤음',
  ignored: '넘김',
  snoozed: '나중에 다시',
  dismissed: '넘김',
}

function ReviewActions({ item }: { item: ReviewItem }) {
  const hasWrite = useWriteAccess()
  const review = useReviewPurchaseGateCandidate()
  const queryClient = useQueryClient()
  if (item.subject !== 'transaction' || item.transaction_id == null || item.review_status !== 'pending') return null
  const transactionId = item.transaction_id
  function mark(status: 'reviewed' | 'ignored' | 'snoozed') {
    review.mutate(
      {
        // 기존 구매 단위 후보의 검토 키 (backend analytics_service._canonical_candidate_key)
        candidateKey: `transaction:${transactionId}`,
        data: { review_status: status, memo: null, ...(status === 'snoozed' ? { cooldown_days: 14 } : {}) },
      },
      { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['read', 'review-items'] }) },
    )
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {([
        ['reviewed', '봤음으로 표시'],
        ['snoozed', '14일 뒤 다시'],
        ['ignored', '넘기기'],
      ] as const).map(([status, label]) => (
        <button
          key={status}
          type="button"
          disabled={!hasWrite || review.isPending}
          onClick={() => mark(status)}
          className="rounded-md border border-border px-2.5 py-1 text-caption text-text-secondary hover:border-border-strong disabled:opacity-40"
        >
          {label}
        </button>
      ))}
      {review.error ? <span className="text-caption text-warn">저장하지 못했습니다.</span> : null}
    </div>
  )
}

function ReviewRow({ item }: { item: ReviewItem }) {
  const isTransaction = item.subject === 'transaction'
  return (
    <li className="rounded-md border border-border bg-bg-inset px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral">{item.subject_label}</Badge>
            <span className="min-w-0 break-words text-label font-semibold text-text-primary">
              {isTransaction ? item.merchant ?? '거래처 없음' : item.category}
            </span>
          </div>
          <p className="tnum mt-0.5 text-caption text-text-muted">
            {isTransaction ? `${item.date ?? ''} · ${item.category}` : `${item.period} · 기준 ${item.baseline_amount == null ? '없음' : formatNetWon(item.baseline_amount)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="tnum text-label font-semibold text-text-primary">{formatNetWon(item.amount)}</p>
          {item.change_amount != null ? <p className="tnum text-caption text-text-secondary">기준 대비 {formatSignedWon(item.change_amount)}</p> : null}
        </div>
      </div>
      <ul className="mt-1.5 space-y-0.5 text-caption text-text-secondary">
        {item.listed_because.map((reason) => (
          <li key={`${reason.source}-${reason.code}`}>
            <span className="font-medium">{reason.code_label}</span>
            {reason.detail ? <span className="text-text-muted"> — {reason.detail}</span> : null}
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-caption">
        {item.review_status ? <span className="text-text-muted">검토: {REVIEW_STATUS_LABELS[item.review_status] ?? item.review_status}</span> : null}
        {isTransaction && item.transaction_id != null ? (
          <Link to={`/data/transactions?transaction_id=${item.transaction_id}`} className="inline-flex items-center gap-0.5 font-medium text-transfer hover:underline">
            거래 화면에서 열기
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      <ReviewActions item={item} />
    </li>
  )
}

/** 사후 검토할 거래 (3.3: 구매 단위 후보 + 카테고리 지출 변화를 한 목록으로). 점수·위험도는 싣지 않는다. */
export function ReviewItemsCard({ period }: { period: string }) {
  const query = useReviewItems(period)
  const data = query.data
  return (
    <Card title="다시 볼 만한 거래" meta="이미 일어난 거래를 돌아보는 목록입니다. 왜 올라왔는지만 보여 주고, 판단은 직접 합니다.">
      {query.isLoading ? (
        <ListSkeleton rows={4} />
      ) : query.error || !data ? (
        <ErrorState message={loadErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : data.data.items.length === 0 ? (
        <EmptyState message={data.status === 'not_imported' || data.status === 'no_transactions' ? data.status_label : '이 달에 다시 볼 만한 거래가 없습니다.'} />
      ) : (
        <div className="space-y-2">
          {data.status !== 'ok' ? (
            <p className="text-caption text-warn">
              {data.status_label}
              {data.status_reasons.length > 0 ? ` — ${data.status_reasons.map((reason) => reason.label).join(', ')}` : ''}
            </p>
          ) : null}
          <ul aria-label="사후 검토 목록" className="space-y-2">
            {data.data.items.map((item) => (
              <ReviewRow key={`${item.subject}-${item.transaction_id ?? item.category}`} item={item} />
            ))}
          </ul>
          {data.data.truncated ? <p className="text-caption text-text-muted">전체 {data.data.total}건 중 일부만 보여 줍니다.</p> : null}
          {data.basis.assumptions.length > 0 ? (
            <details className="text-caption text-text-muted">
              <summary className="cursor-pointer font-medium text-text-secondary">이 목록의 기준</summary>
              <ul className="mt-1 list-inside list-disc">
                {data.basis.assumptions.map((item) => <li key={item}>{withoutCodeNames(item)}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </Card>
  )
}
