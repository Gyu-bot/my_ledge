import * as PopoverPrimitive from '@radix-ui/react-popover';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  align = 'center',
  className,
  sideOffset = 8,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        className={cn(
          'z-50 w-80 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-4 text-sm text-[color:var(--color-text-muted)] shadow-[0_20px_44px_-20px_rgba(15,23,42,0.32),0_12px_24px_-20px_rgba(15,23,42,0.22)] outline-none',
          className,
        )}
        sideOffset={sideOffset}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export const PopoverClose = PopoverPrimitive.Close;

export function PopoverDismissButton({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Close>) {
  return (
    <PopoverPrimitive.Close
      className={cn(
        'absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[color:var(--color-text-subtle)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text)]',
        className,
      )}
      {...props}
    >
      <X className="h-4 w-4" />
    </PopoverPrimitive.Close>
  );
}
