import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Field, TextInput, Toggle } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { ErrorState } from '../../ds/States'
import { formatWon } from '../../ds/format'
import { useCanonicalViewsDashboard } from '../../hooks/useCanonicalViews'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import { apiFetch } from '../../lib/apiClient'
import type { IncomeProjectionSource } from '../../types/canonicalViews'

interface IncomeExpectation {
  source_key: string
  merchant: string
  expected_amount: number
  expected_day: number
  stopped: boolean
}
interface IncomeExpectationsResponse { items: IncomeExpectation[] }
interface ExpectationDraft extends Omit<IncomeExpectation, 'expected_amount' | 'expected_day'> {
  expected_amount: string
  expected_day: string
}

const QUERY_KEY = ['settings', 'income-expectations'] as const
const incomeExpectationsApi = {
  get: () => apiFetch<IncomeExpectationsResponse>('/settings/income-expectations'),
  replace: (items: IncomeExpectation[]) => apiFetch<IncomeExpectationsResponse>('/settings/income-expectations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  }),
}

function asDraft(item: IncomeExpectation): ExpectationDraft {
  return { ...item, expected_amount: String(item.expected_amount), expected_day: String(item.expected_day) }
}
function sourceKey(merchant: string): string {
  return `income:${merchant.trim().replace(/\s+/g, ' ').toLowerCase()}`
}
function suggestionDraft(source: IncomeProjectionSource): ExpectationDraft {
  const date = source.expected_date ?? source.expected_date_from ?? source.expected_date_to
  return {
    source_key: source.source_key,
    merchant: source.merchant,
    expected_amount: String(source.expected_amount),
    expected_day: source.expected_day != null ? String(source.expected_day) : date ? String(Number(date.slice(8, 10))) : '',
    stopped: source.status === 'stopped',
  }
}

export function IncomeExpectationsEditor() {
  const hasWrite = useWriteAccess()
  const client = useQueryClient()
  const saved = useQuery({ queryKey: QUERY_KEY, queryFn: incomeExpectationsApi.get, enabled: hasWrite })
  const canonical = useCanonicalViewsDashboard()
  const [draft, setDraft] = useState<ExpectationDraft[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const patch = useMutation({
    mutationFn: incomeExpectationsApi.replace,
    onSuccess: async (response) => {
      client.setQueryData(QUERY_KEY, response)
      setDraft(response.items.map(asDraft))
      await client.invalidateQueries({ queryKey: ['canonical-views'] })
    },
  })
  const items = draft ?? saved.data?.items.map(asDraft) ?? []
  const suggestions = (canonical.data?.month_projection?.income_sources ?? []).filter((source) =>
    !items.some((item) => item.source_key === source.source_key || sourceKey(item.merchant) === source.source_key),
  )
  const disabled = !hasWrite || patch.isPending || saved.isLoading || saved.isError

  function update(index: number, values: Partial<ExpectationDraft>) {
    setDraft(items.map((item, position) => position === index ? { ...item, ...values } : item))
    setMessage(null)
    setError(null)
  }

  async function save(reset = false) {
    if (disabled) return
    setMessage(null)
    setError(null)
    const payload: IncomeExpectation[] = []
    for (const item of reset ? [] : items) {
      const merchant = item.merchant.trim().replace(/\s+/g, ' ')
      const amount = Number(item.expected_amount)
      const day = Number(item.expected_day)
      if (!merchant || !item.expected_amount.trim() || !Number.isFinite(amount) || amount < 0 || !item.expected_day.trim() || !Number.isInteger(day) || day < 1 || day > 31) {
        setError('수입처, 0원 이상의 예상 금액, 1~31일의 예정일을 입력해 주세요.')
        return
      }
      const key = sourceKey(merchant)
      if (payload.some((entry) => entry.source_key === key)) {
        setError('같은 수입처는 한 번만 등록할 수 있습니다.')
        return
      }
      payload.push({ source_key: key, merchant, expected_amount: amount, expected_day: day, stopped: item.stopped })
    }
    try {
      await patch.mutateAsync(payload)
      setMessage(payload.length === 0 ? '사용자 보정을 지우고 자동 감지로 되돌렸습니다.' : '예상 수입 설정을 저장했습니다.')
    } catch {
      setError('예상 수입 저장에 실패했습니다. 입력은 유지됩니다. 다시 시도해 주세요.')
    }
  }

  return (
    <Card title="정기 수입 예상 설정" meta="금액 · 매월 예정일 · 중단 여부">
      <p className="text-caption text-text-muted">저장하면 아래 사용자 보정 목록 전체를 교체합니다. 자동 감지 후보는 추가한 뒤 저장해야 반영됩니다. 중단한 수입처는 중단 상태로 저장하면 전망에서 제외됩니다.</p>
      {!hasWrite ? <p className="mt-3 text-caption text-warn">예상 수입 설정을 조회하거나 수정하려면 쓰기 권한이 필요합니다.</p> : saved.isLoading ? <ListSkeleton rows={3} /> : saved.isError ? <ErrorState onRetry={() => void saved.refetch()} /> : (
        <>
          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <fieldset key={item.source_key} disabled={disabled} className="rounded-md border border-border p-3">
                <legend className="px-1 text-caption text-text-muted">수입 예상 {index + 1}</legend>
                <div className="grid items-end gap-3 sm:grid-cols-3">
                  <Field label={`수입처 ${index + 1}`}><TextInput value={item.merchant} onChange={(event) => update(index, { merchant: event.target.value })} /></Field>
                  <Field label={`예상 금액 ${index + 1} (원)`}><TextInput type="number" min={0} step="any" value={item.expected_amount} onChange={(event) => update(index, { expected_amount: event.target.value })} /></Field>
                  <Field label={`매월 예정일 ${index + 1}`} hint="해당 월에 없는 날짜는 말일 기준"><TextInput type="number" min={1} max={31} step={1} value={item.expected_day} onChange={(event) => update(index, { expected_day: event.target.value })} /></Field>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Toggle label={`${item.merchant || '새 수입처'} 수입 중단`} checked={item.stopped} disabled={disabled} onChange={(stopped) => update(index, { stopped })} />
                  <Button size="sm" disabled={disabled} onClick={() => { setDraft(items.filter((_, position) => position !== index)); setMessage(null) }}>보정 삭제 {index + 1}</Button>
                </div>
              </fieldset>
            ))}
            {items.length === 0 ? <p className="text-caption text-text-muted">저장할 사용자 보정이 없습니다. 자동 감지 기준을 사용합니다.</p> : null}
          </div>
          {suggestions.length > 0 ? <section className="mt-4" aria-label="자동 감지 수입 후보">
            <h3 className="text-label font-semibold text-text-secondary">자동 감지 후보 · 아직 사용자 보정에 포함되지 않음</h3>
            <ul className="mt-2 space-y-2">
              {suggestions.map((source) => <li key={source.source_key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg-inset p-3">
                <div className="text-caption"><span className="font-medium">{source.merchant}</span> · {formatWon(source.expected_amount)}<p className="mt-1 text-text-muted">{source.reason}</p></div>
                <Button disabled={disabled} onClick={() => { setDraft([...items, suggestionDraft(source)]); setMessage(null) }}>{source.merchant} 보정에 추가</Button>
              </li>)}
            </ul>
          </section> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={disabled} onClick={() => { setDraft([...items, { source_key: `draft:${Date.now()}`, merchant: '', expected_amount: '', expected_day: '', stopped: false }]); setMessage(null) }}>수입처 직접 추가</Button>
            <Button variant="primary" disabled={disabled} onClick={() => void save()}>예상 수입 저장</Button>
            <Button disabled={disabled} onClick={() => void save(true)}>자동 감지로 초기화</Button>
          </div>
          <p className="mt-2 text-micro text-text-muted">보정 삭제 또는 초기화 후에는 해당 수입처가 자동으로 다시 감지될 수 있습니다. 수입을 제외하려면 중단을 선택해 저장하세요.</p>
        </>
      )}
      {message ? <p role="status" className="mt-3 text-caption text-income">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-caption text-expense">{error}</p> : null}
    </Card>
  )
}
