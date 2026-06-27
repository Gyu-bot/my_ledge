import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Card } from '../../ds/Card'
import { Button } from '../../ds/Button'
import { Field, TextInput } from '../../ds/Field'
import { Badge } from '../../ds/Badge'
import { ConfirmDanger } from '../../ds/ConfirmDanger'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState } from '../../ds/States'
import { Provenance } from '../../ds/Provenance'
import { toast } from '../../ds/toastStore'
import { PageHeader } from '../../shell/PageHeader'
import { useApplyUploadPreview, useResetData, useUploadLogs, useUploadPreview } from '../../hooks/useUpload'
import { useCanonicalViewsDashboard } from '../../hooks/useCanonicalViews'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { DataResetScope, UploadPreviewResponse } from '../../types/upload'
import { ImportPreviewPanel } from './ImportPreviewPanel'
import { canApplyChange, changeKey, selectionFromChange } from './importPreviewModel'

const RESET_LABEL: Record<DataResetScope, string> = {
  transactions_only: '거래만 초기화',
  transactions_and_snapshots: '거래 + 스냅샷 초기화',
}

export function ImportPage() {
  const hasWrite = useWriteAccess()
  const previewUpload = useUploadPreview()
  const applyPreview = useApplyUploadPreview()
  const reset = useResetData()
  const logs = useUploadLogs(10)
  const canonical = useCanonicalViewsDashboard()

  const [file, setFile] = useState<File | null>(null)
  const [snapshotDate, setSnapshotDate] = useState('')
  const [preview, setPreview] = useState<UploadPreviewResponse | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
  const [resetScope, setResetScope] = useState<DataResetScope>('transactions_only')
  const [confirmOpen, setConfirmOpen] = useState(false)

  function selectFile(nextFile: File) {
    setFile(nextFile)
    setPreview(null)
    setSelectedKeys(new Set())
  }

  function changeSnapshotDate(nextSnapshotDate: string) {
    setSnapshotDate(nextSnapshotDate)
    setPreview(null)
    setSelectedKeys(new Set())
  }

  async function runPreview() {
    if (!file || !snapshotDate) return
    try {
      const result = await previewUpload.mutateAsync({ file, snapshotDate })
      setPreview(result)
      setSelectedKeys(new Set(result.safe_changes.filter(canApplyChange).map(changeKey)))
      toast.success('미리보기 생성 완료', {
        description: `안전 변경 ${result.summary.safe_change_count}건 · 검토 필요 ${result.summary.review_required_count}건`,
      })
    } catch (error) {
      toast.error('미리보기 실패', { description: String(error) })
    }
  }

  async function runApplyPreview() {
    if (!file || !snapshotDate || !preview) return
    const selections = [...preview.safe_changes, ...preview.review_required_changes]
      .filter((change) => selectedKeys.has(changeKey(change)))
      .map(selectionFromChange)
      .filter((selection) => selection !== null)

    if (selections.length === 0) return

    try {
      const result = await applyPreview.mutateAsync({ file, snapshotDate, selections })
      toast.success('선택 변경 적용 완료', {
        description: `선택 ${result.summary.selected_change_count}건 · 적용 ${result.summary.applied_change_count}건`,
      })
      setFile(null)
      setSnapshotDate('')
      setPreview(null)
      setSelectedKeys(new Set())
    } catch (error) {
      toast.error('적용 실패', { description: String(error) })
    }
  }

  async function runReset() {
    try {
      await reset.mutateAsync(resetScope)
      toast.success(`${RESET_LABEL[resetScope]} 완료`)
      setConfirmOpen(false)
    } catch (error) {
      toast.error('초기화 실패', { description: String(error) })
    }
  }

  const coverage = canonical.data?.data_coverage

  return (
    <>
      <PageHeader title="데이터 · 가져오기" meta={<span>업로드 · 이력 · 초기화</span>} />

      <div className="flex flex-col gap-4">
        <Card title="업로드" meta="BankSalad 엑셀 (.xlsx, 최대 20MB)">
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong py-7 text-center transition-colors duration-fast hover:bg-bg-inset"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const dropped = event.dataTransfer.files[0]
              if (dropped) selectFile(dropped)
            }}
          >
            <Upload className="h-5 w-5 text-text-muted" />
            <span className="text-label text-text-secondary">{file ? file.name : '파일을 드래그하거나 클릭해서 선택'}</span>
            <span className="text-micro text-text-faint">.xlsx</span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0]
                if (selectedFile) selectFile(selectedFile)
              }}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="스냅샷 기준일 (필수)">
              <TextInput
                type="date"
                value={snapshotDate}
                onInput={(event) => changeSnapshotDate(event.currentTarget.value)}
                onChange={(event) => changeSnapshotDate(event.target.value)}
              />
            </Field>
            <Button
              variant="primary"
              disabled={!hasWrite || !file || !snapshotDate || previewUpload.isPending}
              onClick={() => void runPreview()}
            >
              {previewUpload.isPending ? '미리보기 생성 중...' : '미리보기 생성'}
            </Button>
            {!snapshotDate && file ? <span className="pb-2 text-micro text-warn">스냅샷 기준일을 입력하세요</span> : null}
          </div>
        </Card>

        {preview ? (
          <ImportPreviewPanel
            preview={preview}
            selectedKeys={selectedKeys}
            pending={applyPreview.isPending}
            hasWrite={hasWrite}
            onToggle={(key) => {
              setSelectedKeys((current) => {
                const next = new Set(current)
                if (next.has(key)) {
                  next.delete(key)
                } else {
                  next.add(key)
                }
                return next
              })
            }}
            onApply={() => void runApplyPreview()}
          />
        ) : null}

        <Card
          title="최근 업로드 이력"
          meta={
            coverage ? (
              <span className="inline-flex items-center gap-1.5">
                관측 범위 {coverage.first_transaction_date ?? '—'} ~ {coverage.last_transaction_date ?? '—'}
                <Provenance title="관측 데이터 범위" note="이 범위 밖의 월은 미완성으로 표시됩니다." />
              </span>
            ) : '최근 10건'
          }
          bodyClassName="p-0"
        >
          {logs.isLoading ? <div className="p-4"><ListSkeleton rows={4} /></div> :
           logs.data && logs.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[520px] w-full border-collapse text-label">
                <thead className="bg-bg-inset">
                  <tr>
                    {['파일명', '상태', '신규', '스킵', '기준일', '시각'].map((header) => (
                      <th key={header} className="px-4 py-2 text-left text-micro font-medium text-text-muted">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {logs.data.items.map((log) => (
                    <tr key={log.id}>
                      <td className="max-w-[180px] truncate px-4 py-2 text-text-primary">{log.filename ?? '—'}</td>
                      <td className="px-4 py-2">
                        <Badge variant={log.status === 'failed' ? 'expense' : log.status === 'partial' ? 'warn' : 'accent'}>
                          {log.status ?? '—'}
                        </Badge>
                      </td>
                      <td className="tnum px-4 py-2 text-income">+{log.tx_new ?? 0}</td>
                      <td className="tnum px-4 py-2 text-text-muted">{log.tx_skipped ?? 0}</td>
                      <td className="tnum px-4 py-2 text-text-muted">{log.snapshot_date ?? '—'}</td>
                      <td className="tnum px-4 py-2 text-right text-text-faint">{log.uploaded_at.slice(0, 16).replace('T', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState className="py-8" message="업로드 이력이 없습니다" />}
        </Card>

        <Card title="Danger Zone" meta="되돌릴 수 없습니다 · 업로드 이력은 보존됩니다" className="border-expense-border">
          <div className="grid gap-2 sm:grid-cols-2">
            {(['transactions_only', 'transactions_and_snapshots'] as DataResetScope[]).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setResetScope(scope)}
                className={`rounded-md border px-3 py-2.5 text-left text-caption transition-colors duration-fast ${
                  resetScope === scope ? 'border-expense bg-expense-bg text-expense' : 'border-border text-text-muted'
                }`}
              >
                <div className="font-semibold">{RESET_LABEL[scope]}</div>
                <div className="mt-0.5 text-micro opacity-80">
                  {scope === 'transactions_only' ? '거래 내역만 삭제, 스냅샷 유지' : '거래 + 자산·보험·투자·대출 스냅샷 삭제'}
                </div>
              </button>
            ))}
          </div>
          <Button
            variant="danger"
            className="mt-3 w-full"
            disabled={!hasWrite}
            onClick={() => setConfirmOpen(true)}
          >
            초기화 실행
          </Button>
        </Card>
      </div>

      <ConfirmDanger
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={RESET_LABEL[resetScope]}
        description={
          resetScope === 'transactions_and_snapshots'
            ? '거래 내역과 자산·보험·투자·대출 스냅샷이 모두 삭제됩니다.'
            : '거래 내역만 삭제됩니다. 자산 스냅샷은 유지됩니다.'
        }
        confirmPhrase={RESET_LABEL[resetScope]}
        confirmLabel="초기화 실행"
        pending={reset.isPending}
        onConfirm={() => void runReset()}
      />
    </>
  )
}
