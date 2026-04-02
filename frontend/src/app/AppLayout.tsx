import { Outlet, useLocation } from 'react-router-dom';
import { PrimarySectionNav } from '../components/navigation/PrimarySectionNav';
import { SectionTabNav, type SectionTabItem } from '../components/navigation/SectionTabNav';

const analysisTabs: SectionTabItem[] = [
  { label: '지출', to: '/analysis/spending' },
  { label: '자산', to: '/analysis/assets' },
  { label: '인사이트', to: '/analysis/insights' },
];

const operationTabs: SectionTabItem[] = [
  { label: '거래 작업대', to: '/operations/workbench' },
];

export function AppLayout() {
  const location = useLocation();
  const sectionTabs = location.pathname.startsWith('/analysis')
    ? { ariaLabel: 'Section tabs', items: analysisTabs }
    : location.pathname.startsWith('/operations')
      ? { ariaLabel: 'Section tabs', items: operationTabs }
      : null;

  return (
    <div className="min-h-screen bg-dashboard-grid text-[color:var(--color-text)]">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
        <header className="border-b border-[color:var(--color-border)] pb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--color-text-subtle)]">
                  Finance cockpit
                </p>
                <h1
                  className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  my_ledge workspace
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--color-text-muted)]">
                  개요에서 현재 상태를 읽고, 분석에서 패턴을 확인한 뒤, 운영에서 거래를 정리하는
                  흐름으로 재무 화면을 재구성했습니다.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                <span className="rounded-[var(--radius-full)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1.5">
                  개요 · 분석 · 운영
                </span>
                <span className="rounded-[var(--radius-full)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1.5">
                  read-heavy + write-heavy
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <PrimarySectionNav />
              {sectionTabs ? <SectionTabNav ariaLabel={sectionTabs.ariaLabel} items={sectionTabs.items} /> : null}
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mt-5 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
