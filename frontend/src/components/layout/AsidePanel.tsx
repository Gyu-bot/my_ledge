import type { ReactNode } from 'react';

interface AsidePanelProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function AsidePanel({ title, description, children }: AsidePanelProps) {
  return (
    <aside className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-soft)]">
      <div className="border-b border-[color:var(--color-border)] pb-4">
        <p className="text-sm font-semibold text-[color:var(--color-text)]">{title}</p>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">{description}</p>
        ) : null}
      </div>
      <div className="pt-4">{children}</div>
    </aside>
  );
}
