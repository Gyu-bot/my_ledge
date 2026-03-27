import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => ({
  hasApiKeyConfigured: vi.fn(() => true),
}));

vi.mock('../../api/transactions', () => ({
  deleteTransaction: vi.fn(),
  getTransactions: vi.fn(),
  restoreTransaction: vi.fn(),
  updateTransaction: vi.fn(),
}));

vi.mock('../../api/upload', () => ({
  getUploadLogs: vi.fn(),
  uploadWorkbook: vi.fn(),
}));

import { deleteTransaction, getTransactions } from '../../api/transactions';
import { getUploadLogs } from '../../api/upload';
import { useDataManagement } from '../useDataManagement';

const mockedGetTransactions = vi.mocked(getTransactions);
const mockedGetUploadLogs = vi.mocked(getUploadLogs);
const mockedDeleteTransaction = vi.mocked(deleteTransaction);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useDataManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads recent upload history alongside transactions', async () => {
    mockedGetTransactions.mockResolvedValue({
      total: 1,
      page: 1,
      per_page: 20,
      items: [
        {
          id: 1,
          date: '2026-03-24',
          time: '09:30:00',
          type: '지출',
          category_major: '식비',
          category_minor: null,
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '식비',
          effective_category_minor: null,
          description: '점심',
          amount: -12000,
          currency: 'KRW',
          payment_method: '카드 A',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-24T09:30:00',
          updated_at: '2026-03-24T09:30:00',
        },
      ],
    });
    mockedGetUploadLogs.mockResolvedValue({
      items: [
        {
          id: 77,
          uploaded_at: '2026-03-27T10:00:00Z',
          filename: 'fs_260326.xlsx',
          snapshot_date: '2026-03-26',
          tx_total: 2226,
          tx_new: 68,
          tx_skipped: 2158,
          status: 'success',
          error_message: null,
        },
      ],
    });

    const { result } = renderHook(() => useDataManagement(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.upload_history).toEqual([
      expect.objectContaining({
        id: 77,
        filename: 'fs_260326.xlsx',
        tx_new: 68,
      }),
    ]);
  });

  it('reports write action feedback after deleting a transaction', async () => {
    mockedGetTransactions.mockResolvedValue({
      total: 1,
      page: 1,
      per_page: 20,
      items: [
        {
          id: 1,
          date: '2026-03-24',
          time: '09:30:00',
          type: '지출',
          category_major: '식비',
          category_minor: null,
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '식비',
          effective_category_minor: null,
          description: '점심',
          amount: -12000,
          currency: 'KRW',
          payment_method: '카드 A',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-24T09:30:00',
          updated_at: '2026-03-24T09:30:00',
        },
      ],
    });
    mockedGetUploadLogs.mockResolvedValue({ items: [] });
    mockedDeleteTransaction.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDataManagement(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    await act(async () => {
      await result.current.deleteTransactionRow(1);
    });

    expect(result.current.actionFeedback).toEqual({
      variant: 'success',
      message: '거래 1번을 삭제했습니다.',
    });
  });

  it('falls back to an empty upload history when the upload log payload is missing items', async () => {
    mockedGetTransactions.mockResolvedValue({
      total: 0,
      page: 1,
      per_page: 20,
      items: [],
    });
    mockedGetUploadLogs.mockResolvedValue({} as Awaited<ReturnType<typeof getUploadLogs>>);

    const { result } = renderHook(() => useDataManagement(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data?.upload_history).toEqual([]);
  });

  it('aggregates paginated transactions before building the data workbench state', async () => {
    mockedGetTransactions
      .mockResolvedValueOnce({
        total: 21,
        page: 1,
        per_page: 20,
        items: Array.from({ length: 20 }, (_, index) => ({
          id: index + 1,
          date: '2026-03-24',
          time: '09:30:00',
          type: '지출',
          category_major: '식비',
          category_minor: null,
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '식비',
          effective_category_minor: null,
          description: `점심 ${index + 1}`,
          amount: -12000,
          currency: 'KRW',
          payment_method: '카드 A',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-24T09:30:00',
          updated_at: '2026-03-24T09:30:00',
        })),
      })
      .mockResolvedValueOnce({
        total: 21,
        page: 2,
        per_page: 20,
        items: [
          {
            id: 21,
            date: '2026-03-23',
            time: '08:30:00',
            type: '수입',
            category_major: '급여',
            category_minor: null,
            category_major_user: null,
            category_minor_user: null,
            effective_category_major: '급여',
            effective_category_minor: null,
            description: '월급',
            amount: 3000000,
            currency: 'KRW',
            payment_method: '계좌 A',
            cost_kind: null,
            fixed_cost_necessity: null,
            memo: null,
            is_deleted: false,
            merged_into_id: null,
            is_edited: false,
            source: 'import',
            created_at: '2026-03-23T08:30:00',
            updated_at: '2026-03-23T08:30:00',
          },
        ],
      });
    mockedGetUploadLogs.mockResolvedValue({ items: [] });

    const { result } = renderHook(() => useDataManagement(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(mockedGetTransactions).toHaveBeenCalledTimes(2);
    expect(result.current.data?.total).toBe(21);
    expect(result.current.data?.transactions).toHaveLength(20);
    expect(result.current.data?.category_options).toEqual(['급여', '식비']);
    expect(result.current.data?.payment_method_options).toEqual(['계좌 A', '카드 A']);
  });
});
