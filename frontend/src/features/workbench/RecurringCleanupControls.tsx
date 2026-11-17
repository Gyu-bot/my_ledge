import { useState } from 'react'
import { Button } from '../../ds/Button'
import { ConfirmDanger } from '../../ds/ConfirmDanger'
import { Field, Select, TextInput } from '../../ds/Field'
import { toast } from '../../ds/toastStore'
import { useBulkDeleteRecurringCommitments, useMergeRecurringCommitments } from '../../hooks/useNature'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { MerchantMatch, RecurringCommitment, RecurringMergeSuggestion } from '../../types/nature'
import { writeErrorMessage } from '../analysis/text'

function name(item: RecurringCommitment) { return item.label || item.merchant || item.category_major }

export function RecurringCleanupControls({ items, visibleIds, selected, setSelected, suggestions }: {
  items: RecurringCommitment[]; visibleIds: number[]; selected: number[]
  setSelected: (ids: number[]) => void; suggestions: RecurringMergeSuggestion[]
}) {
  const hasWrite = useWriteAccess()
  const remove = useBulkDeleteRecurringCommitments()
  const merge = useMergeRecurringCommitments()
  const [deleting, setDeleting] = useState(false)
  const [merging, setMerging] = useState<RecurringCommitment[] | null>(null)
  const [targetId, setTargetId] = useState(0)
  const [mode, setMode] = useState<MerchantMatch>('exact')
  const [merchant, setMerchant] = useState('')
  const chosen = items.filter((item) => selected.includes(item.id))
  const sameCategory = chosen.length >= 2 && chosen.every((item) => item.category_major === chosen[0].category_major && item.category_minor === chosen[0].category_minor)
  const target = merging?.find((item) => item.id === targetId)
  const valid = target && (target.match_scope === 'category' || (merchant.trim() && (mode === 'exact' || merchant.replace(/\s/g, '').length >= 2)))

  function openMerge(rows: RecurringCommitment[], prefix?: string, suggestedTarget?: number) {
    const initial = rows.find((item) => item.id === suggestedTarget) ?? rows[0]
    setTargetId(initial.id)
    setMode(prefix ? 'prefix' : initial.merchant_match)
    setMerchant(prefix ?? initial.merchant ?? '')
    setMerging(rows)
  }
  async function destroy() {
    try {
      await remove.mutateAsync(chosen.map((item) => item.id))
      setSelected([]); setDeleting(false)
      toast.success('선택한 정기 지급을 지웠습니다')
    } catch (error) { toast.error('지우지 못했습니다', { description: writeErrorMessage(error) }) }
  }
  async function combine() {
    if (!merging || !target || !valid) return
    try {
      await merge.mutateAsync({ target_id: targetId, source_ids: merging.filter((item) => item.id !== targetId).map((item) => item.id), ...(target.match_scope === 'merchant' ? { merchant_match: mode, merchant: merchant.trim() } : {}) })
      setSelected([]); setMerging(null)
      toast.success('정기 지급을 합쳤습니다')
    } catch (error) { toast.error('합치지 못했습니다', { description: writeErrorMessage(error) }) }
  }
  return <div className="mb-3 flex min-w-0 flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={!hasWrite || !visibleIds.length} onClick={() => setSelected(visibleIds)}>보이는 항목 모두 선택</Button>
      <span className="text-caption">선택 {chosen.length}개</span>
      <Button size="sm" disabled={!chosen.length} onClick={() => setSelected([])}>선택 해제</Button>
      <Button size="sm" variant="danger" disabled={!hasWrite || !chosen.length} onClick={() => setDeleting(true)}>선택 일괄 삭제</Button>
      <Button size="sm" disabled={!hasWrite || !sameCategory} onClick={() => openMerge(chosen)}>선택 합치기</Button>
    </div>
    {chosen.length >= 2 && !sameCategory ? <p className="text-caption text-warn">대분류와 소분류가 같은 항목만 합칠 수 있습니다.</p> : null}
    {suggestions.map((suggestion) => {
      const rows = items.filter((item) => suggestion.ids.includes(item.id))
      return <div key={suggestion.target_id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg-inset p-3">
        <div className="min-w-0 text-caption"><p className="font-semibold">합치기 제안 · {rows.length}개</p><p className="break-all">{rows.map(name).join(' · ')}</p><p className="break-all text-text-muted">제안 접두어: {suggestion.suggested_prefix} · 자동으로 합치지 않습니다.</p></div>
        <Button size="sm" disabled={!hasWrite || rows.length < 2} onClick={() => openMerge(rows, suggestion.suggested_prefix, suggestion.target_id)}>{rows.length}개를 하나로 합치기</Button>
      </div>
    })}
    <ConfirmDanger key={deleting ? 'delete-open' : 'delete-closed'} open={deleting} onClose={() => setDeleting(false)} title={`정기 지급 ${chosen.length}개 일괄 삭제`} description={`${chosen.length}개 묶음과 주기·금액·조정 가능성 기록을 지웁니다. 명시적 묶음 연결을 해제하며 거래 원본과 거래별 조정 가능성·제외 설정은 유지됩니다. 남은 규칙이 있으면 다시 매칭되고, 없으면 수시 지출로 집계됩니다.`} confirmPhrase="지우기" confirmLabel={`${chosen.length}개 삭제`} pending={remove.isPending} onConfirm={() => void destroy()} />
    <ConfirmDanger key={merging ? `merge-${merging.map((item) => item.id).join('-')}` : 'merge-closed'} open={merging !== null} onClose={() => setMerging(null)} title="정기 지급 합치기" confirmPhrase="합치기" confirmLabel="확인하고 합치기" pending={merge.isPending} confirmDisabled={!valid} onConfirm={() => void combine()} description={<div className="flex flex-col gap-3">
      <p>{merging?.length}개를 하나로 합칩니다. 대상의 주기·금액·조정 가능성·종료일·메모를 유지하고 시작일은 가장 이른 범위로 넓힙니다. 속성이 다르면 확인 상태를 해제합니다. 원본 거래는 지우지 않고 명시적 연결만 대상으로 옮깁니다. 규칙에 따른 관측과 월말 전망은 달라질 수 있습니다.</p>
      <Field label="남길 대상"><Select value={targetId} disabled={merge.isPending} onChange={(event) => { const id = Number(event.target.value); setTargetId(id); const row = merging?.find((item) => item.id === id); if (row) { setMerchant(row.merchant ?? ''); setMode(row.merchant_match) } }}>{merging?.map((item) => <option key={item.id} value={item.id}>{name(item)}</option>)}</Select></Field>
      {target?.match_scope === 'merchant' ? <>
        <Field label="합친 뒤 일치 방식"><Select value={mode} disabled={merge.isPending} onChange={(event) => setMode(event.target.value as MerchantMatch)}><option value="exact">정확히 같음</option><option value="prefix">이 글자로 시작</option></Select></Field>
        <Field label="합친 뒤 거래처·접두어" hint="접두어는 공백을 빼고 2글자 이상입니다."><TextInput value={merchant} disabled={merge.isPending} onChange={(event) => setMerchant(event.target.value)} /></Field>
      </> : null}
      {!valid ? <p role="alert">거래처·접두어를 확인하세요.</p> : null}
    </div>} />
  </div>
}
