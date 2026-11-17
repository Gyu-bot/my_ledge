import { writeErrorMessage } from '../analysis/text'
import { useState } from 'react'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Field, TextInput, Toggle } from '../../ds/Field'
import { EmptyState, ErrorState } from '../../ds/States'
import { ListSkeleton } from '../../ds/Skeleton'
import { formatWon } from '../../ds/format'
import { toast } from '../../ds/toastStore'
import { useCreatePlanFromCandidate, useInstallmentPlanCandidates, useReviewInstallmentCandidate } from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { InstallmentPlanCandidate } from '../../types/transaction'

function CandidateRow({ item }: { item: InstallmentPlanCandidate }) {
  const hasWrite = useWriteAccess()
  const create = useCreatePlanFromCandidate()
  const review = useReviewInstallmentCandidate()
  const [name, setName] = useState(item.merchant)
  const [first, setFirst] = useState(item.first_payment_date)
  const [total, setTotal] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const valid = name.trim() && first && Number.isInteger(Number(total)) && Number(total) >= item.observed_count && Number(total) <= 120
  const disabled = !hasWrite || create.isPending || review.isPending
  async function save() {
    if (!valid || !confirmed) return
    try {
      const result = await create.mutateAsync({ key: item.series_key, data: { display_name: name.trim(), first_payment_date: first, total_installments: Number(total), transaction_ids: item.transaction_ids } })
      toast.success('할부 계획과 관측 거래를 연결했습니다', { description: `${result.linked_installment_count}건 · 총 ${result.total_installments}회` })
    } catch (error) { toast.error('할부 계획 생성 실패', { description: writeErrorMessage(error) }) }
  }
  async function setReview(status: 'pending' | 'not_installment') {
    try {
      await review.mutateAsync({ key: item.series_key, status })
      toast.success(status === 'pending' ? '할부 후보를 복원했습니다' : '할부 아님으로 기록했습니다')
    } catch (error) { toast.error('후보 검토 저장 실패', { description: writeErrorMessage(error) }) }
  }
  return <div className="space-y-3 border-t border-border-subtle p-4">
    <div className="flex flex-wrap items-center gap-2"><span className="text-label font-semibold text-text-primary">{item.merchant}</span><Badge variant="neutral">{item.observed_count}회 연속 관측</Badge>{item.review_status === 'not_installment' && <Badge variant="neutral">할부 아님</Badge>}</div>
    <p className="text-caption text-text-muted">{item.payment_method} · 월 {formatWon(item.monthly_amount)} · {item.first_observed_date} ~ {item.last_observed_date}</p>
    {item.starts_at_data_window_edge && <p className="text-caption text-warn">자료 시작 경계의 연속 결제입니다. 이전 회차가 있을 수 있으니 첫 납부일을 확인하세요.</p>}
    {item.review_status === 'not_installment' ? <Button disabled={disabled} onClick={() => void setReview('pending')}>후보 복원</Button> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="계획명"><TextInput disabled={disabled} value={name} onChange={(event) => { setName(event.target.value); setConfirmed(false) }} /></Field>
        <Field label="첫 납부일"><TextInput type="date" disabled={disabled} value={first} onChange={(event) => { setFirst(event.target.value); setConfirmed(false) }} /></Field>
        <Field label="총 할부 횟수" hint="직접 입력 · 총 횟수는 추정하지 않습니다"><TextInput type="number" min={item.observed_count} max={120} required disabled={disabled} placeholder="총 횟수 입력" value={total} onChange={(event) => { setTotal(event.target.value); setConfirmed(false) }} /></Field>
      </div>
      <label className="flex items-start gap-2 text-caption text-text-secondary"><input type="checkbox" disabled={disabled || !valid} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{item.observed_count}건의 관측 거래를 이 계획의 회차에 연결할 것을 확인했습니다.</span></label>
      <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={disabled || !valid || !confirmed} onClick={() => void save()}>계획 생성 및 {item.observed_count}건 연결</Button><Button variant="ghost" disabled={disabled} onClick={() => void setReview('not_installment')}>할부 아님</Button></div>
    </>}
  </div>
}

export function InstallmentCandidatesCard() {
  const [includeDismissed, setIncludeDismissed] = useState(false)
  const candidates = useInstallmentPlanCandidates(includeDismissed)
  return <Card title="할부 후보" meta="3개월 이상 연속 결제 관측 · 정기 구독일 수도 있습니다. 사람이 확인한 뒤 등록합니다." action={<Toggle label="기각 후보 포함" checked={includeDismissed} onChange={setIncludeDismissed} />} bodyClassName="p-0">
    {candidates.isLoading ? <div className="p-4"><ListSkeleton rows={2} /></div> : candidates.isError ? <ErrorState message="할부 후보를 불러오지 못했습니다" onRetry={() => void candidates.refetch()} /> : candidates.data?.items.length ? candidates.data.items.map((item) => <CandidateRow key={item.series_key} item={item} />) : <EmptyState className="py-8" message="새로 확인할 할부 후보가 없습니다" />}
  </Card>
}
