import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  it('keeps the skip-link target programmatically focusable', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<div>Dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
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

    expect(screen.getByRole('heading', { level: 1, name: 'my_ledge workspace' })).toBeInTheDocument();
    expect(screen.queryByText('제품 구조')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /sections/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '개요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '분석' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '운영' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /section tabs/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지출' })).toHaveAttribute('aria-current', 'page');
  });
});
