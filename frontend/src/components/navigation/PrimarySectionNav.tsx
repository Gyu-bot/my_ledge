import { NavLink } from 'react-router-dom';

const sections = [
  { label: '개요', to: '/', end: true },
  { label: '분석', to: '/analysis/spending', end: false },
  { label: '운영', to: '/operations/workbench', end: false },
] as const;

export function PrimarySectionNav() {
  return (
    <nav aria-label="Sections" className="flex flex-wrap items-center gap-2">
      {sections.map((section) => (
        <NavLink
          key={section.label}
          end={section.end}
          to={section.to}
          className={({ isActive }) =>
            [
              'inline-flex h-10 items-center justify-center rounded-[var(--radius-full)] px-4 text-sm font-semibold transition',
              isActive
                ? 'bg-[color:var(--color-primary)] text-[color:var(--color-text-inverse)] shadow-[var(--shadow-soft)]'
                : 'border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)] hover:border-[color:var(--color-primary-soft)] hover:bg-[color:var(--color-primary-soft)] hover:text-[color:var(--color-primary)]',
            ].join(' ')
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
