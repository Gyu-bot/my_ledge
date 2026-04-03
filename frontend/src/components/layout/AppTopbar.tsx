import type { ReactNode, Ref } from 'react';
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { getBreadcrumb, getPageTitle } from '../../app/navigation';
import { Button } from '../ui/button';
import { PageBreadcrumb } from './PageBreadcrumb';

export function AppTopbar({
  meta,
  mobileTriggerRef,
  onOpenMobileSidebar,
}: {
  meta?: ReactNode;
  mobileTriggerRef?: Ref<HTMLButtonElement>;
  onOpenMobileSidebar?: () => void;
}) {
  const location = useLocation();
  const breadcrumbItems = getBreadcrumb(location.pathname);
  const pageTitle = getPageTitle(location.pathname);

  return (
    <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/90">
      <div className="flex min-h-16 items-center gap-3 px-4 py-3 sm:min-h-20 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {onOpenMobileSidebar ? (
            <Button
              aria-label="메뉴 열기"
              className="shrink-0 lg:hidden"
              ref={mobileTriggerRef}
              onClick={onOpenMobileSidebar}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          ) : null}

          <div className="min-w-0">
            <PageBreadcrumb className="hidden md:block" items={breadcrumbItems} />
            <h1
              className="truncate text-2xl font-semibold tracking-tight text-[color:var(--color-text)] md:mt-1"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {pageTitle}
            </h1>
          </div>
        </div>

        {meta ? (
          <div className="hidden shrink-0 items-center gap-2 text-sm text-[color:var(--color-text-muted)] sm:flex">
            {meta}
          </div>
        ) : null}
      </div>
    </header>
  );
}
