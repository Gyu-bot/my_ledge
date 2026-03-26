interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section className="rounded-[1.75rem] border border-dashed border-[color:var(--color-border)] bg-white/70 p-8 text-center shadow-[var(--shadow-soft)]">
      <h2 className="text-2xl font-semibold text-[color:var(--color-text)]">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-text-muted)]">
        {description}
      </p>
    </section>
  );
}
