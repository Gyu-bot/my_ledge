import type { PropsWithChildren } from 'react';
import { cn } from '../../lib/utils';

export function ContentFrame({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-[1520px] flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
