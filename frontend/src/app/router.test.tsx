import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRouter } from './router';

vi.mock('../pages/OperationsWorkbenchPage', () => ({
  OperationsWorkbenchPage: () => <h2>거래 작업대</h2>,
}));

describe('AppRouter', () => {
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
