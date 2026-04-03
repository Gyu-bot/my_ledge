import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { navigationItems, type NavigationGroupItem } from '../../app/navigation';
import { cn } from '../../lib/utils';
import { navigationIconComponents } from '../icons/HeroIcons';
import { useAppShellState } from './AppShellState';

function isGroupItem(item: (typeof navigationItems)[number]): item is NavigationGroupItem {
  return 'children' in item;
}

function NavigationGlyph({
  icon,
  active = false,
}: {
  active?: boolean;
  icon: keyof typeof navigationIconComponents;
}) {
  const Icon = navigationIconComponents[icon];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center',
        active ? 'text-current' : 'text-[color:var(--color-text-muted)]',
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function AppSidebar() {
  const { sidebarExpanded } = useAppShellState();
  const groups = useMemo(
    () => navigationItems.filter(isGroupItem),
    [],
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.label, true])),
  );
  const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!sidebarExpanded) {
      setFlyoutGroup(null);
    }
  }, [sidebarExpanded]);

  const sidebarWidthClass = sidebarExpanded ? 'w-64' : 'w-[72px]';

  function toggleGroup(group: NavigationGroupItem) {
    if (sidebarExpanded) {
      setExpandedGroups((current) => ({
        ...current,
        [group.label]: current[group.label] === false,
      }));
      return;
    }

    setFlyoutGroup((current) => (current === group.label ? null : group.label));
  }

  return (
    <aside
      className={cn(
        'sticky top-4 self-start rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] shadow-[var(--shadow-soft)]',
        sidebarWidthClass,
      )}
    >
      <nav aria-label="Primary navigation" className="flex h-full flex-col gap-3 p-2.5">
        <div className="rounded-[var(--radius)] bg-[color:var(--color-primary-soft)] px-2.5 py-2.5 text-[color:var(--color-primary-strong)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--color-text-subtle)]">
            my_ledge
          </p>
          {sidebarExpanded ? (
            <p className="mt-1 text-sm font-semibold">Workspace</p>
          ) : null}
        </div>

        <div className="space-y-1">
          {navigationItems.map((item) => {
            if (!isGroupItem(item)) {
              return (
                <NavLink
                  key={item.to}
                  end={item.to === '/'}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 items-center rounded-[var(--radius-sm)] px-2.5 text-sm font-medium transition',
                      sidebarExpanded ? 'gap-2.5' : 'justify-center',
                      isActive
                        ? 'bg-[color:var(--color-primary)] text-[color:var(--color-text-inverse)]'
                        : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text)]',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <NavigationGlyph active={isActive} icon={item.icon} />
                      {sidebarExpanded ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              );
            }

            const isExpanded = sidebarExpanded
              ? expandedGroups[item.label] !== false
              : flyoutGroup === item.label;
            const regionId = `sidebar-group-${item.label}`;

            return (
              <div key={item.to} className="relative">
                <button
                  aria-controls={regionId}
                  aria-expanded={isExpanded}
                  aria-label={sidebarExpanded ? item.label : `${item.label} 메뉴 열기`}
                  className={cn(
                    'flex h-10 w-full items-center rounded-[var(--radius-sm)] px-2.5 text-sm font-medium transition',
                    sidebarExpanded ? 'justify-between gap-2.5' : 'justify-center',
                    isExpanded
                      ? 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text)]'
                      : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text)]',
                  )}
                  type="button"
                  onClick={() => toggleGroup(item)}
                >
                  <span className={cn('flex items-center gap-2.5', !sidebarExpanded && 'justify-center')}>
                    <NavigationGlyph active={isExpanded} icon={item.icon} />
                    {sidebarExpanded ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
                  </span>
                  {sidebarExpanded ? (
                    <span aria-hidden="true" className="text-xs text-[color:var(--color-text-muted)]">
                      {isExpanded ? '▾' : '▸'}
                    </span>
                  ) : null}
                </button>

                {isExpanded ? (
                  <div
                    id={regionId}
                    className={cn(
                      sidebarExpanded
                        ? 'mt-1 space-y-1 border-l border-[color:var(--color-border)] pl-2.5'
                        : 'absolute left-full top-0 z-20 ml-3 w-56 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-2 shadow-[var(--shadow-soft)]',
                    )}
                    role={sidebarExpanded ? 'region' : 'menu'}
                    aria-label={item.label}
                  >
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        end
                        to={child.to}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm transition',
                            isActive
                              ? 'bg-[color:var(--color-primary-soft)] text-[color:var(--color-primary-strong)]'
                              : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text)]',
                          )
                        }
                        onClick={() => setFlyoutGroup(null)}
                      >
                        {({ isActive }) => (
                          <>
                            <NavigationGlyph active={isActive} icon={child.icon} />
                            <span>{child.label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
