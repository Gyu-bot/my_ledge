import { useEffect, useRef, type RefObject } from 'react';
import { NavLink } from 'react-router-dom';
import { navigationItems, type NavigationGroupItem } from '../../app/navigation';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

function isGroupItem(item: (typeof navigationItems)[number]): item is NavigationGroupItem {
  return 'children' in item;
}

interface MobileSidebarDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
}

export function MobileSidebarDrawer({
  open,
  onOpenChange,
  triggerRef,
}: MobileSidebarDrawerProps) {
  const previousOpenRef = useRef(open);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = '';
      if (previousOpenRef.current) {
        triggerRef.current?.focus();
      }
      previousOpenRef.current = open;
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    previousOpenRef.current = open;

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onOpenChange, open, triggerRef]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        aria-label="배경 클릭으로 닫기"
        className="absolute inset-0 bg-black/40"
        type="button"
        onClick={() => onOpenChange(false)}
      />

      <div
        ref={dialogRef}
        aria-modal="true"
        className="absolute inset-y-0 left-0 w-[min(88vw,22rem)] overflow-y-auto border-r border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-4 shadow-[var(--shadow-soft)] outline-none"
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--color-text-subtle)]">
              my_ledge
            </p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--color-text)]">
              Navigation
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            메뉴 닫기
          </Button>
        </div>

        <nav aria-label="Mobile primary navigation" className="mt-6 space-y-3">
          {navigationItems.map((item) => {
            if (!isGroupItem(item)) {
              return (
                <NavLink
                  key={item.to}
                  end={item.to === '/'}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-[var(--radius-sm)] px-3 py-3 text-sm font-medium transition',
                      isActive
                        ? 'bg-[color:var(--color-primary)] text-[color:var(--color-text-inverse)]'
                        : 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-text)]',
                    )
                  }
                  onClick={() => onOpenChange(false)}
                >
                  {item.label}
                </NavLink>
              );
            }

            return (
              <section key={item.to} className="rounded-[var(--radius)] border border-[color:var(--color-border)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text-subtle)]">
                  {item.label}
                </p>
                <div className="mt-2 space-y-2">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      end
                      to={child.to}
                      className={({ isActive }) =>
                        cn(
                          'block rounded-[var(--radius-sm)] px-3 py-2 text-sm transition',
                          isActive
                            ? 'bg-[color:var(--color-primary-soft)] text-[color:var(--color-primary-strong)]'
                            : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text)]',
                        )
                      }
                      onClick={() => onOpenChange(false)}
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              </section>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
