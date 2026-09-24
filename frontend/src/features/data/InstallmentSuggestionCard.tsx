import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { formatWon } from '../../ds/format'
import { Pagination } from '../../ds/Pagination'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState } from '../../ds/States'
import type {
  InstallmentSuggestionConflictReason,
  InstallmentSuggestionConfidence,
  InstallmentTransactionSuggestionItem,
} from '../../types/transaction'

const CONFIDENCE_META: Record<
  InstallmentSuggestionConfidence,
  { label: string; variant: 'accent' | 'warn' | 'neutral' }
> = {
  high: { label: '높음', variant: 'accent' },
  medium: { label: '보통', variant: 'warn' },
  low: { label: '낮음', variant: 'neutral' },
}

const CONFLICT_META: Record<InstallmentSuggestionConflictReason, string> = {
  installment_number_already_linked: '이미 연결된 회차',
  ambiguous_plan_match: '여러 계획에 일치해 계획 확인 필요',
  competing_transactions: '같은 회차의 다른 후보 거래 확인 필요',
  inactive_installment_link: '삭제·병합된 원거래의 연결이 남아 있습니다',
}

const REASON_LABELS: Record<string, string> = {
  same_merchant: '거래처 일치', same_amount: '금액 일치', similar_amount: '유사한 금액',
  same_billing_day: '청구일 일치', near_billing_day: '청구일 인접', same_payment_method: '결제수단 일치',
  same_linked_description: '기존 연결의 원본 설명 일치', confirmed_merchant_alias: '기존 연결로 확인한 거래처 별칭', merchant_alias_rule: '거래처 별칭 규칙 일치',
}

function formatBillingDayDelta(delta: number) {
  return delta === 0 ? '청구일 일치' : `${Math.abs(delta)}일 차이`
}

export interface InstallmentSuggestionDraft {
  readonly plan: string
  readonly number: string
}

function getInstallmentSuggestionKey(item: InstallmentTransactionSuggestionItem) {
  return `${item.transaction.transaction_id}:${item.installment_plan_id}`
}

interface InstallmentSuggestionCardProps {
  readonly hasWrite: boolean
  readonly inputClassName: string
  readonly isLoading: boolean
  readonly isSaving: boolean
  readonly isUnlinking: boolean
  readonly onUnlinkInactiveLink: (transactionId: number) => Promise<void>
  readonly items: readonly InstallmentTransactionSuggestionItem[]
  readonly rowDrafts: Readonly<Record<string, InstallmentSuggestionDraft>>
  readonly total: number
  readonly page: number
  readonly perPage: number
  readonly onPageChange: (page: number) => void
  readonly onDraftChange: (
    suggestionKey: string,
    draft: InstallmentSuggestionDraft,
  ) => void
  readonly onSaveRow: (
    transactionId: number,
    suggestionKey: string,
    draft: InstallmentSuggestionDraft,
  ) => Promise<void>
}

export function InstallmentSuggestionCard({
  hasWrite,
  inputClassName,
  isLoading,
  isSaving,
  isUnlinking,
  onUnlinkInactiveLink,
  items,
  rowDrafts,
  total,
  page,
  perPage,
  onPageChange,
  onDraftChange,
  onSaveRow,
}: InstallmentSuggestionCardProps) {
  return (
    <Card title="추천 연결 제안" meta={`${items.length} / ${total}건`} bodyClassName="p-0">
      {isLoading ? (
        <div className="p-4">
          <ListSkeleton rows={4} />
        </div>
      ) : items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-label">
            <thead className="bg-bg-inset">
              <tr>
                {['계획', '거래처', '금액·청구일 차이', '신뢰도·사유', '제안 회차', '충돌 상태', '빠른 연결'].map((header) => (
                  <th key={header} className="px-3 py-2 text-left text-micro font-medium text-text-muted">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {items.map((item) => {
                const suggestionKey = getInstallmentSuggestionKey(item)
                const draft = rowDrafts[suggestionKey] ?? {
                  plan: String(item.installment_plan_id),
                  number: String(item.suggested_installment_number),
                }
                const isConflict = !item.is_usable || item.conflict_reason != null
                const conflictLabel = item.conflict_reason ? CONFLICT_META[item.conflict_reason] : '연결 가능'
                const confidenceMeta = CONFIDENCE_META[item.confidence]

                return (
                  <tr key={suggestionKey} className={isConflict ? 'bg-warn-bg/40' : ''}>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold text-text-primary">{item.installment_plan_display_name}</div>
                      <div className="text-micro text-text-faint">{item.installment_plan_merchant}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold text-text-primary">{item.transaction.merchant}</div>
                      <div className="tnum text-micro text-text-faint">{[item.transaction.date, item.transaction.time, item.transaction.payment_method].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="tnum text-text-secondary">금액 차이 {formatWon(item.amount_delta)}</div>
                      <div className="text-micro text-text-faint">{formatBillingDayDelta(item.billing_day_delta)}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={confidenceMeta.variant}>{confidenceMeta.label}</Badge>
                        {item.reason_labels.map((label) => (
                          <Badge key={`${suggestionKey}-${label}`} variant="neutral">
                            {REASON_LABELS[label] ?? '추가 일치 근거'}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <span className="text-micro text-text-muted">제안 회차</span>
                        <Badge variant="accent">{item.suggested_installment_number}회차</Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant={isConflict ? 'warn' : 'accent'}>
                        {isConflict ? (item.conflict_reason === 'installment_number_already_linked' ? '회차 충돌' : '확인 필요') : '연결 가능'}
                      </Badge>
                      <div className="mt-1 text-micro text-text-faint">{conflictLabel}</div>
                      {item.conflict_reason === 'inactive_installment_link' && item.conflicting_transaction_id != null && (
                        <div className="mt-2 space-y-1">
                          <div className="text-micro text-text-muted">{item.conflicting_transaction_state === 'deleted' ? '삭제된' : item.conflicting_transaction_state === 'merged' ? '병합된' : '비활성'} 원거래 #{item.conflicting_transaction_id}의 연결만 해제합니다. 후보를 연결하려면 해제 후 다시 확인하세요.</div>
                          <Button size="sm" aria-label={`${item.transaction.merchant} 삭제·병합 거래의 연결 해제`} disabled={!hasWrite || isUnlinking || isSaving} onClick={() => void onUnlinkInactiveLink(item.conflicting_transaction_id!)}>삭제·병합 거래의 연결 해제</Button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap items-end gap-1.5">
                        <input
                          type="number"
                          min={1}
                          aria-label={`${item.transaction.merchant} 제안 회차`}
                          className={`${inputClassName} w-16`}
                          disabled={!hasWrite || isConflict}
                          value={draft.number}
                          onChange={(event) =>
                            onDraftChange(suggestionKey, {
                              ...draft,
                              number: event.target.value,
                            })
                          }
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          aria-label={`${item.transaction.merchant} 추천 연결`}
                          disabled={!hasWrite || isConflict || isSaving}
                          onClick={() =>
                            void onSaveRow(item.transaction.transaction_id, suggestionKey, draft)
                          }
                        >
                          연결
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={page} perPage={perPage} total={total} onPageChange={onPageChange} />
        </div>
      ) : (
        <EmptyState className="py-10" message="조건에 맞는 연결 제안이 없습니다" />
      )}
    </Card>
  )
}
