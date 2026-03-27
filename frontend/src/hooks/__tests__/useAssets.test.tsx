import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/assets', () => ({
  getAssetsData: vi.fn(),
}));

import { getAssetsData } from '../../api/assets';
import { useAssets } from '../useAssets';

const mockedGetAssetsData = vi.mocked(getAssetsData);

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

describe('useAssets', () => {
  it('falls back to empty collections and zero totals when nested asset payloads are missing', async () => {
    mockedGetAssetsData.mockResolvedValue({
      asset_snapshots: {} as never,
      net_worth_history: {} as never,
      investments: {} as never,
      loans: {} as never,
    });

    const { result } = renderHook(() => useAssets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toMatchObject({
      snapshot_date: null,
      net_worth_history: [],
      investments: {
        snapshot_date: null,
        totals: {
          cost_basis: 0,
          market_value: 0,
        },
        items: [],
      },
      loans: {
        snapshot_date: null,
        totals: {
          principal: 0,
          balance: 0,
        },
        items: [],
      },
    });
  });
});
