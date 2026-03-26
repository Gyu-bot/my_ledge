interface ErrorStateProps {
  title: string;
  description: string;
  detail?: string;
}

export function ErrorState({ title, description, detail }: ErrorStateProps) {
  return (
    <section className="rounded-[1.75rem] border border-red-200 bg-white p-8 shadow-[var(--shadow-soft)]">
      <div className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-red-700">
        Dashboard error
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-[color:var(--color-text)]">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-text-muted)]">
        {description}
      </p>
      {detail ? (
        <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
          {detail}
        </p>
      ) : null}
    </section>
  );
}
