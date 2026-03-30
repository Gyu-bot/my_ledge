import { useState } from 'react';
import type { DataResetScope } from '../api/dataManagement';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/common/LoadingState';
import {
  DataManagementFilterBar,
  type DataManagementFilterValues,
} from '../components/data/DataManagementFilterBar';
import { EditableTransactionsTable } from '../components/data/EditableTransactionsTable';
import { PageHeader } from '../components/layout/PageHeader';
import { SectionPlaceholder } from '../components/common/SectionPlaceholder';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useDataManagement } from '../hooks/useDataManagement';

export function DataPage() {
  const dataManagementQuery = useDataManagement();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [snapshotDate, setSnapshotDate] = useState('');
  const [resetScope, setResetScope] = useState<DataResetScope>('transactions_only');
  const [resetConfirmation, setResetConfirmation] = useState('');

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
    upload_history,
    category_options,
    filters,
    has_write_access,
    last_upload,
    payment_method_options,
    total,
    transactions,
  } = dataManagementQuery.data;

  const handleUpload = async () => {
    if (!selectedFile || !snapshotDate) {
      return;
    }

    await dataManagementQuery.uploadWorkbookFile(selectedFile, snapshotDate);
    setSelectedFile(null);
    setSnapshotDate('');
  };

  const uploadButtonLabel = dataManagementQuery.isUploading ? '업로드 중...' : '업로드 실행';
  const resetButtonLabel = dataManagementQuery.isResetting ? '초기화 중...' : '초기화 실행';
  const resetConfirmationText =
    resetScope === 'transactions_only' ? '거래초기화' : '전체초기화';

  const handleReset = async () => {
    if (resetConfirmation !== resetConfirmationText) {
      return;
    }

    await dataManagementQuery.resetDataScope(resetScope);
    setResetConfirmation('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="데이터"
        title="데이터 관리"
        description="엑셀 업로드 결과를 확인하고, 거래 카테고리와 메모를 직접 정리합니다."
      />

      {!has_write_access ? (
        <Alert variant="warning">
          현재 `VITE_API_KEY`가 설정되지 않아 업로드와 수정, 삭제, 복원 동작은 비활성화됩니다.
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(21rem,0.9fr)]">
        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle>엑셀 업로드</CardTitle>
              <CardDescription className="mt-2">
                BankSalad 내보내기 파일을 올려 거래와 스냅샷을 다시 적재합니다.
              </CardDescription>
            </div>
            <Badge>import</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  엑셀 파일
                </span>
                <Input
                  accept=".xlsx,.xlsm"
                  className="block w-full file:mr-4 file:rounded-[var(--radius-xs)] file:border-0 file:bg-[color:var(--color-accent)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  스냅샷 기준일
                </span>
                <Input
                  onChange={(event) => setSnapshotDate(event.target.value)}
                  type="date"
                  value={snapshotDate}
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {selectedFile ? `${selectedFile.name} 선택됨` : '아직 선택된 파일이 없습니다.'}
              </div>
              <Button
                disabled={!has_write_access || !selectedFile || !snapshotDate || dataManagementQuery.isUploading}
                onClick={() => void handleUpload()}
                type="button"
              >
                {uploadButtonLabel}
              </Button>
            </div>

            {dataManagementQuery.uploadError ? (
              <Alert variant="destructive">{dataManagementQuery.uploadError.message}</Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>최근 업로드 결과</CardTitle>
              <CardDescription className="mt-2">
                이 세션에서 마지막으로 실행한 업로드 결과를 요약합니다.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {last_upload ? (
              <div className="space-y-3">
                <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-white/85 p-4">
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
                  <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-white/85 p-4">
                    <p className="text-sm font-semibold text-[color:var(--color-text)]">거래</p>
                    <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                      전체 {last_upload.transactions.total}건
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                      신규 {last_upload.transactions.new}건, 스킵 {last_upload.transactions.skipped}건
                    </p>
                  </div>
                  <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-white/85 p-4">
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
                  <Alert variant="destructive">{last_upload.error_message}</Alert>
                ) : null}
              </div>
            ) : (
              <SectionPlaceholder
                title="최근 업로드 없음"
                description="파일을 선택해 업로드하면 결과 요약이 여기에 표시됩니다."
              />
            )}

            {upload_history.length > 0 ? (
              <div className="mt-5 space-y-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                    서버 저장 최근 10건
                  </p>
                </div>
                <div className="space-y-2">
                  {upload_history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white/80 px-3 py-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-[color:var(--color-text)]">
                          {item.filename ?? `upload-${item.id}`}
                        </p>
                        <Badge variant={item.status === 'failed' ? 'destructive' : 'secondary'}>
                          {item.status ?? 'unknown'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[color:var(--color-text-muted)]">
                        거래 {item.tx_new ?? 0}건 신규 / {item.tx_skipped ?? 0}건 스킵
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--color-text-subtle)]">
                        기준일 {item.snapshot_date ?? '미지정'} · 업로드 {item.uploaded_at}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Card className="border-rose-200/80 bg-rose-50/70">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>Danger Zone</CardTitle>
            <CardDescription className="mt-2">
              거래만 비우거나 스냅샷까지 함께 초기화할 수 있습니다. 업로드 이력은 유지됩니다.
            </CardDescription>
          </div>
          <Badge variant="destructive">reset</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
            <label className="space-y-2">
              <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                초기화 범위
              </span>
              <select
                className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text)]"
                onChange={(event) => setResetScope(event.target.value as DataResetScope)}
                value={resetScope}
              >
                <option value="transactions_only">거래내역만 초기화</option>
                <option value="transactions_and_snapshots">거래 + 스냅샷 전체 초기화</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                확인 문구
              </span>
              <Input
                onChange={(event) => setResetConfirmation(event.target.value)}
                placeholder={`실행하려면 ${resetConfirmationText} 입력`}
                value={resetConfirmation}
              />
            </label>

            <div className="flex items-end">
              <Button
                disabled={
                  !has_write_access ||
                  dataManagementQuery.isResetting ||
                  resetConfirmation !== resetConfirmationText
                }
                onClick={() => void handleReset()}
                type="button"
                variant="destructive"
              >
                {resetButtonLabel}
              </Button>
            </div>
          </div>

          <Alert variant="warning">
            {resetScope === 'transactions_only'
              ? '거래 테이블만 비웁니다. 자산/투자/대출 스냅샷과 업로드 이력은 유지됩니다.'
              : '거래와 자산/투자/대출 스냅샷을 모두 비웁니다. 업로드 이력은 유지됩니다.'}
          </Alert>
        </CardContent>
      </Card>

      <DataManagementFilterBar
        values={filters}
        categoryOptions={category_options}
        paymentMethodOptions={payment_method_options}
        onApply={(next: DataManagementFilterValues) => dataManagementQuery.updateFilters(next)}
        onReset={dataManagementQuery.resetFilters}
      />

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>거래 편집 작업대</CardTitle>
            <CardDescription className="mt-2">
              사용자 카테고리, 메모, 삭제/복원 상태를 직접 조정합니다.
            </CardDescription>
          </div>
          <p className="text-xs tracking-[0.16em] text-[color:var(--color-text-subtle)]">
            총 {total}건 중 {transactions.length}건 표시
          </p>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <EditableTransactionsTable
              rows={transactions}
              categoryOptions={category_options}
              hasWriteAccess={has_write_access}
              pendingTransactionId={dataManagementQuery.pendingTransactionId}
              onSave={dataManagementQuery.saveTransaction}
              onDelete={dataManagementQuery.deleteTransactionRow}
              onRestore={dataManagementQuery.restoreTransactionRow}
            />
          ) : (
            <SectionPlaceholder
              title="표시할 거래가 없습니다"
              description="현재 필터 조건에 맞는 거래가 없거나, 아직 거래 데이터가 적재되지 않았습니다."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
