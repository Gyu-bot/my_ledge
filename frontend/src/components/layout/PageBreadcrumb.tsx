import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import type { BreadcrumbItem } from '../../app/navigation';

export function PageBreadcrumb({
  items,
  className,
}: {
  className?: string;
  items: BreadcrumbItem[];
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-sm text-[color:var(--color-text-subtle)]', className)}>
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <Fragment key={item.to}>
              <li>
                {isLast ? (
                  <span className="font-medium text-[color:var(--color-text-muted)]">{item.label}</span>
                ) : (
                  <Link className="transition-colors hover:text-[color:var(--color-text)]" to={item.to}>
                    {item.label}
                  </Link>
                )}
              </li>
              {isLast ? null : (
                <li aria-hidden="true" className="text-[color:var(--color-text-subtle)]">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
