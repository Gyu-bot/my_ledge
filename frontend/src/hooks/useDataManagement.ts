import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasApiKeyConfigured } from '../api/client';
import { resetData, type DataResetResponse, type DataResetScope } from '../api/dataManagement';
import { ensureArray } from '../lib/collections';
import {
  bulkUpdateTransactions,
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
import type {
  TransactionBulkUpdateRequest,
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

async function loadAllTransactions(
  filters: DataManagementFilterValues,
): Promise<TransactionResponse[]> {
  const items: TransactionResponse[] = [];
  let page = 1;
  let total = 0;

  while (page === 1 || items.length < total) {
    const response = await getTransactions({
      page,
      per_page: DATA_MANAGEMENT_ROWS_PER_PAGE,
      include_deleted: filters.include_deleted,
      include_merged: false,
      category_major: filters.category_major || undefined,
      payment_method: filters.payment_method || undefined,
      search: filters.search || undefined,
    });
    const pageItems = ensureArray(response.items);

    items.push(...pageItems);
    total = typeof response.total === 'number' ? response.total : items.length;

    if (pageItems.length === 0) {
      break;
    }

    page += 1;
  }

  return items;
}

function applyClientFilters(
  transactions: TransactionResponse[],
  filters: DataManagementFilterValues,
): TransactionResponse[] {
  return transactions.filter((transaction) => {
    if (filters.transaction_type && transaction.type !== filters.transaction_type) {
      return false;
    }
    if (filters.source && transaction.source !== filters.source) {
      return false;
    }
    if (filters.edited_only && !transaction.is_edited) {
      return false;
    }
    if (filters.date_from && transaction.date < filters.date_from) {
      return false;
    }
    if (filters.date_to && transaction.date > filters.date_to) {
      return false;
    }

    return true;
  });
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
  saveBulkTransactions: (ids: number[], payload: Omit<TransactionBulkUpdateRequest, 'ids'>) => Promise<void>;
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
    queryKey: [...DATA_MANAGEMENT_QUERY_KEY, appliedFilters],
    queryFn: async (): Promise<DataManagementData> => {
      const [allTransactions, uploadLogsResponse] = await Promise.all([
        loadAllTransactions(appliedFilters),
        getUploadLogs(),
      ]);
      const uploadHistory = ensureArray(uploadLogsResponse.items);
      const filteredTransactions = applyClientFilters(allTransactions, appliedFilters);

      const categoryOptions = Array.from(
        new Set(allTransactions.map((item) => item.effective_category_major).filter(Boolean)),
      ).sort();
      const paymentMethodOptions = Array.from(
        new Set(
          allTransactions
            .map((item) => item.payment_method)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort();

      return {
        filters: appliedFilters,
        has_pending_filter_changes: false,
        transactions: filteredTransactions,
        total: filteredTransactions.length,
        current_page: 1,
        page_size: DATA_MANAGEMENT_ROWS_PER_PAGE,
        total_pages: Math.max(
          1,
          Math.ceil(filteredTransactions.length / DATA_MANAGEMENT_ROWS_PER_PAGE),
        ),
        category_options: categoryOptions,
        payment_method_options: paymentMethodOptions,
        upload_history: uploadHistory,
        last_upload: lastUpload,
        has_write_access: hasApiKeyConfigured(),
      };
    },
    refetchOnMount: 'always',
    staleTime: 60 * 1000,
  });

  const invalidateTransactions = async () => {
    await queryClient.invalidateQueries({ queryKey: DATA_MANAGEMENT_QUERY_KEY });
  };

  const invalidateDependentQueries = async () => {
    await invalidateTransactions();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['assets-page'] }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('spending-'),
      }),
    ]);
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
      await invalidateTransactions();
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
      await invalidateDependentQueries();
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
    onSuccess: (result) => {
      setActionFeedback({
        variant: 'success',
        message: `선택한 거래 ${result.updated}건을 수정했습니다.`,
      });
    },
    onSettled: async () => {
      await invalidateTransactions();
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

  const paginatedData = useMemo(() => {
    if (!transactionsQuery.data) {
      return undefined;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(transactionsQuery.data.total / DATA_MANAGEMENT_ROWS_PER_PAGE),
    );
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const startIndex = (safeCurrentPage - 1) * DATA_MANAGEMENT_ROWS_PER_PAGE;

    return {
      ...transactionsQuery.data,
      filters: draftFilters,
      has_pending_filter_changes: !areFiltersEqual(draftFilters, appliedFilters),
      current_page: safeCurrentPage,
      total_pages: totalPages,
      transactions: transactionsQuery.data.transactions.slice(
        startIndex,
        startIndex + DATA_MANAGEMENT_ROWS_PER_PAGE,
      ),
    };
  }, [appliedFilters, currentPage, draftFilters, transactionsQuery.data]);

  return useMemo(
    () => ({
      ...transactionsQuery,
      data: paginatedData,
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
      bulkUpdateMutation,
      deleteMutation,
      paginatedData,
      pendingTransactionId,
      resetMutation,
      restoreMutation,
      transactionsQuery,
      updateMutation,
      uploadMutation,
      actionFeedback,
      draftFilters,
    ],
  );
}
