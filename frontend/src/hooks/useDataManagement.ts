import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasApiKeyConfigured } from '../api/client';
import {
  deleteTransaction,
  getTransactions,
  restoreTransaction,
  updateTransaction,
} from '../api/transactions';
import {
  getUploadLogs,
  uploadWorkbook,
  type UploadLogResponse,
  type UploadResponse,
} from '../api/upload';
import type { DataManagementFilterValues } from '../components/data/DataManagementFilterBar';
import type { TransactionResponse, TransactionUpdateRequest } from '../types/transactions';

const defaultFilters: DataManagementFilterValues = {
  search: '',
  category_major: '',
  payment_method: '',
  include_deleted: false,
};

const DATA_MANAGEMENT_QUERY_KEY = ['data-management'] as const;

export interface DataManagementData {
  filters: DataManagementFilterValues;
  transactions: TransactionResponse[];
  total: number;
  category_options: string[];
  payment_method_options: string[];
  upload_history: UploadLogResponse[];
  last_upload: UploadResponse | null;
  has_write_access: boolean;
}

export interface DataManagementActionFeedback {
  variant: 'success' | 'destructive';
  message: string;
}

export interface UseDataManagementResult {
  data: DataManagementData | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  pendingTransactionId: number | null;
  isUploading: boolean;
  uploadError: Error | null;
  actionFeedback: DataManagementActionFeedback | null;
  updateFilters: (next: DataManagementFilterValues) => void;
  resetFilters: () => void;
  uploadWorkbookFile: (file: File, snapshotDate?: string) => Promise<void>;
  saveTransaction: (transactionId: number, payload: TransactionUpdateRequest) => Promise<void>;
  deleteTransactionRow: (transactionId: number) => Promise<void>;
  restoreTransactionRow: (transactionId: number) => Promise<void>;
}

export function useDataManagement(): UseDataManagementResult {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<DataManagementFilterValues>(defaultFilters);
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const [pendingTransactionId, setPendingTransactionId] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<DataManagementActionFeedback | null>(null);

  const transactionsQuery = useQuery({
    queryKey: [...DATA_MANAGEMENT_QUERY_KEY, filters],
    queryFn: async (): Promise<DataManagementData> => {
      const [response, uploadLogsResponse] = await Promise.all([
        getTransactions({
          page: 1,
          per_page: 20,
          include_deleted: filters.include_deleted,
          include_merged: false,
          category_major: filters.category_major || undefined,
          payment_method: filters.payment_method || undefined,
          search: filters.search || undefined,
        }),
        getUploadLogs(),
      ]);

      const categoryOptions = Array.from(
        new Set(response.items.map((item) => item.effective_category_major).filter(Boolean)),
      ).sort();
      const paymentMethodOptions = Array.from(
        new Set(
          response.items
            .map((item) => item.payment_method)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort();

      return {
        filters,
        transactions: response.items,
        total: response.total,
        category_options: categoryOptions,
        payment_method_options: paymentMethodOptions,
        upload_history: uploadLogsResponse.items,
        last_upload: lastUpload,
        has_write_access: hasApiKeyConfigured(),
      };
    },
    staleTime: 60 * 1000,
  });

  const invalidateTransactions = async () => {
    await queryClient.invalidateQueries({ queryKey: DATA_MANAGEMENT_QUERY_KEY });
  };

  const uploadMutation = useMutation({
    mutationFn: ({ file, snapshotDate }: { file: File; snapshotDate?: string }) =>
      uploadWorkbook({ file, snapshot_date: snapshotDate }),
    onSuccess: async (result) => {
      setLastUpload(result);
      setActionFeedback({
        variant: result.status === 'failed' ? 'destructive' : 'success',
        message:
          result.status === 'failed'
            ? `업로드가 실패했습니다. ${result.error_message ?? '오류 내역을 확인하세요.'}`
            : `업로드가 ${result.status} 상태로 완료되었습니다. 신규 거래 ${result.transactions.new}건이 반영됐습니다.`,
      });
      await invalidateTransactions();
    },
    onError: (error) => {
      setActionFeedback({
        variant: 'destructive',
        message: error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다.',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      transactionId,
      payload,
    }: {
      transactionId: number;
      payload: TransactionUpdateRequest;
    }) => {
      setPendingTransactionId(transactionId);
      setActionFeedback(null);
      return updateTransaction(transactionId, payload);
    },
    onSuccess: (_result, variables) => {
      setActionFeedback({
        variant: 'success',
        message: `거래 ${variables.transactionId}번을 수정했습니다.`,
      });
    },
    onSettled: async () => {
      setPendingTransactionId(null);
      await invalidateTransactions();
    },
    onError: (error, variables) => {
      setActionFeedback({
        variant: 'destructive',
        message:
          error instanceof Error
            ? `거래 ${variables.transactionId}번 수정에 실패했습니다. ${error.message}`
            : `거래 ${variables.transactionId}번 수정에 실패했습니다.`,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      setPendingTransactionId(transactionId);
      setActionFeedback(null);
      return deleteTransaction(transactionId);
    },
    onSuccess: (_result, transactionId) => {
      setActionFeedback({
        variant: 'success',
        message: `거래 ${transactionId}번을 삭제했습니다.`,
      });
    },
    onSettled: async () => {
      setPendingTransactionId(null);
      await invalidateTransactions();
    },
    onError: (error, transactionId) => {
      setActionFeedback({
        variant: 'destructive',
        message:
          error instanceof Error
            ? `거래 ${transactionId}번 삭제에 실패했습니다. ${error.message}`
            : `거래 ${transactionId}번 삭제에 실패했습니다.`,
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      setPendingTransactionId(transactionId);
      setActionFeedback(null);
      return restoreTransaction(transactionId);
    },
    onSuccess: (_result, transactionId) => {
      setActionFeedback({
        variant: 'success',
        message: `거래 ${transactionId}번을 복원했습니다.`,
      });
    },
    onSettled: async () => {
      setPendingTransactionId(null);
      await invalidateTransactions();
    },
    onError: (error, transactionId) => {
      setActionFeedback({
        variant: 'destructive',
        message:
          error instanceof Error
            ? `거래 ${transactionId}번 복원에 실패했습니다. ${error.message}`
            : `거래 ${transactionId}번 복원에 실패했습니다.`,
      });
    },
  });

  return useMemo(
    () => ({
      ...transactionsQuery,
      pendingTransactionId,
      isUploading: uploadMutation.isPending,
      uploadError: uploadMutation.error,
      actionFeedback,
      updateFilters: (next: DataManagementFilterValues) => setFilters(next),
      resetFilters: () => setFilters(defaultFilters),
      uploadWorkbookFile: async (file: File, snapshotDate?: string) => {
        await uploadMutation.mutateAsync({ file, snapshotDate });
      },
      saveTransaction: async (transactionId: number, payload: TransactionUpdateRequest) => {
        await updateMutation.mutateAsync({ transactionId, payload });
      },
      deleteTransactionRow: async (transactionId: number) => {
        await deleteMutation.mutateAsync(transactionId);
      },
      restoreTransactionRow: async (transactionId: number) => {
        await restoreMutation.mutateAsync(transactionId);
      },
    }),
    [
      deleteMutation,
      pendingTransactionId,
      restoreMutation,
      transactionsQuery,
      updateMutation,
      uploadMutation,
      actionFeedback,
    ],
  );
}
