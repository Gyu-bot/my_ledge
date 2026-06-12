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
import { useResetData, useUploadFile, useUploadLogs } from '../../hooks/useUpload'
import { useCanonicalViewsDashboard } from '../../hooks/useCanonicalViews'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { DataResetScope } from '../../types/upload'

const RESET_LABEL: Record<DataResetScope, string> = {
  transactions_only: '거래만 초기화',
  transactions_and_snapshots: '거래 + 스냅샷 초기화',
}

export function ImportPage() {
  const hasWrite = useWriteAccess()
  const upload = useUploadFile()
  const reset = useResetData()
  const logs = useUploadLogs(10)
  const canonical = useCanonicalViewsDashboard()

  const [file, setFile] = useState<File | null>(null)
  const [snapshotDate, setSnapshotDate] = useState('')
  const [resetScope, setResetScope] = useState<DataResetScope>('transactions_only')
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function runUpload() {
    if (!file || !snapshotDate) return
    try {
      const result = await upload.mutateAsync({ file, snapshotDate })
      if (result.status === 'failed') {
        toast.error('업로드 실패', { description: result.error_message ?? undefined })
      } else {
        const s = result.snapshots
        toast.success(`업로드 ${result.status === 'partial' ? '부분 ' : ''}완료`, {
          description: `거래 신규 ${result.transactions.new} · 스킵 ${result.transactions.skipped} / 스냅샷 자산 ${s.asset_snapshots}·보험 ${s.insurance_contracts}·투자 ${s.investments}·대출 ${s.loans}`,
        })
        setFile(null)
        setSnapshotDate('')
      }
    } catch (error) {
      toast.error('업로드 실패', { description: String(error) })
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
              if (dropped) setFile(dropped)
            }}
          >
            <Upload className="h-5 w-5 text-text-muted" />
            <span className="text-label text-text-secondary">{file ? file.name : '파일을 드래그하거나 클릭해서 선택'}</span>
            <span className="text-micro text-text-faint">.xlsx</span>
            <input type="file" accept=".xlsx" className="hidden" onChange={(event) => event.target.files?.[0] && setFile(event.target.files[0])} />
          </label>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="스냅샷 기준일 (필수)">
              <TextInput type="date" value={snapshotDate} onChange={(event) => setSnapshotDate(event.target.value)} />
            </Field>
            <Button
              variant="primary"
              disabled={!hasWrite || !file || !snapshotDate || upload.isPending}
              onClick={() => void runUpload()}
            >
              {upload.isPending ? '업로드 중…' : '업로드 실행'}
            </Button>
            {!snapshotDate && file ? <span className="pb-2 text-micro text-warn">스냅샷 기준일을 입력하세요</span> : null}
          </div>
        </Card>

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
            <table className="w-full border-collapse text-label">
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
