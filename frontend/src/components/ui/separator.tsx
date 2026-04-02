import * as React from 'react';
import { cn } from '../../lib/utils';

const Separator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    decorative?: boolean;
    orientation?: 'horizontal' | 'vertical';
  }
>(({ className, decorative = true, orientation = 'horizontal', ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden={decorative}
    role={decorative ? 'none' : 'separator'}
    data-orientation={orientation}
    className={cn(
      'shrink-0 bg-[color:var(--color-border)]',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
));

Separator.displayName = 'Separator';

export { Separator };
