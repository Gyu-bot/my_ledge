import { useState } from 'react'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Field, Select, TextInput } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { formatNetWon } from '../../ds/format'
import { useCreateSpendingLimit, useSpendingLimitHistory } from '../../hooks/useSpendingLimits'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { LimitTargetKind } from '../../types/spendingLimits'
import { loadErrorMessage } from '../analysis/text'

const ADJUSTABILITY_LABELS: Record<string, string> = { protected: '보호', adjustable: '조정 가능', undecided: '미정' }

export function SpendingLimitsEditor() {
  const history = useSpendingLimitHistory()
  const create = useCreateSpendingLimit()
  const hasWrite = useWriteAccess()
  const [kind, setKind] = useState<LimitTargetKind | ''>('')
  const [target, setTarget] = useState('')
  const [uncategorized, setUncategorized] = useState(false)
  const [effective, setEffective] = useState('')
  const [amount, setAmount] = useState('')
  const [release, setRelease] = useState(false)
  const [message, setMessage] = useState('')
  const valid = kind !== '' && (kind === 'category' ? uncategorized || target.trim() !== '' : target !== '') && /^\d{4}-(0[1-9]|1[0-2])$/.test(effective) && (release || (amount.trim() !== '' && Number.isSafeInteger(Number(amount)) && Number(amount) >= 0))

  async function save() {
    if (!valid || !kind) return
    setMessage('')
    try {
      await create.mutateAsync({ target_kind: kind, target_value: kind === 'category' && uncategorized ? '' : target, effective_from_period: effective, amount: release ? null : Number(amount) })
      setEffective(''); setAmount(''); setRelease(false)
      setMessage('새 한도 이력을 저장했습니다. 이전 이력은 유지됩니다.')
    } catch (error) {
      setMessage(error instanceof Error && error.message.startsWith('409') ? '이 대상의 마지막 적용 시작월보다 뒤인 달을 입력해 주세요.' : error instanceof Error && error.message.startsWith('422') ? '마감된 달은 바꿀 수 없습니다. 대상·시작월·원 단위 금액을 확인해 주세요.' : loadErrorMessage(error))
    }
  }
  return (
    <section id="spending-limits" className="mb-4 min-w-0">
      <Card title="월 지출 한도" meta="대상·금액·적용 시작월을 직접 정합니다. 추천값은 없습니다. 변경·해제도 새 이력으로 저장하고 이전 값을 지우지 않습니다.">
        {history.isLoading ? <ListSkeleton rows={3} /> : history.error ? <ErrorState message={loadErrorMessage(history.error)} onRetry={() => void history.refetch()} /> : (
          <div className="space-y-3 text-caption">
            <p className="text-text-muted">{history.data?.history_rule}</p>
            {history.data?.last_closed_period ? <p className="text-text-muted">마지막 마감월: {history.data.last_closed_period}. 그 뒤의 달부터 설정할 수 있습니다.</p> : null}
            <form onSubmit={(event) => { event.preventDefault(); void save() }} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="한도 단위"><Select value={kind} disabled={!hasWrite} onChange={(event) => { const value = event.target.value; setKind(value === 'category' || value === 'adjustability' ? value : ''); setTarget(''); setUncategorized(false) }}>
                  <option value="">직접 선택</option><option value="category">카테고리 (대분류)</option><option value="adjustability">조정 가능성</option>
                </Select></Field>
                {kind === 'adjustability' ? <Field label="한도 대상"><Select value={target} disabled={!hasWrite} onChange={(event) => setTarget(event.target.value)}><option value="">직접 선택</option><option value="protected">보호</option><option value="adjustable">조정 가능</option><option value="undecided">미정</option></Select></Field> : <Field label="카테고리 대분류" hint="기록의 대분류 이름을 정확히 입력합니다."><TextInput value={target} maxLength={50} disabled={!hasWrite || kind !== 'category' || uncategorized} onChange={(event) => setTarget(event.target.value)} /></Field>}
                <Field label="적용 시작월"><TextInput type="month" required value={effective} disabled={!hasWrite} onChange={(event) => setEffective(event.target.value)} /></Field>
                <Field label="월 한도 (원)" hint="0원도 한도입니다. 한도를 해제하려면 아래에서 직접 선택합니다."><TextInput type="number" min={0} step={1} required={!release} value={amount} disabled={!hasWrite || release} onChange={(event) => setAmount(event.target.value)} /></Field>
              </div>
              {kind === 'category' ? <label className="flex items-center gap-2 text-text-secondary"><input type="checkbox" checked={uncategorized} disabled={!hasWrite} onChange={(event) => { setUncategorized(event.target.checked); setTarget('') }} />미분류 카테고리를 대상으로 지정</label> : null}
              <label className="flex items-center gap-2 text-text-secondary"><input type="checkbox" checked={release} disabled={!hasWrite} onChange={(event) => setRelease(event.target.checked)} />이 달부터 한도 해제</label>
              <Button type="submit" variant="primary" disabled={!hasWrite || !valid || create.isPending}>새 한도 이력 저장</Button>
              {message ? <p role="status" className="text-text-secondary">{message}</p> : null}
            </form>
            <h3 className="font-semibold text-text-primary">변경 이력 (적용 시작월별)</h3>
            {!history.data?.revisions.length ? <p className="text-text-muted">설정한 한도가 없습니다.</p> : <ul aria-label="한도 변경 이력" className="space-y-2">{history.data.revisions.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle p-2">
              <span className="min-w-0 break-words">{row.target_kind === 'category' ? '대분류' : '조정 가능성'} · {row.target_kind === 'adjustability' ? ADJUSTABILITY_LABELS[row.target_value] : row.target_value || '미분류'} · {row.effective_from_period}부터 · {row.amount == null ? '한도 해제' : formatNetWon(row.amount)}</span>
              <Button size="sm" disabled={!hasWrite} onClick={() => { setKind(row.target_kind); setTarget(row.target_value); setUncategorized(row.target_kind === 'category' && row.target_value === ''); setEffective(''); setAmount(''); setRelease(false); setMessage('대상을 선택했습니다. 새 시작월과 금액을 직접 입력해 주세요.') }}>이 대상의 한도 변경</Button>
            </li>)}</ul>}
          </div>
        )}
      </Card>
    </section>
  )
}
