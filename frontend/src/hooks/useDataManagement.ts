import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasApiKeyConfigured } from '../api/client';
import { resetData, type DataResetResponse, type DataResetScope } from '../api/dataManagement';
import {
  bulkUpdateTransactions,
  deleteTransaction,
  getTransactionFilterOptions,
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
import { ensureArray } from '../lib/collections';
import type { DataManagementFilterValues } from '../components/data/DataManagementFilterBar';
import type {
  TransactionBulkUpdateRequest,
  TransactionListResponse,
  TransactionResponse,
  TransactionUpdateRequest,
} from '../types/transactions';

const defaultFilters: DataManagementFilterValues = {
  search: '',
  transaction_type: '',
  source: '',
  category_major: '',
  payment_method: '',
  date_from: '',
  date_to: '',
  edited_only: false,
  include_deleted: false,
};

const DATA_MANAGEMENT_QUERY_KEY = ['data-management'] as const;
const TRANSACTIONS_QUERY_KEY = [...DATA_MANAGEMENT_QUERY_KEY, 'transactions'] as const;
const FILTER_OPTIONS_QUERY_KEY = [...DATA_MANAGEMENT_QUERY_KEY, 'filter-options'] as const;
const UPLOAD_HISTORY_QUERY_KEY = [...DATA_MANAGEMENT_QUERY_KEY, 'upload-history'] as const;
const DATA_MANAGEMENT_ROWS_PER_PAGE = 20;

function areFiltersEqual(
  left: DataManagementFilterValues,
  right: DataManagementFilterValues,
): boolean {
  return (
    left.search === right.search &&
    left.transaction_type === right.transaction_type &&
    left.source === right.source &&
    left.category_major === right.category_major &&
    left.payment_method === right.payment_method &&
    left.date_from === right.date_from &&
    left.date_to === right.date_to &&
    left.edited_only === right.edited_only &&
    left.include_deleted === right.include_deleted
  );
}

function buildTransactionsQuery(
  filters: DataManagementFilterValues,
  page: number,
): Record<string, string | number | boolean | undefined> {
  return {
    page,
    per_page: DATA_MANAGEMENT_ROWS_PER_PAGE,
    include_deleted: filters.include_deleted,
    include_merged: false,
    category_major: filters.category_major || undefined,
    payment_method: filters.payment_method || undefined,
    search: filters.search || undefined,
    start_date: filters.date_from || undefined,
    end_date: filters.date_to || undefined,
    is_edited: filters.edited_only ? 'true' : 'all',
    type: filters.transaction_type || undefined,
    source: filters.source || undefined,
  };
}

export interface DataManagementData {
  filters: DataManagementFilterValues;
  has_pending_filter_changes: boolean;
  transactions: TransactionResponse[];
  total: number;
  current_page: number;
  page_size: number;
  total_pages: number;
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
  isBulkSaving: boolean;
  isUploading: boolean;
  isResetting: boolean;
  uploadError: Error | null;
  actionFeedback: DataManagementActionFeedback | null;
  updateFilters: (next: DataManagementFilterValues) => void;
  applyFilters: () => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  uploadWorkbookFile: (file: File, snapshotDate: string) => Promise<void>;
  resetDataScope: (scope: DataResetScope) => Promise<DataResetResponse>;
  saveTransaction: (transactionId: number, payload: TransactionUpdateRequest) => Promise<void>;
  saveBulkTransactions: (
    ids: number[],
    payload: Omit<TransactionBulkUpdateRequest, 'ids'>,
  ) => Promise<void>;
  deleteTransactionRow: (transactionId: number) => Promise<void>;
  restoreTransactionRow: (transactionId: number) => Promise<void>;
}

export function useDataManagement(): UseDataManagementResult {
  const queryClient = useQueryClient();
  const [draftFilters, setDraftFilters] = useState<DataManagementFilterValues>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<DataManagementFilterValues>(defaultFilters);
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const [pendingTransactionId, setPendingTransactionId] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<DataManagementActionFeedback | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const transactionsQuery = useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEY, appliedFilters, currentPage],
    queryFn: () => getTransactions(buildTransactionsQuery(appliedFilters, currentPage)),
    placeholderData: (previousData) => previousData,
    refetchOnMount: false,
    staleTime: 60 * 1000,
  });

  const filterOptionsQuery = useQuery({
    queryKey: [...FILTER_OPTIONS_QUERY_KEY, appliedFilters.include_deleted],
    queryFn: () =>
      getTransactionFilterOptions({
        include_deleted: appliedFilters.include_deleted,
        include_merged: false,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const uploadHistoryQuery = useQuery({
    queryKey: UPLOAD_HISTORY_QUERY_KEY,
    queryFn: getUploadLogs,
    staleTime: 60 * 1000,
  });

  const invalidateWorkbenchTransactions = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: FILTER_OPTIONS_QUERY_KEY }),
    ]);
  };

  const invalidateUploadHistory = async () => {
    await queryClient.invalidateQueries({ queryKey: UPLOAD_HISTORY_QUERY_KEY });
  };

  const invalidateDependentReadPages = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['assets-page'] }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('spending-'),
      }),
    ]);
  };

  const updateTransactionCaches = (updatedTransaction: TransactionResponse) => {
    queryClient.setQueriesData<TransactionListResponse>(
      { queryKey: TRANSACTIONS_QUERY_KEY },
      (previousData) => {
        if (!previousData) {
          return previousData;
        }

        return {
          ...previousData,
          items: previousData.items.map((item) =>
            item.id === updatedTransaction.id ? updatedTransaction : item,
          ),
        };
      },
    );
  };

  const uploadMutation = useMutation({
    mutationFn: ({ file, snapshotDate }: { file: File; snapshotDate: string }) =>
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
      await Promise.all([
        invalidateWorkbenchTransactions(),
        invalidateUploadHistory(),
        invalidateDependentReadPages(),
      ]);
    },
    onError: (error) => {
      setActionFeedback({
        variant: 'destructive',
        message: error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다.',
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (scope: DataResetScope) => {
      setActionFeedback(null);
      return resetData(scope);
    },
    onSuccess: async (result) => {
      const deletedSnapshotRows =
        result.deleted.asset_snapshots + result.deleted.investments + result.deleted.loans;
      setLastUpload(null);
      setActionFeedback({
        variant: 'success',
        message:
          result.scope === 'transactions_only'
            ? `거래 ${result.deleted.transactions}건을 초기화했습니다. 업로드 이력은 유지됩니다.`
            : `거래 ${result.deleted.transactions}건과 스냅샷 ${deletedSnapshotRows}건을 초기화했습니다. 업로드 이력은 유지됩니다.`,
      });
      await Promise.all([
        invalidateWorkbenchTransactions(),
        invalidateUploadHistory(),
        invalidateDependentReadPages(),
      ]);
    },
    onError: (error) => {
      setActionFeedback({
        variant: 'destructive',
        message:
          error instanceof Error ? error.message : '데이터 초기화 중 오류가 발생했습니다.',
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
    onSuccess: async (result, variables) => {
      updateTransactionCaches(result);
      setActionFeedback({
        variant: 'success',
        message: `거래 ${variables.transactionId}번을 수정했습니다.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FILTER_OPTIONS_QUERY_KEY }),
        invalidateDependentReadPages(),
      ]);
    },
    onSettled: () => {
      setPendingTransactionId(null);
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

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({
      ids,
      payload,
    }: {
      ids: number[];
      payload: Omit<TransactionBulkUpdateRequest, 'ids'>;
    }) => {
      setActionFeedback(null);
      return bulkUpdateTransactions({
        ids,
        ...payload,
      });
    },
    onSuccess: async (result) => {
      setActionFeedback({
        variant: 'success',
        message: `선택한 거래 ${result.updated}건을 수정했습니다.`,
      });
      await Promise.all([invalidateWorkbenchTransactions(), invalidateDependentReadPages()]);
    },
    onError: (error) => {
      setActionFeedback({
        variant: 'destructive',
        message:
          error instanceof Error
            ? `일괄 수정에 실패했습니다. ${error.message}`
            : '일괄 수정에 실패했습니다.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      setPendingTransactionId(transactionId);
      setActionFeedback(null);
      return deleteTransaction(transactionId);
    },
    onSuccess: async (_result, transactionId) => {
      setActionFeedback({
        variant: 'success',
        message: `거래 ${transactionId}번을 삭제했습니다.`,
      });
      await Promise.all([invalidateWorkbenchTransactions(), invalidateDependentReadPages()]);
    },
    onSettled: () => {
      setPendingTransactionId(null);
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
    onSuccess: async (_result, transactionId) => {
      setActionFeedback({
        variant: 'success',
        message: `거래 ${transactionId}번을 복원했습니다.`,
      });
      await Promise.all([invalidateWorkbenchTransactions(), invalidateDependentReadPages()]);
    },
    onSettled: () => {
      setPendingTransactionId(null);
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

  const data = useMemo<DataManagementData | undefined>(() => {
    if (!transactionsQuery.data || !filterOptionsQuery.data) {
      return undefined;
    }

    const total = typeof transactionsQuery.data.total === 'number' ? transactionsQuery.data.total : 0;
    const totalPages = Math.max(1, Math.ceil(total / DATA_MANAGEMENT_ROWS_PER_PAGE));
    const safeCurrentPage = Math.min(currentPage, totalPages);

    return {
      filters: draftFilters,
      has_pending_filter_changes: !areFiltersEqual(draftFilters, appliedFilters),
      transactions: ensureArray(transactionsQuery.data.items),
      total,
      current_page: safeCurrentPage,
      page_size: transactionsQuery.data.per_page ?? DATA_MANAGEMENT_ROWS_PER_PAGE,
      total_pages: totalPages,
      category_options: ensureArray(filterOptionsQuery.data.category_options),
      payment_method_options: ensureArray(filterOptionsQuery.data.payment_method_options),
      upload_history: uploadHistoryQuery.isError
        ? []
        : ensureArray(uploadHistoryQuery.data?.items),
      last_upload: lastUpload,
      has_write_access: hasApiKeyConfigured(),
    };
  }, [
    appliedFilters,
    currentPage,
    draftFilters,
    filterOptionsQuery.data,
    lastUpload,
    transactionsQuery.data,
    uploadHistoryQuery.data,
    uploadHistoryQuery.isError,
  ]);

  const isPending = transactionsQuery.isPending || filterOptionsQuery.isPending;
  const error =
    (transactionsQuery.error as Error | null) ??
    (filterOptionsQuery.error as Error | null) ??
    null;

  return useMemo(
    () => ({
      data,
      isPending,
      isError: error !== null,
      error,
      pendingTransactionId,
      isBulkSaving: bulkUpdateMutation.isPending,
      isUploading: uploadMutation.isPending,
      isResetting: resetMutation.isPending,
      uploadError: uploadMutation.error,
      actionFeedback,
      updateFilters: (next: DataManagementFilterValues) => {
        setDraftFilters(next);
      },
      applyFilters: () => {
        setCurrentPage(1);
        setAppliedFilters(draftFilters);
      },
      resetFilters: () => {
        setCurrentPage(1);
        setDraftFilters(defaultFilters);
        setAppliedFilters(defaultFilters);
      },
      setPage: (page: number) => setCurrentPage(Math.max(1, page)),
      uploadWorkbookFile: async (file: File, snapshotDate: string) => {
        await uploadMutation.mutateAsync({ file, snapshotDate });
      },
      resetDataScope: async (scope: DataResetScope) => resetMutation.mutateAsync(scope),
      saveTransaction: async (transactionId: number, payload: TransactionUpdateRequest) => {
        await updateMutation.mutateAsync({ transactionId, payload });
      },
      saveBulkTransactions: async (
        ids: number[],
        payload: Omit<TransactionBulkUpdateRequest, 'ids'>,
      ) => {
        await bulkUpdateMutation.mutateAsync({ ids, payload });
      },
      deleteTransactionRow: async (transactionId: number) => {
        await deleteMutation.mutateAsync(transactionId);
      },
      restoreTransactionRow: async (transactionId: number) => {
        await restoreMutation.mutateAsync(transactionId);
      },
    }),
    [
      actionFeedback,
      bulkUpdateMutation,
      data,
      deleteMutation,
      error,
      isPending,
      pendingTransactionId,
      resetMutation,
      restoreMutation,
      updateMutation,
      uploadMutation,
      draftFilters,
    ],
  );
}
