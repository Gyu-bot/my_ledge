import { Badge } from '../../ds/Badge'
import { BulkBar } from '../../ds/BulkBar'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Field, Select } from '../../ds/Field'
import { formatSignedWon } from '../../ds/format'
import { Pagination } from '../../ds/Pagination'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState } from '../../ds/States'
import type {
  InstallmentPlanResponse,
  InstallmentTransactionMappingItem,
} from '../../types/transaction'

interface InstallmentMappingsSectionProps {
  readonly bulkPlan: string
  readonly bulkStart: string
  readonly hasWrite: boolean
  readonly inputClassName: string
  readonly isBulkPending: boolean
  readonly isLoading: boolean
  readonly isLinkPending: boolean
  readonly isUnlinkPending: boolean
  readonly items: readonly InstallmentTransactionMappingItem[]
  readonly page: number
  readonly perPage: number
  readonly plans: readonly InstallmentPlanResponse[]
  readonly rowDrafts: Readonly<Record<number, { plan: string; number: string }>>
  readonly selected: ReadonlySet<number>
  readonly total: number
  readonly onBulkPlanChange: (value: string) => void
  readonly onBulkStartChange: (value: string) => void
  readonly onClearBulkSelection: () => void
  readonly onDraftChange: (transactionId: number, draft: { plan: string; number: string }) => void
  readonly onPageChange: (page: number) => void
  readonly onRunBulkLink: () => Promise<void>
  readonly onSaveRow: (
    transactionId: number,
    draft: { plan: string; number: string },
  ) => Promise<void>
  readonly onTogglePageSelection: () => void
  readonly onToggleRowSelection: (transactionId: number) => void
  readonly onUnlinkRow: (transactionId: number) => Promise<void>
}

export function InstallmentMappingsSection({
  bulkPlan,
  bulkStart,
  hasWrite,
  inputClassName,
  isBulkPending,
  isLoading,
  isLinkPending,
  isUnlinkPending,
  items,
  page,
  perPage,
  plans,
  rowDrafts,
  selected,
  total,
  onBulkPlanChange,
  onBulkStartChange,
  onClearBulkSelection,
  onDraftChange,
  onPageChange,
  onRunBulkLink,
  onSaveRow,
  onTogglePageSelection,
  onToggleRowSelection,
  onUnlinkRow,
}: InstallmentMappingsSectionProps) {
  return (
    <>
      <Card title="할부 연결 후보 목록" meta={`${items.length} / ${total}건`} bodyClassName="p-0">
        {isLoading ? (
          <div className="p-4">
            <ListSkeleton rows={6} />
          </div>
        ) : items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-label">
              <thead className="bg-bg-inset">
                <tr>
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="페이지 전체 선택"
                      checked={items.length > 0 && items.every((item) => selected.has(item.transaction_id))}
                      onChange={onTogglePageSelection}
                      className="h-3 w-3 accent-[var(--ds-accent-fg)]"
                    />
                  </th>
                  {['날짜', '거래처', '현재 연결', '빠른 연결', '금액'].map((header) => (
                    <th key={header} className="px-3 py-2 text-left text-micro font-medium text-text-muted">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((item) => {
                  const draft = rowDrafts[item.transaction_id] ?? {
                    plan: item.link ? String(item.link.installment_plan_id) : '',
                    number: item.link ? String(item.link.installment_number) : '1',
                  }

                  return (
                    <tr key={item.transaction_id} className={selected.has(item.transaction_id) ? 'bg-bg-selected' : ''}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          aria-label={`${item.merchant} 선택`}
                          checked={selected.has(item.transaction_id)}
                          onChange={() => onToggleRowSelection(item.transaction_id)}
                          className="h-3 w-3 accent-[var(--ds-accent-fg)]"
                        />
                      </td>
                      <td className="tnum px-3 py-2 align-top text-text-faint">{item.date.slice(5)}</td>
                      <td className="max-w-[140px] px-3 py-2 align-top">
                        <div className="truncate text-text-primary">{item.merchant}</div>
                        <div className="truncate text-micro text-text-faint">{item.payment_method ?? ''}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {item.link ? (
                          <>
                            <Badge variant="transfer">{item.link.installment_plan_display_name}</Badge>
                            <div className="tnum mt-1 text-micro text-text-muted">
                              {item.link.installment_number} / {item.link.total_installments}회차
                            </div>
                          </>
                        ) : (
                          <Badge variant="warn">미연결</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap items-end gap-1.5">
                          <Select
                            className="min-w-32 text-caption"
                            aria-label={`${item.merchant} 연결 계획`}
                            disabled={!hasWrite}
                            value={draft.plan}
                            onChange={(event) =>
                              onDraftChange(item.transaction_id, { ...draft, plan: event.target.value })
                            }
                          >
                            <option value="">— 계획 —</option>
                            {plans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.display_name}
                              </option>
                            ))}
                          </Select>
                          <input
                            type="number"
                            min={1}
                            aria-label={`${item.merchant} 회차`}
                            className={`${inputClassName} w-16`}
                            disabled={!hasWrite}
                            value={draft.number}
                            onChange={(event) =>
                              onDraftChange(item.transaction_id, { ...draft, number: event.target.value })
                            }
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!hasWrite || !draft.plan || isLinkPending}
                            onClick={() => void onSaveRow(item.transaction_id, draft)}
                          >
                            연결
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!hasWrite || item.link == null || isUnlinkPending}
                            onClick={() => void onUnlinkRow(item.transaction_id)}
                          >
                            해제
                          </Button>
                        </div>
                      </td>
                      <td
                        className={`tnum px-3 py-2 align-top text-right font-semibold ${
                          item.amount < 0 ? 'text-expense' : 'text-income'
                        }`}
                      >
                        {formatSignedWon(item.amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination page={page} perPage={perPage} total={total} onPageChange={onPageChange} />
          </div>
        ) : (
          <EmptyState className="py-10" message="조건에 맞는 할부 연결 후보가 없습니다" />
        )}
      </Card>

      <BulkBar count={selected.size} onClear={onClearBulkSelection}>
        <Select
          className="text-caption"
          aria-label="일괄 연결 계획"
          value={bulkPlan}
          onChange={(event) => onBulkPlanChange(event.target.value)}
        >
          <option value="">— 계획 선택 —</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.display_name}
            </option>
          ))}
        </Select>
        <Field label="시작 회차">
          <input
            type="number"
            min={1}
            aria-label="시작 회차"
            className={`${inputClassName} w-20`}
            value={bulkStart}
            onChange={(event) => onBulkStartChange(event.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          disabled={!hasWrite || !bulkPlan || isBulkPending}
          onClick={() => void onRunBulkLink()}
        >
          일괄 연결 (연속 회차)
        </Button>
      </BulkBar>
    </>
  )
}
