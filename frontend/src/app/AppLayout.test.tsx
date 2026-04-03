import { render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Badge } from '../components/ui/badge';
import { useAppChromeMeta } from '../components/layout/AppChromeContext';
import { AppLayout } from './AppLayout';

function LayoutMetaProbe() {
  const meta = useMemo(
    () => <Badge variant="reference">기준일 2026-03-24</Badge>,
    [],
  );

  useAppChromeMeta(meta);

  return <div>Dashboard content</div>;
}

describe('AppLayout', () => {
  it('keeps the skip-link target programmatically focusable', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<LayoutMetaProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('기준일 2026-03-24')).toBeInTheDocument();
  });

  it('renders section navigation and section tab navigation in the shared shell', () => {
    render(
      <MemoryRouter initialEntries={['/analysis/spending']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/analysis/spending" element={<div>Spending content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('navigation', { name: /sections/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /section tabs/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'my_ledge workspace' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '지출' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '개요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지출' })).toHaveAttribute('aria-current', 'page');
  });
});
