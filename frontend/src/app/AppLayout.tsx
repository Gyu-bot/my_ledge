import { NavLink, Outlet } from 'react-router-dom';

const navigationItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Assets', to: '/assets' },
  { label: 'Spending', to: '/spending' },
  { label: 'Data', to: '/data' },
];

export function AppLayout() {
  return (
    <div className="min-h-screen bg-dashboard-grid text-[color:var(--color-text)]">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] px-5 py-5 shadow-[var(--shadow-soft)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-[color:var(--color-text-subtle)]">
                my_ledge
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--color-text)] sm:text-3xl">
                Personal finance dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--color-text-muted)]">
                Canonical API-ready route shell for dashboard insights, asset tracking, and
                transaction operations.
              </p>
            </div>

            <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
              {navigationItems.map((item) => (
                <NavLink
                  key={item.label}
                  end={item.to === '/'}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'inline-flex cursor-pointer items-center rounded-full px-4 py-2 text-sm font-medium',
                      'transition-colors duration-200 motion-reduce:transition-none',
                      'focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                      isActive
                        ? 'bg-[color:var(--color-primary)] text-white shadow-[var(--shadow-glow)]'
                        : 'border border-[color:var(--color-border)] bg-white/80 text-[color:var(--color-text-muted)] hover:border-blue-200 hover:bg-blue-50',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mt-6 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
