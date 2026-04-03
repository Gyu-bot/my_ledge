import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SIDEBAR_STORAGE_KEY,
  AppShellStateProvider,
  useAppShellState,
} from '../components/layout/AppShellState';
import { AppRouter } from './router';
import { getBreadcrumb, getPageTitle } from './navigation';

vi.mock('../pages/OperationsWorkbenchPage', () => ({
  OperationsWorkbenchPage: () => <h2>거래 작업대</h2>,
}));

function ShellStateProbe() {
  const { setSidebarExpanded, sidebarExpanded } = useAppShellState();

  useEffect(() => {
    setSidebarExpanded((current) => current);
  }, [setSidebarExpanded]);

  return <span>{sidebarExpanded ? 'expanded' : 'collapsed'}</span>;
}

describe('AppRouter', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(key);
        }),
        clear: vi.fn(() => {
          storage.clear();
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('derives page titles and breadcrumbs from the canonical route map', () => {
    expect(getPageTitle('/')).toBe('개요');
    expect(getBreadcrumb('/').map((item) => item.label)).toEqual(['개요']);

    expect(getPageTitle('/analysis/spending')).toBe('지출');
    expect(getBreadcrumb('/analysis/spending').map((item) => item.label)).toEqual([
      '분석',
      '지출',
    ]);

    expect(getPageTitle('/analysis/assets')).toBe('자산');
    expect(getBreadcrumb('/analysis/assets').map((item) => item.label)).toEqual([
      '분석',
      '자산',
    ]);

    expect(getPageTitle('/analysis/insights')).toBe('인사이트');
    expect(getBreadcrumb('/analysis/insights').map((item) => item.label)).toEqual([
      '분석',
      '인사이트',
    ]);

    expect(getPageTitle('/operations/workbench')).toBe('거래 작업대');
    expect(
      getBreadcrumb('/operations/workbench').map((item) => item.label),
    ).toEqual(['운영', '거래 작업대']);
  });

  it('restores desktop sidebar expansion state from localStorage', () => {
    window.localStorage.setItem(APP_SIDEBAR_STORAGE_KEY, 'false');

    render(
      <AppShellStateProvider>
        <ShellStateProbe />
      </AppShellStateProvider>,
    );

    expect(screen.getByText('collapsed')).toBeInTheDocument();
  });

  it('redirects legacy /data route to the canonical operations workbench', async () => {
    render(
      <MemoryRouter initialEntries={['/data']}>
        <AppRouter />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: '거래 작업대' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('/data 레거시 경로')).not.toBeInTheDocument();
  });
});
