import type { PropsWithChildren } from 'react';
import { cn } from '../../lib/utils';

export function ContentFrame({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-[1520px] flex-1 flex-col px-4 py-3 sm:px-5 sm:py-4 lg:px-7 lg:py-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
