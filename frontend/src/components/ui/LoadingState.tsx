import { cn } from '../../lib/utils'

interface LoadingStateProps {
  className?: string
}

export function LoadingState({ className }: LoadingStateProps) {
  return (
    <div className={cn('flex items-center justify-center py-10', className)}>
      <div className="w-5 h-5 border-2 border-border-strong border-t-accent rounded-full animate-spin" />
    </div>
  )
}
