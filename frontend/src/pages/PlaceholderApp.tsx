const summaryCards = [
  {
    label: 'Net worth',
    value: 'KRW 184.2M',
    detail: '+2.1% vs last month',
  },
  {
    label: 'Spend this month',
    value: 'KRW 3.8M',
    detail: 'Top category: living costs',
  },
  {
    label: 'Imported rows',
    value: '2,219',
    detail: 'Last sync: 18 min ago',
  },
];

const activityItems = [
  {
    title: 'BankSalad workbook imported',
    meta: 'Transactions and snapshots synced',
    time: '18 min ago',
  },
  {
    title: 'Category edits queued',
    meta: 'Manual review remains for uncategorized rows',
    time: '42 min ago',
  },
  {
    title: 'Asset snapshots updated',
    meta: 'Investments and loans refreshed',
    time: 'Today',
  },
];

const spendingRows = [
  ['Housing', 'KRW 1.24M', '32%'],
  ['Food', 'KRW 860K', '22%'],
  ['Subscriptions', 'KRW 318K', '8%'],
  ['Transport', 'KRW 271K', '7%'],
];

export function PlaceholderApp() {
  return (
    <div className="min-h-screen bg-dashboard-grid text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="rounded-[2rem] border border-line bg-white/88 px-5 py-4 shadow-soft backdrop-blur sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-800 font-mono text-lg font-semibold text-white shadow-glow">
                ML
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-brand-700/70">
                  my_ledge
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  Personal finance dashboard
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800">
                Backend ready
              </span>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              >
                Upload data
              </button>
            </div>
          </div>
        </header>

        <main className="mt-6 grid gap-6 lg:grid-cols-12">
          <section className="lg:col-span-8 rounded-[2rem] border border-line bg-panel p-6 shadow-soft sm:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <h2 className="font-mono text-xs uppercase tracking-[0.28em] text-brand-700/70">
                  Live snapshot
                </h2>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                      Clear, data-dense finance tracking.
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                      Placeholder shell for BankSalad imports, monthly analysis, and asset
                      movement tracking. This scaffold keeps the layout ready for the real
                      data model without introducing visual noise.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
                    <p className="font-semibold">Focus mode</p>
                    <p className="mt-1 text-brand-800/80">Minimal shell, intentional structure.</p>
                  </div>
                </div>
              </div>

              <dl className="grid gap-4 sm:grid-cols-3">
                {summaryCards.map((card) => (
                  <div key={card.label} className="rounded-2xl border border-line bg-slate-50/70 p-4">
                    <dt className="text-sm font-medium text-slate-600">{card.label}</dt>
                    <dd className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                      {card.value}
                    </dd>
                    <dd className="mt-2 text-sm text-slate-500">{card.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <aside className="grid gap-6 lg:col-span-4">
            <section className="rounded-[2rem] border border-line bg-panel p-6 shadow-soft">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-brand-700/70">
                Sync status
              </p>
              <h2 className="mt-3 text-xl font-semibold text-ink">Upload pipeline</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Ready for encrypted Excel import, incremental dedupe, and snapshot upsert.
              </p>
              <div className="mt-5 space-y-3">
                {[
                  ['Workbook parsing', 'Ready'],
                  ['Transactions', '2,219 rows'],
                  ['Snapshots', '3 tables'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"
                  >
                    <span className="text-slate-600">{label}</span>
                    <span className="font-semibold text-ink">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-line bg-panel p-6 shadow-soft">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-brand-700/70">
                Manual review
              </p>
              <h2 className="mt-3 text-xl font-semibold text-ink">Category work queue</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Most rows are uncategorized by design. The dashboard will keep manual edits
                fast and visible.
              </p>
              <button
                type="button"
                className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800 transition-colors duration-200 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              >
                Review pending edits
              </button>
            </section>
          </aside>
        </main>

        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <article
              key={`${card.label}-mini`}
              className="rounded-[1.75rem] border border-line bg-white/92 p-5 shadow-soft"
            >
              <p className="text-sm font-medium text-slate-600">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{card.value}</p>
              <p className="mt-2 text-sm text-slate-500">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-line bg-panel p-6 shadow-soft sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-brand-700/70">
                  Spending snapshot
                </p>
                <h2 className="mt-3 text-xl font-semibold text-ink">Category mix</h2>
              </div>
              <span className="rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-600">
                Placeholder
              </span>
            </div>
            <div className="mt-6 space-y-3">
              {spendingRows.map(([label, amount, share]) => (
                <div key={label} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{label}</span>
                    <span className="font-mono text-slate-500">{share}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-brand-100">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-brand-700 to-brand-500"
                      style={{ width: share }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{amount}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-line bg-panel p-6 shadow-soft sm:p-8">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-brand-700/70">
              Recent activity
            </p>
            <h2 className="mt-3 text-xl font-semibold text-ink">Latest events</h2>
            <ul className="mt-6 space-y-4">
              {activityItems.map((item) => (
                <li key={item.title} className="rounded-2xl border border-line bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-ink">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.meta}</p>
                    </div>
                    <span className="font-mono text-xs text-slate-400">{item.time}</span>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <footer className="mt-6 pb-2 text-sm text-slate-500">
          Built as a placeholder shell for future transactions, spending, assets, and data
          workflows.
        </footer>
      </div>
    </div>
  );
}
