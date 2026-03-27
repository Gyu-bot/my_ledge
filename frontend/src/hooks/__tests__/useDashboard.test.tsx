import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/dashboard', () => ({
  getDashboardData: vi.fn(),
}));

import { getDashboardData } from '../../api/dashboard';
import { useDashboard } from '../useDashboard';

const mockedGetDashboardData = vi.mocked(getDashboardData);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useDashboard', () => {
  it('falls back to empty collections when dashboard payload omits nested items arrays', async () => {
    mockedGetDashboardData.mockResolvedValue({
      asset_snapshots: {} as never,
      monthly_spend: {} as never,
      category_breakdown: {} as never,
      recent_transactions: {} as never,
    });

    const { result } = renderHook(() => useDashboard(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toMatchObject({
      snapshot_date: null,
      summary_cards: expect.any(Array),
      monthly_spend: [],
      category_breakdown: [],
      recent_transactions: [],
    });
    expect(result.current.data?.summary_cards).toHaveLength(4);
  });
});
