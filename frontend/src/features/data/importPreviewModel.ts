import type { UploadApplySelection, UploadPreviewChange, UploadPreviewChangeType } from '../../types/upload'

const APPLYABLE_CHANGES = new Set<UploadPreviewChangeType>([
  'new',
  'unchanged',
  'source_fields_changed',
  'time_shifted',
  'missing_from_latest_export',
  'possible_replacement',
])

export function changeKey(change: UploadPreviewChange): string {
  return [
    change.change_type,
    change.source_row_hash ?? 'no-row-hash',
    change.existing_transaction_id ?? 'no-existing-id',
  ].join(':')
}

export function canApplyChange(change: UploadPreviewChange): boolean {
  return APPLYABLE_CHANGES.has(change.change_type) && change.source_row_hash !== null
}

export function selectionFromChange(change: UploadPreviewChange): UploadApplySelection | null {
  if (!canApplyChange(change) || change.source_row_hash === null) return null
  return {
    change_type: change.change_type,
    source_row_hash: change.source_row_hash,
    existing_transaction_id: change.existing_transaction_id,
  }
}
