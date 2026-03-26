import { NavLink, Outlet } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

const navigationItems = [
  { label: '대시보드', to: '/' },
  { label: '자산', to: '/assets' },
  { label: '지출', to: '/spending' },
  { label: '데이터', to: '/data' },
];

export function AppLayout() {
  return (
    <div className="min-h-screen bg-dashboard-grid text-[color:var(--color-text)]">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <Card>
          <CardHeader className="gap-5 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-subtle)]">
                my_ledge
              </p>
              <CardTitle className="mt-3 text-2xl tracking-tight sm:text-3xl">
                개인 재무 대시보드
              </CardTitle>
            </div>

            <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
              {navigationItems.map((item) => (
                <NavLink
                  key={item.label}
                  end={item.to === '/'}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'inline-flex items-center justify-center rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-[color:var(--color-accent)] text-white'
                        : 'border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-accent-soft)] hover:text-[color:var(--color-accent)]',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="max-w-2xl text-sm leading-6 text-[color:var(--color-text-muted)]">
              대시보드 인사이트, 자산 추적, 거래 관리를 한 흐름으로 연결한 개인 재무 워크스페이스입니다.
            </p>
          </CardContent>
        </Card>

        <main id="main-content" tabIndex={-1} className="mt-6 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
