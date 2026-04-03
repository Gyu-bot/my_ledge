import { useRef } from 'react';
import { AppChromeProvider, useAppChromeContext } from '../components/layout/AppChromeContext';
import { Outlet } from 'react-router-dom';
import { AppShellStateProvider, useAppShellState } from '../components/layout/AppShellState';
import { AppSidebar } from '../components/layout/AppSidebar';
import { AppTopbar } from '../components/layout/AppTopbar';
import { ContentFrame } from '../components/layout/ContentFrame';
import { MobileSidebarDrawer } from '../components/layout/MobileSidebarDrawer';

function AppLayoutContent() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useAppShellState();
  const { meta } = useAppChromeContext();
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="min-h-screen bg-dashboard-grid text-[color:var(--color-text)]">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>

      <ContentFrame className="min-h-screen">
        <div className="flex flex-1 gap-4 lg:gap-6">
          <div className="hidden lg:block">
            <AppSidebar />
          </div>

          <div className="min-w-0 flex-1 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] shadow-[var(--shadow-soft)]">
            <AppTopbar
              meta={meta}
              mobileTriggerRef={mobileTriggerRef}
              onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            />
            <main id="main-content" tabIndex={-1} className="flex-1 p-4 sm:p-6">
              <Outlet />
            </main>
          </div>
        </div>

        <MobileSidebarDrawer
          open={mobileSidebarOpen}
          onOpenChange={setMobileSidebarOpen}
          triggerRef={mobileTriggerRef}
        />
      </ContentFrame>
    </div>
  );
}

export function AppLayout() {
  return (
    <AppShellStateProvider>
      <AppChromeProvider>
        <AppLayoutContent />
      </AppChromeProvider>
    </AppShellStateProvider>
  );
}
