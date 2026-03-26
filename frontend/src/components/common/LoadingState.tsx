interface LoadingStateProps {
  title: string;
  description: string;
}

export function LoadingState({ title, description }: LoadingStateProps) {
  return (
    <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-8 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-3 w-3 rounded-full bg-[color:var(--color-primary)] animate-pulse motion-reduce:animate-none"
        />
        <h2 className="text-xl font-semibold text-[color:var(--color-text)]">{title}</h2>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-text-muted)]">
        {description}
      </p>
    </section>
  );
}
