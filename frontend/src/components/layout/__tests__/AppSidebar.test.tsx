import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShellStateProvider, useAppShellState } from '../AppShellState';
import { AppSidebar } from '../AppSidebar';

function ShellStateSetter({ expanded }: { expanded: boolean }) {
  const { setSidebarExpanded } = useAppShellState();

  useEffect(() => {
    setSidebarExpanded(expanded);
  }, [expanded, setSidebarExpanded]);

  return null;
}

function renderSidebar(pathname: string, expanded: boolean) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AppShellStateProvider>
        <ShellStateSetter expanded={expanded} />
        <AppSidebar />
      </AppShellStateProvider>
    </MemoryRouter>,
  );
}

describe('AppSidebar', () => {
  it('shows grouped navigation children when the sidebar is expanded', () => {
    renderSidebar('/analysis/spending', true);

    expect(screen.getByRole('link', { name: '개요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지출' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: '자산' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '인사이트' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '거래 작업대' })).toBeInTheDocument();
  });

  it('uses aria-current on the direct route link', () => {
    renderSidebar('/', true);

    expect(screen.getByRole('link', { name: '개요' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens a flyout submenu for grouped items when collapsed', () => {
    renderSidebar('/analysis/spending', false);

    expect(screen.queryByRole('link', { name: '지출' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '분석 메뉴 열기' }));

    expect(screen.getByRole('link', { name: '지출' })).toBeVisible();
    expect(screen.getByRole('link', { name: '지출' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: '자산' })).toBeVisible();
    expect(screen.getByRole('link', { name: '인사이트' })).toBeVisible();
  });
});
