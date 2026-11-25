import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Field, TextInput } from '../../ds/Field'
import { formatNetWon, formatSignedWon } from '../../ds/format'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { useOneOffEvent, useOneOffEventActions, useOneOffEvents } from '../../hooks/useOneOffEvents'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import { PageHeader } from '../../shell/PageHeader'
import type { OneOffEventDetail, OneOffEventInput } from '../../types/oneOffEvents'
import { loadErrorMessage, writeErrorMessage } from '../analysis/text'
import { INACTIVE_REASON, MEMBER_STATUS, oneOffEventLink } from './oneOffLabels'

function EventForm({ event, disabled, onSave }: {
  event?: OneOffEventDetail
  disabled: boolean
  onSave: (input: OneOffEventInput) => Promise<void>
}) {
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = nameDraft ?? event?.name ?? ''
  const note = noteDraft ?? event?.note ?? ''
  const dirty = event == null || name.trim() !== event.name || note !== (event.note ?? '')

  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    if (!dirty || !name.trim() || disabled) return
    try {
      setError(null)
      await onSave({ name: name.trim(), note: note || null })
      setNameDraft(null)
      setNoteDraft(null)
    } catch (failure) {
      setError(writeErrorMessage(failure))
    }
  }

  return (
    <form className="space-y-2" onSubmit={(form) => void submit(form)}>
      <Field label="묶음 이름"><TextInput value={name} onChange={(event) => setNameDraft(event.target.value)} required maxLength={100} disabled={disabled} /></Field>
      <Field label="메모">
        <textarea
          className="rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-caption text-text-secondary disabled:opacity-40"
          value={note} onChange={(event) => setNoteDraft(event.target.value)} rows={2} disabled={disabled}
        />
      </Field>
      {error ? <p role="alert" className="text-caption text-expense">{error}</p> : null}
      <Button type="submit" variant="primary" disabled={disabled || !dirty || !name.trim()}>{event ? '묶음 정보 저장' : '묶음 만들기'}</Button>
    </form>
  )
}

