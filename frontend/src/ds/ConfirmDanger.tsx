import { useState, type ReactNode } from 'react'
import { Button } from './Button'

interface ConfirmDangerProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  /** 사용자가 그대로 입력해야 실행되는 확인 문구 */
  confirmPhrase: string
  confirmLabel: string
  pending?: boolean
  onConfirm: () => void
}

/** 파괴적 작업 — 확인 문구 타이핑 후 실행 (04-design-system.md §4.3) */
export function ConfirmDanger({
  open,
  onClose,
  title,
  description,
  confirmPhrase,
  confirmLabel,
  pending,
  onConfirm,
}: ConfirmDangerProps) {
  const [value, setValue] = useState('')
  if (!open) return null
  const matched = value.trim() === confirmPhrase

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="닫기" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="alertdialog" aria-label={title} className="relative w-full max-w-md rounded-lg border border-expense-border bg-bg-surface p-5 shadow-raised">
        <h2 className="text-section text-expense">{title}</h2>
        {description ? <div className="mt-2 text-caption text-text-muted">{description}</div> : null}
        <div className="mt-3 text-caption text-text-secondary">
          확인을 위해 <code className="rounded-sm bg-bg-inset px-1.5 py-0.5 font-mono text-text-primary">{confirmPhrase}</code> 를 입력하세요
        </div>
        <input
          autoFocus
          className="mt-2 w-full rounded-md border border-border bg-bg-inset px-3 py-2 text-caption text-text-secondary focus-visible:border-expense"
          placeholder="확인 문구 입력"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button variant="danger" disabled={!matched || pending} onClick={onConfirm}>
            {pending ? '처리 중…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
