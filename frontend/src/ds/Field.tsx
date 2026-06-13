import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

const CONTROL_CLS =
  'rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-caption text-text-secondary transition-colors duration-fast focus-visible:border-accent disabled:opacity-40'

interface FieldProps {
  label?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}

/** 라벨 + 컨트롤 + 힌트 묶음 (세로 정렬) */
export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      {label ? <span className="text-micro text-text-muted">{label}</span> : null}
      {children}
      {hint ? <span className="text-micro text-text-faint">{hint}</span> : null}
    </label>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_CLS, className)} {...rest} />
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode
}

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select className={cn(CONTROL_CLS, className)} {...rest}>
      {children}
    </select>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  disabled?: boolean
  className?: string
}

export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2 text-caption text-text-secondary', disabled && 'opacity-40', className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--ds-accent-fg)]"
      />
      {label}
    </label>
  )
}
