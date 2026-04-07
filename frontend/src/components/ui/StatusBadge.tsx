import { cn } from '../../lib/utils'

type Status = 'original' | 'edited' | 'deleted'

const styles: Record<Status, string> = {
  original: 'bg-border-subtle text-text-ghost',
  edited:   'bg-accent-dim text-accent border border-accent-muted',
  deleted:  'bg-danger-dim text-danger border border-danger-muted',
}

const labels: Record<Status, string> = {
  original: '원본',
  edited:   '수정됨',
  deleted:  '삭제됨',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn('inline-block text-[8px] px-1.5 py-0.5 rounded', styles[status])}>
      {labels[status]}
    </span>
  )
}
