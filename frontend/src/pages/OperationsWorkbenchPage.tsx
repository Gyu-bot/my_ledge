import { useMemo, useState } from 'react';
import type { DataResetScope } from '../api/dataManagement';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { IconTitle } from '../components/common/IconTitle';
import { LoadingState } from '../components/common/LoadingState';
import {
  DataManagementFilterBar,
  type DataManagementFilterValues,
} from '../components/data/DataManagementFilterBar';
import { EditableTransactionsTable } from '../components/data/EditableTransactionsTable';
import { useAppChromeMeta } from '../components/layout/AppChromeContext';
import { OperationsAccordions } from '../components/operations/OperationsAccordions';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { useDataManagement } from '../hooks/useDataManagement';

export function OperationsWorkbenchPage() {
  const dataManagementQuery = useDataManagement();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [snapshotDate, setSnapshotDate] = useState('');
  const [resetScope, setResetScope] = useState<DataResetScope>('transactions_only');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const chromeMeta = useMemo(
    () =>
      dataManagementQuery.data ? (
        <Badge variant="reference">
          표시 {dataManagementQuery.data.transactions.length} / 전체 {dataManagementQuery.data.total}
        </Badge>
      ) : null,
    [dataManagementQuery.data],
  );
  useAppChromeMeta(chromeMeta);

  if (dataManagementQuery.isPending) {
    return (
      <LoadingState
        title="거래 작업대 불러오는 중"
        description="운영 섹션에 필요한 거래 편집 데이터와 업로드 상태를 준비하고 있습니다."
      />
    );
  }

  if (dataManagementQuery.isError) {
    return (
      <ErrorState
        title="거래 작업대를 불러올 수 없습니다"
        description="거래 목록 또는 운영 보조 도구를 구성하는 데 실패했습니다."
        detail={dataManagementQuery.error instanceof Error ? dataManagementQuery.error.message : undefined}
      />
    );
  }

  if (!dataManagementQuery.data) {
    return (
      <EmptyState
        title="표시할 운영 데이터가 없습니다"
        description="거래 데이터가 적재되면 작업대와 업로드 보조 도구를 표시합니다."
      />
    );
  }

  const {
    upload_history,
    category_options,
    filters,
    has_write_access,
    last_upload,
    payment_method_options,
    total,
    transactions,
    current_page,
    total_pages,
    page_size,
  } = dataManagementQuery.data;

  const handleUpload = async () => {
    if (!selectedFile || !snapshotDate) {
      return;
    }

    await dataManagementQuery.uploadWorkbookFile(selectedFile, snapshotDate);
    setSelectedFile(null);
    setSnapshotDate('');
  };

  const handleReset = async () => {
    const resetConfirmationText =
      resetScope === 'transactions_only' ? '거래초기화' : '전체초기화';

    if (resetConfirmation !== resetConfirmationText) {
      return;
    }

    await dataManagementQuery.resetDataScope(resetScope);
    setResetConfirmation('');
  };

  const pageStart = total === 0 ? 0 : (current_page - 1) * page_size + 1;
  const pageEnd = total === 0 ? 0 : Math.min(current_page * page_size, total);

  return (
    <div className="space-y-5">
      {!has_write_access ? (
        <Alert variant="warning">
          현재 runtime API key가 설정되지 않아 업로드와 수정, 삭제, 복원 동작은 비활성화됩니다.
        </Alert>
      ) : null}

      {dataManagementQuery.actionFeedback ? (
        <Alert
          variant={
            dataManagementQuery.actionFeedback.variant === 'success'
              ? 'default'
              : dataManagementQuery.actionFeedback.variant
          }
        >
          {dataManagementQuery.actionFeedback.message}
        </Alert>
      ) : null}

      <section className="space-y-4">
        <DataManagementFilterBar
          categoryOptions={category_options}
          hasPendingChanges={dataManagementQuery.data.has_pending_filter_changes}
          onApply={dataManagementQuery.applyFilters}
          onChange={(next: DataManagementFilterValues) => dataManagementQuery.updateFilters(next)}
          onReset={dataManagementQuery.resetFilters}
          paymentMethodOptions={payment_method_options}
          values={filters}
        />

        <Card>
          <CardHeader>
            <IconTitle
              description="필터 결과 전체를 페이지 단위로 끝까지 탐색하면서 거래를 수정하거나 삭제·복원합니다."
              icon="operations"
              title="거래 편집 작업대"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <EditableTransactionsTable
              categoryOptions={category_options}
              hasWriteAccess={has_write_access}
              isBulkSaving={dataManagementQuery.isBulkSaving}
              onBulkSave={dataManagementQuery.saveBulkTransactions}
              onDelete={dataManagementQuery.deleteTransactionRow}
              onRestore={dataManagementQuery.restoreTransactionRow}
              onSave={dataManagementQuery.saveTransaction}
              pendingTransactionId={dataManagementQuery.pendingTransactionId}
              rows={transactions}
            />

            <div className="flex flex-col gap-3 border-t border-[color:var(--color-border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[color:var(--color-text-muted)]">
                총 {total}건 중 {pageStart} - {pageEnd}건 표시
              </p>
              <div className="flex items-center gap-2">
                <Button
                  disabled={current_page <= 1}
                  onClick={() => dataManagementQuery.setPage(current_page - 1)}
                  type="button"
                  variant="outline"
                >
                  이전 페이지
                </Button>
                <div className="min-w-[6rem] rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-3 py-2 text-center text-sm text-[color:var(--color-text)]">
                  {current_page} / {total_pages}
                </div>
                <Button
                  disabled={current_page >= total_pages}
                  onClick={() => dataManagementQuery.setPage(current_page + 1)}
                  type="button"
                  variant="outline"
                >
                  다음 페이지
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <OperationsAccordions
        hasWriteAccess={has_write_access}
        isResetting={dataManagementQuery.isResetting}
        isUploading={dataManagementQuery.isUploading}
        lastUpload={last_upload}
        onReset={handleReset}
        onResetConfirmationChange={setResetConfirmation}
        onResetScopeChange={setResetScope}
        onSelectedFileChange={setSelectedFile}
        onSnapshotDateChange={setSnapshotDate}
        onUpload={handleUpload}
        resetConfirmation={resetConfirmation}
        resetScope={resetScope}
        selectedFile={selectedFile}
        snapshotDate={snapshotDate}
        uploadError={dataManagementQuery.uploadError}
        uploadHistory={upload_history}
      />
    </div>
  );
}
