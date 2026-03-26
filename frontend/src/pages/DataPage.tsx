import { useState } from 'react';
import { EditableTransactionsTable } from '../components/data/EditableTransactionsTable';
import {
  DataManagementFilterBar,
  type DataManagementFilterValues,
} from '../components/data/DataManagementFilterBar';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import { PageHeader } from '../components/layout/PageHeader';
import { useDataManagement } from '../hooks/useDataManagement';

export function DataPage() {
  const dataManagementQuery = useDataManagement();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [snapshotDate, setSnapshotDate] = useState('');

  if (dataManagementQuery.isPending) {
    return (
      <LoadingState
        title="데이터 관리 화면 불러오는 중"
        description="업로드 작업 공간과 거래 편집 데이터를 준비하고 있습니다."
      />
    );
  }

  if (dataManagementQuery.isError) {
    return (
      <ErrorState
        title="데이터 관리 화면을 불러올 수 없습니다"
        description="거래 목록 또는 업로드 작업 공간을 구성하는 데 실패했습니다."
        detail={dataManagementQuery.error instanceof Error ? dataManagementQuery.error.message : undefined}
      />
    );
  }

  if (!dataManagementQuery.data) {
    return (
      <EmptyState
        title="표시할 데이터 관리 항목이 없습니다"
        description="거래 데이터가 적재되면 업로드와 편집 작업 공간을 표시합니다."
      />
    );
  }

  const {
    category_options,
    filters,
    has_write_access,
    last_upload,
    payment_method_options,
    total,
    transactions,
  } = dataManagementQuery.data;

  const handleUpload = async () => {
    if (!selectedFile) {
      return;
    }

    await dataManagementQuery.uploadWorkbookFile(selectedFile, snapshotDate || undefined);
    setSelectedFile(null);
    setSnapshotDate('');
  };

  const uploadButtonLabel = dataManagementQuery.isUploading ? '업로드 중...' : '업로드 실행';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="데이터"
        title="데이터 관리"
        description="엑셀 업로드 결과를 확인하고, 거래 카테고리와 메모를 직접 정리합니다."
      />

      {!has_write_access ? (
        <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm leading-6 text-amber-900 shadow-[var(--shadow-soft)]">
          현재 `VITE_API_KEY`가 설정되지 않아 업로드와 수정, 삭제, 복원 동작은 비활성화됩니다.
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(21rem,0.9fr)]">
        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-[color:var(--color-text)]">엑셀 업로드</h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
                BankSalad 내보내기 파일을 올려 거래와 스냅샷을 다시 적재합니다.
              </p>
            </div>
            <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[color:var(--color-text-subtle)]">
              import
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
            <label className="space-y-2">
              <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                엑셀 파일
              </span>
              <input
                type="file"
                accept=".xlsx,.xlsm"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="block w-full rounded-2xl border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm text-[color:var(--color-text)] file:mr-4 file:rounded-full file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                스냅샷 기준일
              </span>
              <input
                type="date"
                value={snapshotDate}
                onChange={(event) => setSnapshotDate(event.target.value)}
                className="w-full rounded-2xl border border-[color:var(--color-border)] bg-white/90 px-4 py-3 text-sm text-[color:var(--color-text)] outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {selectedFile ? `${selectedFile.name} 선택됨` : '아직 선택된 파일이 없습니다.'}
            </div>
            <button
              type="button"
              disabled={!has_write_access || !selectedFile || dataManagementQuery.isUploading}
              onClick={() => void handleUpload()}
              className="inline-flex items-center justify-center rounded-full bg-[color:var(--color-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {uploadButtonLabel}
            </button>
          </div>

          {dataManagementQuery.uploadError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
              {dataManagementQuery.uploadError.message}
            </div>
          ) : null}
        </article>

        <article className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-[color:var(--color-text)]">최근 업로드 결과</h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
                이 세션에서 마지막으로 실행한 업로드 결과를 요약합니다.
              </p>
            </div>
          </div>

          {last_upload ? (
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/85 p-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  상태
                </p>
                <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text)]">
                  {last_upload.status}
                </p>
                <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                  업로드 ID {last_upload.upload_id}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/85 p-4">
                  <p className="text-sm font-semibold text-[color:var(--color-text)]">거래</p>
                  <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                    전체 {last_upload.transactions.total}건
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                    신규 {last_upload.transactions.new}건, 스킵 {last_upload.transactions.skipped}건
                  </p>
                </div>
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-white/85 p-4">
                  <p className="text-sm font-semibold text-[color:var(--color-text)]">스냅샷</p>
                  <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                    자산 {last_upload.snapshots.asset_snapshots}건
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                    투자 {last_upload.snapshots.investments}건, 대출 {last_upload.snapshots.loans}건
                  </p>
                </div>
              </div>
              {last_upload.error_message ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
                  {last_upload.error_message}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-[color:var(--color-border)] bg-white/70 px-4 py-6 text-sm leading-6 text-[color:var(--color-text-muted)]">
              아직 이 세션에서 실행된 업로드가 없습니다. 파일을 선택해 업로드하면 결과 요약이 여기에 표시됩니다.
            </div>
          )}
        </article>
      </section>

      <DataManagementFilterBar
        values={filters}
        categoryOptions={category_options}
        paymentMethodOptions={payment_method_options}
        onApply={(next: DataManagementFilterValues) => dataManagementQuery.updateFilters(next)}
        onReset={dataManagementQuery.resetFilters}
      />

      <section className="rounded-[1.75rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-[color:var(--color-text)]">거래 편집 작업대</h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">
              사용자 카테고리, 메모, 삭제/복원 상태를 직접 조정합니다.
            </p>
          </div>
          <p className="text-xs tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            총 {total}건 중 {transactions.length}건 표시
          </p>
        </div>
        <div className="mt-6">
          <EditableTransactionsTable
            rows={transactions}
            categoryOptions={category_options}
            hasWriteAccess={has_write_access}
            pendingTransactionId={dataManagementQuery.pendingTransactionId}
            onSave={dataManagementQuery.saveTransaction}
            onDelete={dataManagementQuery.deleteTransactionRow}
            onRestore={dataManagementQuery.restoreTransactionRow}
          />
        </div>
      </section>
    </div>
  );
}
