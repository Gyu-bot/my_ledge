import * as React from 'react';
import { cn } from '../../lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[96px] w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-[color:var(--color-text)] transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
