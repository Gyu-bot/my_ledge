interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  meta?: string;
}

export function PageHeader({ eyebrow, title, description, meta }: PageHeaderProps) {
  return (
    <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-subtle)]">
            {eyebrow}
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[color:var(--color-text)] sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--color-text-muted)] sm:text-base">
            {description}
          </p>
        </div>

        {meta ? (
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
            {meta}
          </div>
        ) : null}
      </div>
    </section>
  );
}
