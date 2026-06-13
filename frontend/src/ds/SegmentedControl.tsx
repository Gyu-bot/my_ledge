import { cn } from '../lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

/** 렌즈 탭·모드 전환용 세그먼트 — 04-design-system.md §4.3 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md border border-border bg-bg-inset p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'shrink-0 rounded-sm px-3 py-1.5 text-caption font-medium transition-colors duration-fast',
              active ? 'bg-bg-surface text-text-primary shadow-raised' : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
