import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => ({
  hasApiKeyConfigured: vi.fn(() => true),
}));

vi.mock('../../api/dataManagement', () => ({
  resetData: vi.fn(),
}));

vi.mock('../../api/transactions', () => ({
  bulkUpdateTransactions: vi.fn(),
  deleteTransaction: vi.fn(),
  getTransactions: vi.fn(),
  restoreTransaction: vi.fn(),
  updateTransaction: vi.fn(),
}));

vi.mock('../../api/upload', () => ({
  getUploadLogs: vi.fn(),
  uploadWorkbook: vi.fn(),
}));

import { resetData } from '../../api/dataManagement';
import {
  bulkUpdateTransactions,
  deleteTransaction,
  getTransactions,
  updateTransaction,
} from '../../api/transactions';
import { getUploadLogs } from '../../api/upload';
import { useDataManagement } from '../useDataManagement';

const mockedGetTransactions = vi.mocked(getTransactions);
const mockedGetUploadLogs = vi.mocked(getUploadLogs);
const mockedBulkUpdateTransactions = vi.mocked(bulkUpdateTransactions);
const mockedDeleteTransaction = vi.mocked(deleteTransaction);
const mockedUpdateTransaction = vi.mocked(updateTransaction);
const mockedResetData = vi.mocked(resetData);

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

  it('passes merchant edits through the transaction save mutation', async () => {
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
          description: '스타벅스 리저브 종로점',
          merchant: '스타벅스',
          amount: -12000,
          currency: 'KRW',
          payment_method: '카드 A',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: true,
          source: 'import',
          created_at: '2026-03-24T09:30:00',
          updated_at: '2026-03-24T09:30:00',
        },
      ],
    });
    mockedGetUploadLogs.mockResolvedValue({ items: [] });
    mockedUpdateTransaction.mockResolvedValue({
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
      description: '스타벅스 리저브 종로점',
      merchant: '스타벅스',
      amount: -12000,
      currency: 'KRW',
      payment_method: '카드 A',
      cost_kind: null,
      fixed_cost_necessity: null,
      memo: null,
      is_deleted: false,
      merged_into_id: null,
      is_edited: true,
      source: 'import',
      created_at: '2026-03-24T09:30:00',
      updated_at: '2026-03-24T09:30:00',
    } as never);

    const { result } = renderHook(() => useDataManagement(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    await act(async () => {
      await result.current.saveTransaction(1, { merchant: '스타벅스' });
    });

    expect(mockedUpdateTransaction).toHaveBeenCalledWith(1, { merchant: '스타벅스' });
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
    expect(result.current.data?.current_page).toBe(1);
    expect(result.current.data?.total_pages).toBe(2);
    expect(result.current.data?.category_options).toEqual(['급여', '식비']);
    expect(result.current.data?.payment_method_options).toEqual(['계좌 A', '카드 A']);
  });

  it('lets the workbench navigate to later pages without refetching every row again', async () => {
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

    await act(async () => {
      result.current.setPage(2);
    });

    expect(result.current.data?.current_page).toBe(2);
    expect(result.current.data?.transactions).toEqual([
      expect.objectContaining({
        id: 21,
        description: '월급',
      }),
    ]);
    expect(mockedGetTransactions).toHaveBeenCalledTimes(2);
  });

  it('applies advanced client-side filters for transaction type, source, edited status, and date range', async () => {
    mockedGetTransactions.mockResolvedValue({
      total: 3,
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
        {
          id: 2,
          date: '2026-03-22',
          time: '10:30:00',
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
          memo: '확인 완료',
          is_deleted: false,
          merged_into_id: null,
          is_edited: true,
          source: 'manual',
          created_at: '2026-03-22T10:30:00',
          updated_at: '2026-03-22T10:30:00',
        },
        {
          id: 3,
          date: '2026-03-20',
          time: '08:00:00',
          type: '이체',
          category_major: '이체',
          category_minor: null,
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '이체',
          effective_category_minor: null,
          description: '적금 이체',
          amount: -500000,
          currency: 'KRW',
          payment_method: '계좌 B',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-20T08:00:00',
          updated_at: '2026-03-20T08:00:00',
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

    const nextFilters = {
      search: '',
      transaction_type: '수입',
      source: 'manual',
      category_major: '',
      payment_method: '',
      date_from: '2026-03-21',
      date_to: '2026-03-23',
      edited_only: true,
      include_deleted: false,
    };

    await act(async () => {
      result.current.updateFilters(nextFilters);
    });

    expect(result.current.data?.filters).toEqual(nextFilters);
    expect(result.current.data?.total).toBe(3);

    await act(async () => {
      result.current.applyFilters();
    });

    await waitFor(() => {
      expect(result.current.data?.total).toBe(1);
    });

    expect(result.current.data?.transactions).toEqual([
      expect.objectContaining({
        id: 2,
        description: '월급',
      }),
    ]);
  });

  it('reports reset feedback after clearing transaction rows only', async () => {
    mockedGetTransactions.mockResolvedValue({
      total: 0,
      page: 1,
      per_page: 20,
      items: [],
    });
    mockedGetUploadLogs.mockResolvedValue({ items: [] });
    mockedResetData.mockResolvedValue({
      scope: 'transactions_only',
      deleted: {
        transactions: 12,
        asset_snapshots: 0,
        investments: 0,
        loans: 0,
      },
      upload_logs_retained: true,
    });

    const { result } = renderHook(() => useDataManagement(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    await act(async () => {
      await result.current.resetDataScope('transactions_only');
    });

    expect(mockedResetData).toHaveBeenCalledWith('transactions_only');
    expect(result.current.actionFeedback).toEqual({
      variant: 'success',
      message: '거래 12건을 초기화했습니다. 업로드 이력은 유지됩니다.',
    });
  });

  it('sends bulk edit payloads and reports the updated row count', async () => {
    mockedGetTransactions.mockResolvedValue({
      total: 2,
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
          merchant: '회사식당',
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
        {
          id: 2,
          date: '2026-03-25',
          time: '10:00:00',
          type: '지출',
          category_major: '식비',
          category_minor: null,
          category_major_user: null,
          category_minor_user: null,
          effective_category_major: '식비',
          effective_category_minor: null,
          description: '커피',
          merchant: '카페',
          amount: -5000,
          currency: 'KRW',
          payment_method: '카드 B',
          cost_kind: null,
          fixed_cost_necessity: null,
          memo: null,
          is_deleted: false,
          merged_into_id: null,
          is_edited: false,
          source: 'import',
          created_at: '2026-03-25T10:00:00',
          updated_at: '2026-03-25T10:00:00',
        },
      ],
    });
    mockedGetUploadLogs.mockResolvedValue({ items: [] });
    mockedBulkUpdateTransactions.mockResolvedValue({ updated: 2 });

    const { result } = renderHook(() => useDataManagement(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    await act(async () => {
      await result.current.saveBulkTransactions([1, 2], {
        cost_kind: 'fixed',
        fixed_cost_necessity: 'essential',
        merchant: '외식 묶음',
        memo: '일괄 메모',
      });
    });

    expect(mockedBulkUpdateTransactions).toHaveBeenCalledWith({
      ids: [1, 2],
      cost_kind: 'fixed',
      fixed_cost_necessity: 'essential',
      merchant: '외식 묶음',
      memo: '일괄 메모',
    });
    expect(result.current.actionFeedback).toEqual({
      variant: 'success',
      message: '선택한 거래 2건을 수정했습니다.',
    });
  });
});
