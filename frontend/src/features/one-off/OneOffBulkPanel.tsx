import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../ds/Button'
import { DetailPanel } from '../../ds/DetailPanel'
import { Field, Select, TextInput } from '../../ds/Field'
import { toast } from '../../ds/toastStore'
import { useOneOffEventActions, useOneOffEvents } from '../../hooks/useOneOffEvents'
import type { TransactionResponse } from '../../types/transaction'
import { loadErrorMessage, writeErrorMessage } from '../analysis/text'
import { memberRejections, oneOffEventLink, REJECTION_REASON } from './oneOffLabels'

interface Props {
  transactionIds: number[]
  rows: TransactionResponse[]
  onClose: () => void
  onSaved: () => void
}

export function OneOffBulkPanel({ transactionIds, rows, onClose, onSaved }: Props) {
  const events = useOneOffEvents()
  const { create, editMembers } = useOneOffEventActions()
  const [choice, setChoice] = useState('new')
  const [name, setName] = useState('')
  const [error, setError] = useState<unknown>(null)
  const pending = create.isPending || editMembers.isPending
  const rejections = memberRejections(error)
  const merchants = new Map(rows.map((row) => [row.id, row.merchant]))

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      const result = choice === 'new'
        ? await create.mutateAsync({ name: name.trim(), transaction_ids: transactionIds })
        : await editMembers.mutateAsync({ eventId: Number(choice), method: 'POST', transactionIds })
      toast.success(`${result.name}에 ${transactionIds.length}건을 추가했습니다`)
      onSaved()
    } catch (failure) {
      setError(failure)
    }
  }

  return (
    <DetailPanel
      open
      title="일회성 묶음에 추가"
      subtitle={`선택한 거래 ${transactionIds.length}건`}
      onClose={() => { if (!pending) onClose() }}
    >
      <form className="space-y-3" onSubmit={(event) => void save(event)}>
        <Field label="일회성 묶음">
          <Select value={choice} onChange={(event) => { setChoice(event.target.value); setError(null) }} disabled={pending}>
            <option value="new">새 묶음 만들기</option>
            {events.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        {events.error ? <p className="text-caption text-warn">{loadErrorMessage(events.error)}</p> : null}
        {choice === 'new' ? (
          <Field label="새 묶음 이름">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required disabled={pending} />
          </Field>
        ) : null}
        {error ? (
          <div role="alert" className="space-y-1 text-caption text-expense">
            {rejections.length > 0 ? (
              <>
                <p>선택한 거래를 추가하지 못했습니다.</p>
                <ul className="space-y-1">
                  {rejections.map(({ transaction_id, reason }) => (
                    <li key={transaction_id}>{merchants.get(transaction_id) ?? `거래 #${transaction_id}`} · {REJECTION_REASON[reason]}</li>
                  ))}
                </ul>
              </>
            ) : writeErrorMessage(error)}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link className="text-caption text-transfer hover:underline" to={choice === 'new' ? '/data/one-off' : oneOffEventLink(Number(choice))}>묶음 작업대</Link>
          <Button type="submit" variant="primary" disabled={pending || (choice === 'new' && !name.trim())}>
            {pending ? '추가 중…' : choice === 'new' ? '묶음 만들고 추가' : '선택 거래 추가'}
          </Button>
        </div>
      </form>
    </DetailPanel>
  )
}
