import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { formatWon } from '../../ds/format'
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
  readonly items: readonly InstallmentTransactionSuggestionItem[]
  readonly rowDrafts: Readonly<Record<string, InstallmentSuggestionDraft>>
  readonly total: number
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
  items,
  rowDrafts,
  total,
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
                      <div className="tnum text-micro text-text-faint">{item.transaction.date}</div>
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
                            {label}
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
                        {isConflict ? '회차 충돌' : '연결 가능'}
                      </Badge>
                      <div className="mt-1 text-micro text-text-faint">{conflictLabel}</div>
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
        </div>
      ) : (
        <EmptyState className="py-10" message="조건에 맞는 연결 제안이 없습니다" />
      )}
    </Card>
  )
}
