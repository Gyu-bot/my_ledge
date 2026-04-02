import { NavLink } from 'react-router-dom';

export interface SectionTabItem {
  label: string;
  to: string;
  end?: boolean;
}

interface SectionTabNavProps {
  ariaLabel: string;
  items: SectionTabItem[];
}

export function SectionTabNav({ ariaLabel, items }: SectionTabNavProps) {
  return (
    <nav aria-label={ariaLabel} className="flex items-center gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <NavLink
          key={item.label}
          end={item.end}
          to={item.to}
          className={({ isActive }) =>
            [
              'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[var(--radius-full)] px-4 text-sm font-medium transition',
              isActive
                ? 'bg-[color:var(--color-primary-soft)] text-[color:var(--color-primary)]'
                : 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-text)]',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
