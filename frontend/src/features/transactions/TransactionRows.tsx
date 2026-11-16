import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { transactionApi } from '../../api/transactions'
import { ListSkeleton } from '../../ds/Skeleton'
import { formatSignedWon } from '../../ds/format'
import { TransactionEditor } from './TransactionEditor'

export interface TxRow {
  id: number
  date: string
  title: string
  sub: string
  amount: number
}

/** 거래 목록 — "고치기"를 누르면 이 화면 위에 편집 패널이 열린다(화면을 떠나지 않아 위치와 필터가 그대로다). */
export function TransactionRows({ rows, caption }: { rows: TxRow[]; caption: string }) {
  const [editingId, setEditingId] = useState<number | null>(null)
  if (rows.length === 0) return <p className="text-text-muted">해당하는 거래가 없습니다.</p>
  return (
    <>
      <ul aria-label={caption} className="divide-y divide-border-subtle rounded-md border border-border bg-bg-inset">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2 px-2.5 py-2">
            <span className="tnum w-[4.5rem] shrink-0 text-micro text-text-muted">{row.date}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label text-text-primary">{row.title}</span>
              <span className="block truncate text-micro text-text-muted">{row.sub}</span>
            </span>
            <span className="tnum shrink-0 text-label font-semibold text-text-primary">{formatSignedWon(row.amount)}</span>
            <button
              type="button"
              onClick={() => setEditingId(row.id)}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-sm text-micro font-medium text-transfer hover:underline"
              aria-label={`${row.title} ${row.date} 거래 고치기`}
            >
              <Pencil className="h-3 w-3" />
              고치기
            </button>
          </li>
        ))}
      </ul>
      {editingId !== null ? <TransactionEditor transactionId={editingId} onClose={() => setEditingId(null)} /> : null}
    </>
  )
}

/** 거래 번호 목록(약정의 연결 거래 등)을 불러와 같은 목록으로 보인다. */
export function TransactionIdRows({ ids, caption }: { ids: number[]; caption: string }) {
  const results = useQueries({
    queries: ids.map((id) => ({ queryKey: ['transactions', 'detail', id], queryFn: () => transactionApi.detail(id) })),
  })
  if (results.some((result) => result.isLoading)) return <ListSkeleton rows={Math.min(ids.length, 3)} />
  const failed = results.filter((result) => result.error).length
  const rows: TxRow[] = results
    .flatMap((result) => (result.data ? [result.data] : []))
    .map((tx) => ({
      id: tx.id,
      date: tx.date,
      title: tx.merchant,
      sub: [tx.effective_category_major, tx.effective_category_minor, tx.memo].filter(Boolean).join(' · '),
      amount: tx.amount,
    }))
  return (
    <div className="space-y-1.5">
      <TransactionRows rows={rows} caption={caption} />
      {failed > 0 ? <p className="text-caption text-warn">거래 {failed}건을 불러오지 못했습니다.</p> : null}
    </div>
  )
}