function EventDetail({ event, hasWrite, onDeleted }: {
  event: OneOffEventDetail
  hasWrite: boolean
  onDeleted: () => void
}) {
  const { update, remove, editMembers } = useOneOffEventActions()
  const busy = update.isPending || remove.isPending || editMembers.isPending

  async function discard() {
    if (!window.confirm(`‘${event.name}’ 묶음과 소속 연결을 삭제할까요? 거래 기록은 보존됩니다.`)) return
    try {
      await remove.mutateAsync(event.id)
      toast.success('일회성 묶음을 삭제했습니다')
      onDeleted()
    } catch (error) {
      toast.error('묶음 삭제 실패', { description: writeErrorMessage(error) })
    }
  }

  async function detach(transactionId: number) {
    try {
      await editMembers.mutateAsync({ eventId: event.id, method: 'DELETE', transactionIds: [transactionId] })
      toast.success('묶음에서 거래를 뺐습니다')
    } catch (error) {
      toast.error('소속 해제 실패', { description: writeErrorMessage(error) })
    }
  }

  const attributedLink = `/data/transactions?one_off_event_id=${event.id}`
  return (
    <div className="min-w-0 space-y-4">
      <Card title={event.name} action={<Badge variant="accent">일회성</Badge>}>
        <EventForm event={event} disabled={busy || !hasWrite} onSave={async (input) => {
          await update.mutateAsync({ eventId: event.id, input })
          toast.success('일회성 묶음을 저장했습니다')
        }} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <Link to={attributedLink} className="text-caption text-transfer hover:underline">귀속 거래 보기</Link>
          <Button variant="danger" disabled={!hasWrite || busy} onClick={() => void discard()}>묶음 삭제</Button>
        </div>
      </Card>
      <Card title="월별 귀속 금액" meta="확정 배분 환불은 원구매 묶음에 게시된 달의 지출 차감으로 반영됩니다.">
        {event.periods.length ? (
          <dl className="divide-y divide-border-subtle text-caption">
            {event.periods.map(({ period, amount }) => (
              <div key={period} className="flex justify-between gap-2 py-1.5">
                <dt>{period}</dt>
                <dd className="tnum">{formatNetWon(amount)}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="text-caption text-text-muted">귀속된 금액이 없습니다.</p>}
        <div className="mt-2 flex justify-between gap-2 border-t border-border-subtle pt-2 text-label font-semibold">
          <span>일회성 합계</span><span className="tnum">{formatNetWon(event.counted_total)}</span>
        </div>
      </Card>
      <Card title="직접 소속 거래" meta={`${event.direct_member_count}건 · 금액은 원본 거래의 부호로 표시합니다.`}>
        {event.members.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-caption">
              <thead className="text-text-muted"><tr>{['날짜', '거래처·원문', '카테고리', '상태', '원금액', ''].map((label) => <th scope="col" key={label} className="px-2 py-1.5">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {event.members.map((member) => (
                  <tr key={member.transaction_id}>
                    <td className="whitespace-nowrap px-2 py-2">{member.date}</td>
                    <td className="max-w-52 break-words px-2 py-2">
                      <Link to={`/data/transactions?transaction_id=${member.transaction_id}`} className="text-transfer hover:underline">{member.merchant}</Link>
                      <p className="text-micro text-text-muted">{member.description}</p>
                    </td>
                    <td className="px-2 py-2">{[member.category_major, member.category_minor].filter(Boolean).join(' / ')}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <Badge variant={member.member_status === 'counted' ? 'accent' : 'neutral'}>{MEMBER_STATUS[member.member_status]}</Badge>
                      {member.inactive_reason ? <p className="text-micro text-text-muted">{INACTIVE_REASON[member.inactive_reason]}</p> : null}
                    </td>
                    <td className="tnum whitespace-nowrap px-2 py-2 text-right">
                      {member.currency === 'KRW' ? formatSignedWon(member.amount) : `${member.amount.toLocaleString('ko-KR')} ${member.currency}`}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2"><Button size="sm" variant="ghost" disabled={!hasWrite || busy} aria-label={`${member.merchant} 묶음에서 빼기`} onClick={() => void detach(member.transaction_id)}>빼기</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-caption text-text-muted">직접 소속 거래가 없습니다. <Link className="text-transfer hover:underline" to="/data/transactions">거래 선택</Link></p>}
      </Card>
    </div>
  )
}

export function OneOffEventsPage() {
  const hasWrite = useWriteAccess()
  const [params, setParams] = useSearchParams()
  const list = useOneOffEvents()
  const { create } = useOneOffEventActions()
  const requestedId = Number(params.get('event'))
  const selectedId = Number.isSafeInteger(requestedId) && requestedId > 0 ? requestedId : list.data?.[0]?.id ?? null
  const detail = useOneOffEvent(selectedId)

  return (
    <>
      <PageHeader title="일회성 지출" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card title="묶음 목록">
            {list.isLoading ? <ListSkeleton rows={3} /> : list.error ? (
              <ErrorState message={loadErrorMessage(list.error)} onRetry={() => void list.refetch()} />
            ) : list.data?.length ? (
              <ul className="space-y-1">
                {list.data.map((event) => (
                  <li key={event.id}>
                    <Link to={oneOffEventLink(event.id)} aria-current={event.id === selectedId ? 'true' : undefined} className="block rounded-md border border-border-subtle p-2 hover:bg-bg-inset aria-[current=true]:border-accent">
                      <span className="block break-words text-label font-semibold">{event.name}</span>
                      <span className="tnum text-caption text-text-muted">{event.direct_member_count}건 · {formatNetWon(event.counted_total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState message="등록된 일회성 묶음이 없습니다." />}
          </Card>
          <Card title="새 묶음">
            {hasWrite ? (
              <EventForm disabled={create.isPending} onSave={async (input) => {
                const event = await create.mutateAsync(input)
                setParams({ event: String(event.id) })
                toast.success('일회성 묶음을 만들었습니다')
              }} />
            ) : <Badge variant="warn">읽기 전용</Badge>}
          </Card>
        </div>
        {selectedId !== null ? (
          detail.isLoading ? <ListSkeleton rows={6} /> : detail.error || !detail.data ? (
            <ErrorState message={loadErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />
          ) : <EventDetail key={selectedId} event={detail.data} hasWrite={hasWrite} onDeleted={() => setParams({})} />
        ) : null}
      </div>
    </>
  )
}
