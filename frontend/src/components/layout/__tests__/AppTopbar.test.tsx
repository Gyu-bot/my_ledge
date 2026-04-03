import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppTopbar } from '../AppTopbar';

describe('AppTopbar', () => {
  it('renders breadcrumb and title from the navigation config', () => {
    render(
      <MemoryRouter initialEntries={['/analysis/assets']}>
        <AppTopbar />
      </MemoryRouter>,
    );

    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });

    expect(breadcrumb).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '분석' })).toBeInTheDocument();
    expect(screen.getByText('자산', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '자산' })).toBeInTheDocument();
    expect(
      screen.queryByText('최신 KPI, 월간 현금흐름, 주의 신호, 최근 거래를 한 화면에서 확인합니다.'),
    ).not.toBeInTheDocument();
  });

  it('renders a mobile trigger and compact meta slot content', () => {
    const handleOpen = vi.fn();

    render(
      <MemoryRouter initialEntries={['/operations/workbench']}>
        <AppTopbar
          meta={<span>전체 128건</span>}
          onOpenMobileSidebar={handleOpen}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '메뉴 열기' })).toBeInTheDocument();
    expect(screen.getByText('전체 128건')).toBeInTheDocument();
  });
});
