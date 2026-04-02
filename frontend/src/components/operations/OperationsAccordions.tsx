import type { Dispatch, SetStateAction } from 'react';
import type { DataResetScope } from '../../api/dataManagement';
import type { UploadLogResponse, UploadResponse } from '../../api/upload';
import { SectionPlaceholder } from '../common/SectionPlaceholder';
import { Alert } from '../ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface OperationsAccordionsProps {
  hasWriteAccess: boolean;
  selectedFile: File | null;
  onSelectedFileChange: Dispatch<SetStateAction<File | null>>;
  snapshotDate: string;
  onSnapshotDateChange: Dispatch<SetStateAction<string>>;
  onUpload: () => Promise<void>;
  isUploading: boolean;
  uploadError: Error | null;
  lastUpload: UploadResponse | null;
  uploadHistory: UploadLogResponse[];
  resetScope: DataResetScope;
  onResetScopeChange: Dispatch<SetStateAction<DataResetScope>>;
  resetConfirmation: string;
  onResetConfirmationChange: Dispatch<SetStateAction<string>>;
  onReset: () => Promise<void>;
  isResetting: boolean;
}

function UploadResultSummary({ lastUpload }: { lastUpload: UploadResponse | null }) {
  if (!lastUpload) {
    return (
      <SectionPlaceholder
        title="최근 업로드 없음"
        description="파일을 선택해 업로드하면 결과 요약이 이 아코디언 안에 표시됩니다."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[color:var(--color-text)]">
            최근 업로드 상태
          </p>
          <Badge variant={lastUpload.status === 'failed' ? 'destructive' : 'secondary'}>
            {lastUpload.status}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
          업로드 ID {lastUpload.upload_id}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-white/85 p-4 text-sm text-[color:var(--color-text-muted)]">
          <p className="font-semibold text-[color:var(--color-text)]">거래</p>
          <p className="mt-2">전체 {lastUpload.transactions.total}건</p>
          <p className="mt-1">
            신규 {lastUpload.transactions.new}건, 스킵 {lastUpload.transactions.skipped}건
          </p>
        </div>
        <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-white/85 p-4 text-sm text-[color:var(--color-text-muted)]">
          <p className="font-semibold text-[color:var(--color-text)]">스냅샷</p>
          <p className="mt-2">자산 {lastUpload.snapshots.asset_snapshots}건</p>
          <p className="mt-1">
            투자 {lastUpload.snapshots.investments}건, 대출 {lastUpload.snapshots.loans}건
          </p>
        </div>
      </div>
      {lastUpload.error_message ? (
        <Alert variant="destructive">{lastUpload.error_message}</Alert>
      ) : null}
    </div>
  );
}

export function OperationsAccordions({
  hasWriteAccess,
  selectedFile,
  onSelectedFileChange,
  snapshotDate,
  onSnapshotDateChange,
  onUpload,
  isUploading,
  uploadError,
  lastUpload,
  uploadHistory,
  resetScope,
  onResetScopeChange,
  resetConfirmation,
  onResetConfirmationChange,
  onReset,
  isResetting,
}: OperationsAccordionsProps) {
  const uploadButtonLabel = isUploading ? '업로드 중...' : '업로드 실행';
  const resetButtonLabel = isResetting ? '초기화 중...' : '초기화 실행';
  const resetConfirmationText =
    resetScope === 'transactions_only' ? '거래초기화' : '전체초기화';

  return (
    <Accordion className="space-y-3" collapsible type="single">
      <AccordionItem value="upload">
        <AccordionTrigger>업로드</AccordionTrigger>
        <AccordionContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">엑셀 업로드</h3>
              <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                BankSalad 내보내기 파일을 올려 거래와 스냅샷을 다시 적재합니다.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  엑셀 파일
                </span>
                <Input
                  accept=".xlsx,.xlsm"
                  className="block w-full file:mr-4 file:rounded-[var(--radius-xs)] file:border-0 file:bg-[color:var(--color-accent)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                  onChange={(event) => onSelectedFileChange(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                  스냅샷 기준일
                </span>
                <Input
                  onChange={(event) => onSnapshotDateChange(event.target.value)}
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
                disabled={!hasWriteAccess || !selectedFile || !snapshotDate || isUploading}
                onClick={() => void onUpload()}
                type="button"
              >
                {uploadButtonLabel}
              </Button>
            </div>

            {uploadError ? <Alert variant="destructive">{uploadError.message}</Alert> : null}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
              최근 업로드 결과
            </p>
            <UploadResultSummary lastUpload={lastUpload} />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="history">
        <AccordionTrigger>최근 업로드 이력</AccordionTrigger>
        <AccordionContent>
          {uploadHistory.length > 0 ? (
            <div className="space-y-2">
              {uploadHistory.map((item) => (
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
          ) : (
            <SectionPlaceholder
              title="업로드 이력 없음"
              description="서버에 저장된 최근 업로드 이력이 아직 없습니다."
            />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        className="border-[color:var(--color-danger-soft)] bg-[color:var(--color-danger-soft)]/35"
        value="danger"
      >
        <AccordionTrigger className="text-[color:var(--color-danger)] hover:text-[color:var(--color-danger)]">
          Danger Zone
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Danger Zone</h3>
            <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
              거래만 지우거나 스냅샷까지 포함해 전체 데이터를 초기화합니다. 업로드 이력은 유지됩니다.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="space-y-2">
              <span className="text-xs font-semibold tracking-[0.16em] text-[color:var(--color-text-subtle)]">
                초기화 범위
              </span>
              <select
                className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text)]"
                onChange={(event) =>
                  onResetScopeChange(event.target.value as DataResetScope)
                }
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
                onChange={(event) => onResetConfirmationChange(event.target.value)}
                placeholder={`실행하려면 ${resetConfirmationText} 입력`}
                value={resetConfirmation}
              />
            </label>
          </div>

          <Button
            className="w-full sm:w-auto"
            disabled={!hasWriteAccess || resetConfirmation !== resetConfirmationText || isResetting}
            onClick={() => void onReset()}
            type="button"
            variant="destructive"
          >
            {resetButtonLabel}
          </Button>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
