import { CheckSquare, Square } from 'lucide-react'
import { Badge, type BadgeVariant } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { EM_DASH, formatSignedWon } from '../../ds/format'
import { cn } from '../../lib/utils'
import type {
  UploadPreviewChange,
  UploadPreviewChangeType,
  UploadPreviewFieldValue,
  UploadPreviewResponse,
  UploadPreviewSourceRow,
} from '../../types/upload'
import { canApplyChange, changeKey } from './importPreviewModel'

const CHANGE_LABEL: Record<UploadPreviewChangeType, string> = {
  new: '신규',
  unchanged: '동일',
  source_fields_changed: '원천 변경',
  time_shifted: '시각 변경',
  possible_replacement: '대체 후보',
  missing_from_latest_export: '최근 내보내기 누락',
  possible_duplicate: '중복 후보',
  ambiguous: '모호함',
}

const CHANGE_VARIANT: Record<UploadPreviewChangeType, BadgeVariant> = {
  new: 'income',
  unchanged: 'neutral',
  source_fields_changed: 'accent',
  time_shifted: 'transfer',
  possible_replacement: 'warn',
  missing_from_latest_export: 'estimate',
  possible_duplicate: 'warn',
  ambiguous: 'expense',
}

interface ImportPreviewPanelProps {
  preview: UploadPreviewResponse
  selectedKeys: ReadonlySet<string>
  pending: boolean
  hasWrite: boolean
  onToggle: (key: string) => void
  onApply: () => void
}

export function ImportPreviewPanel({
  preview,
  selectedKeys,
  pending,
  hasWrite,
  onToggle,
  onApply,
}: ImportPreviewPanelProps) {
  const allChanges = [...preview.safe_changes, ...preview.review_required_changes]
  const selectedCount = allChanges.filter((change) => selectedKeys.has(changeKey(change))).length
  const applyableCount = allChanges.filter(canApplyChange).length

  return (
    <Card
      title="미리보기 결과"
      meta={`${preview.filename} · 기준일 ${preview.snapshot_date}`}
      action={
        <Button
          variant="primary"
          disabled={!hasWrite || pending || selectedCount === 0}
          onClick={onApply}
        >
          {pending ? '적용 중...' : `선택 ${selectedCount}건 적용`}
        </Button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <SummaryTile label="파싱 거래" value={preview.summary.parsed_transaction_count} />
        <SummaryTile label="안전 변경" value={preview.summary.safe_change_count} />
        <SummaryTile label="검토 필요" value={preview.summary.review_required_count} />
        <SummaryTile label="선택 가능" value={applyableCount} />
      </div>

      <PreviewBucket
        title="안전 적용"
        description="기본 선택됨 · 적용 전 체크를 해제할 수 있습니다"
        changes={preview.safe_changes}
        selectedKeys={selectedKeys}
        onToggle={onToggle}
      />

      <PreviewBucket
        title="검토 필요"
        description="대체/누락 후보는 명시 선택할 수 있고, 중복·모호 항목은 수동 확인만 표시합니다"
        changes={preview.review_required_changes}
        selectedKeys={selectedKeys}
        onToggle={onToggle}
      />
    </Card>
  )
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-bg-inset px-3 py-2">
      <div className="text-micro text-text-muted">{label}</div>
      <div className="tnum mt-0.5 text-section text-text-primary">{value.toLocaleString('ko-KR')}</div>
    </div>
  )
}

function PreviewBucket({
  title,
  description,
  changes,
  selectedKeys,
  onToggle,
}: {
  title: string
  description: string
  changes: readonly UploadPreviewChange[]
  selectedKeys: ReadonlySet<string>
  onToggle: (key: string) => void
}) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-label font-semibold text-text-secondary">{title}</h3>
          <p className="mt-0.5 text-micro text-text-muted">{description}</p>
        </div>
        <Badge variant="neutral">{changes.length.toLocaleString('ko-KR')}건</Badge>
      </div>
      {changes.length === 0 ? (
        <div className="rounded-md border border-border bg-bg-inset px-3 py-4 text-center text-caption text-text-muted">
          표시할 변경이 없습니다
        </div>
      ) : (
        <div className="divide-y divide-border-subtle rounded-md border border-border">
          {changes.map((change) => {
            const key = changeKey(change)
            const applyable = canApplyChange(change)
            return (
              <button
                key={key}
                type="button"
                disabled={!applyable}
                onClick={() => onToggle(key)}
                className={cn(
                  'grid w-full gap-3 px-3 py-3 text-left transition-colors duration-fast sm:grid-cols-[1.25rem_minmax(0,1fr)]',
                  applyable ? 'hover:bg-bg-inset' : 'cursor-default opacity-75',
                )}
              >
                <span className="pt-0.5 text-text-muted" aria-hidden="true">
                  {applyable && selectedKeys.has(key) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={CHANGE_VARIANT[change.change_type]}>{CHANGE_LABEL[change.change_type]}</Badge>
                    <Badge variant={change.review_required ? 'warn' : 'accent'}>
                      {change.review_required ? '검토 필요' : '자동 안전'}
                    </Badge>
                    {!applyable ? <Badge variant="expense">수동 확인</Badge> : null}
                  </span>
                  <span className="mt-2 grid gap-2 lg:grid-cols-2">
                    <SourceSummary label="기존" row={change.existing_source} />
                    <SourceSummary label="가져오기" row={change.incoming_source} />
                  </span>
                  <span className="mt-2 block text-caption text-text-secondary">{change.reason}</span>
                  <FieldChanges changes={change.field_changes} />
                  <span className="mt-1 block text-micro text-text-muted">
                    보존: {change.preservation_summary || preservedFields(change.preserved_user_fields)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function SourceSummary({ label, row }: { label: string; row: UploadPreviewSourceRow | null }) {
  if (row === null) {
    return (
      <span className="rounded-md border border-border bg-bg-inset px-2.5 py-2 text-caption text-text-faint">
        {label}: {EM_DASH}
      </span>
    )
  }

  return (
    <span className="rounded-md border border-border bg-bg-inset px-2.5 py-2">
      <span className="block text-micro text-text-muted">{label}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary">
        <span className="tnum">{row.date}</span>
        <span>{row.description}</span>
        <span className="tnum font-semibold text-text-primary">{formatSignedWon(row.amount)}</span>
        <span className="text-text-muted">{row.payment_method ?? EM_DASH}</span>
      </span>
    </span>
  )
}

function FieldChanges({ changes }: { changes: readonly { field: string; existing_value: UploadPreviewFieldValue; incoming_value: UploadPreviewFieldValue }[] }) {
  if (changes.length === 0) return null

  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {changes.map((change) => (
        <Badge key={change.field} variant="neutral">
          {change.field}: {formatFieldValue(change.existing_value)} -&gt; {formatFieldValue(change.incoming_value)}
        </Badge>
      ))}
    </span>
  )
}

function formatFieldValue(value: UploadPreviewFieldValue): string {
  if (value === null) return EM_DASH
  if (typeof value === 'number') return value.toLocaleString('ko-KR')
  return value
}

function preservedFields(fields: readonly string[]): string {
  return fields.length > 0 ? fields.join(', ') : '사용자 편집값 없음'
}
