interface PlaceholderAppProps {
  eyebrow: string;
  title: string;
  description: string;
}

const foundationItems = [
  ['Router shell', 'Ready'],
  ['Query provider', 'Ready'],
  ['Typed API client', 'Ready'],
];

const nextSlices = [
  {
    title: 'Dashboard cards and charts',
    detail: 'Net worth, monthly trend, category mix, recent transactions',
  },
  {
    title: 'Asset history and portfolio',
    detail: 'Snapshots, investments, and loans over time',
  },
  {
    title: 'Data operations workspace',
    detail: 'Uploads, edits, and import log visibility',
  },
];

export function PlaceholderApp({ eyebrow, title, description }: PlaceholderAppProps) {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.9fr)]">
      <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-subtle)]">
          {eyebrow}
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[color:var(--color-text)] sm:text-4xl">
          {title}
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--color-text-muted)] sm:text-base">
          {description}
        </p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          {foundationItems.map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4"
            >
              <dt className="text-sm font-medium text-[color:var(--color-text-muted)]">{label}</dt>
              <dd className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--color-text)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </article>

      <aside className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-subtle)]">
          Phase 2
        </p>
        <h3 className="mt-4 text-xl font-semibold text-[color:var(--color-text)]">Next slices</h3>
        <ul className="mt-6 space-y-4">
          {nextSlices.map((item) => (
            <li
              key={item.title}
              className="rounded-2xl border border-[color:var(--color-border)] bg-white/80 p-4"
            >
              <p className="font-semibold text-[color:var(--color-text)]">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
