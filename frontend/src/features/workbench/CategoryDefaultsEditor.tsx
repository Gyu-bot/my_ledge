import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Card } from '../../ds/Card'
import { Select, TextInput } from '../../ds/Field'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { toast } from '../../ds/toastStore'
import { formatNetWon } from '../../ds/format'
import { useSpendCube } from '../../hooks/useMetrics'
import { useCategoryDefaults, useDeleteCategoryDefault, useSetCategoryDefault } from '../../hooks/useNature'
import { useTransactionFilterOptions } from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { AdjustabilityValue, CategoryAdjustabilityDefault } from '../../types/nature'
import { loadErrorMessage, writeErrorMessage } from '../analysis/text'
import { ADJUSTABILITY_HELP, ADJUSTABILITY_TEXT, categoryText } from '../classification/labels'

type Choice = '' | AdjustabilityValue

function keyOf(major: string, minor: string | null): string {
  return `${major}\u0000${minor ?? ''}`
}

interface RowProps {
  major: string
  minor: string | null
  current: CategoryAdjustabilityDefault | undefined
  inherited: AdjustabilityValue | null
  undecided: number
}

function DefaultRow({ major, minor, current, inherited, undecided }: RowProps) {
  const hasWrite = useWriteAccess()
  const setDefault = useSetCategoryDefault()
  const deleteDefault = useDeleteCategoryDefault()
  const value: Choice = current?.adjustability ?? ''
  const pending = setDefault.isPending || deleteDefault.isPending
  const name = categoryText(major, minor)

  async function change(next: Choice) {
    if (next === value) return
    try {
      if (next === '') {
        if (!current) return
        await deleteDefault.mutateAsync(current.id)
        const previous = current.adjustability
        toast.success(`'${name}' 기본값을 지웠습니다`, {
          action: {
            label: '되돌리기',
            onClick: () => void setDefault.mutateAsync({ category_major: major, category_minor: minor, adjustability: previous }),
          },
        })
      } else {
        await setDefault.mutateAsync({ category_major: major, category_minor: minor, adjustability: next })
        toast.success(`'${name}' 기본값을 '${ADJUSTABILITY_TEXT[next]}'(으)로 정했습니다`)
      }
    } catch (error) {
      toast.error('기본값을 저장하지 못했습니다', { description: writeErrorMessage(error) })
    }
  }

  return (
    <div className={minor ? 'flex flex-wrap items-center gap-2 py-1.5 pl-5' : 'flex flex-wrap items-center gap-2 py-2'}>
      <span className={minor ? 'min-w-0 flex-1 basis-40 text-caption text-text-secondary' : 'min-w-0 flex-1 basis-40 text-label font-semibold text-text-primary'}>
        {minor ?? major}
        {undecided !== 0 ? <span className="tnum ml-1.5 text-micro font-normal text-warn">미정 {formatNetWon(undecided)}</span> : null}
      </span>
      <Select
        aria-label={`${name} 조정 가능성 기본값`}
        value={value}
        disabled={!hasWrite || pending}
        onChange={(event) => void change(event.target.value as Choice)}
      >
        <option value="">{minor ? `대분류 값 따름${inherited ? ` (${ADJUSTABILITY_TEXT[inherited]})` : ' (미정)'}` : '정하지 않음 (미정)'}</option>
        <option value="protected">보호</option>
        <option value="adjustable">조정 가능</option>
      </Select>
    </div>
  )
}

/** 카테고리 단위 조정 가능성 기본값 — 거래 지정·정기 지급 값이 없을 때 적용된다(2.2). */
export function CategoryDefaultsEditor() {
  const options = useTransactionFilterOptions()
  const defaults = useCategoryDefaults()
  const undecided = useSpendCube({ group_by: ['effective_category_major', 'effective_category_minor'], adjustability: 'undecided', limit: 2000 })
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (options.isLoading || defaults.isLoading) return <Card title="카테고리 기본값"><ListSkeleton rows={6} /></Card>
  if (options.error || defaults.error) {
    return (
      <Card title="카테고리 기본값">
        <ErrorState message={loadErrorMessage(options.error ?? defaults.error)} onRetry={() => { void options.refetch(); void defaults.refetch() }} />
      </Card>
    )
  }

  const byKey = new Map((defaults.data?.items ?? []).map((item) => [keyOf(item.category_major, item.category_minor), item]))
  const undecidedByMajor = new Map<string, number>()
  const undecidedByMinor = new Map<string, number>()
  for (const row of undecided.data?.rows ?? []) {
    const major = row.effective_category_major ?? ''
    undecidedByMajor.set(major, (undecidedByMajor.get(major) ?? 0) + row.amount)
    if (row.effective_category_minor) {
      const key = keyOf(major, row.effective_category_minor)
      undecidedByMinor.set(key, (undecidedByMinor.get(key) ?? 0) + row.amount)
    }
  }
  const majors = [...(options.data?.category_options ?? [])]
    .filter((major) => !filter || major.includes(filter) || (options.data?.category_minor_options_by_major[major] ?? []).some((minor) => minor.includes(filter)))
    .sort((a, b) => (undecidedByMajor.get(b) ?? 0) - (undecidedByMajor.get(a) ?? 0) || a.localeCompare(b, 'ko'))
  const known = new Set((options.data?.category_options ?? []).flatMap((major) => [keyOf(major, null), ...(options.data?.category_minor_options_by_major[major] ?? []).map((minor) => keyOf(major, minor))]))
  const orphans = (defaults.data?.items ?? []).filter((item) => !known.has(keyOf(item.category_major, item.category_minor)))

  function toggle(major: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(major)) next.delete(major)
      else next.add(major)
      return next
    })
  }

  return (
    <Card
      title="카테고리 기본값"
      meta="카테고리마다 조정 가능성의 기본값을 둡니다. 거래에서 직접 정한 값과 정기 지급 묶음의 값이 있으면 그 값이 먼저입니다. 카테고리 이름은 바꾸지 않습니다."
    >
      <div className="mb-3 flex flex-wrap items-end gap-3 text-caption text-text-muted">
        <label className="flex items-center gap-2">
          카테고리 찾기
          <TextInput value={filter} onChange={(event) => setFilter(event.target.value)} className="w-40" />
        </label>
        <span>보호: {ADJUSTABILITY_HELP.protected} · 조정 가능: {ADJUSTABILITY_HELP.adjustable}</span>
      </div>
      {majors.length === 0 ? <EmptyState message="카테고리가 없습니다. 거래를 가져오면 카테고리가 생깁니다." /> : (
        <ul aria-label="카테고리 기본값" className="divide-y divide-border-subtle">
          {majors.map((major) => {
            const minors = options.data?.category_minor_options_by_major[major] ?? []
            const majorDefault = byKey.get(keyOf(major, null))
            const minorDefaults = minors.filter((minor) => byKey.has(keyOf(major, minor))).length
            const open = expanded.has(major)
            return (
              <li key={major}>
                <DefaultRow
                  major={major}
                  minor={null}
                  current={majorDefault}
                  inherited={null}
                  undecided={undecidedByMajor.get(major) ?? 0}
                />
                {minors.length > 0 ? (
                  <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => toggle(major)} className="mb-1 ml-3">
                    소분류 {minors.length}개{minorDefaults > 0 ? ` · 따로 정한 것 ${minorDefaults}개` : ''}
                    <ArrowRight className={open ? 'h-3 w-3 rotate-90' : 'h-3 w-3'} />
                  </Button>
                ) : null}
                {open ? minors.map((minor) => (
                  <DefaultRow
                    key={minor}
                    major={major}
                    minor={minor}
                    current={byKey.get(keyOf(major, minor))}
                    inherited={majorDefault?.adjustability ?? null}
                    undecided={undecidedByMinor.get(keyOf(major, minor)) ?? 0}
                  />
                )) : null}
              </li>
            )
          })}
        </ul>
      )}
      {orphans.length > 0 ? (
        <div className="mt-3 rounded-md border border-border-subtle px-3 py-2">
          <p className="text-caption text-text-muted">지금 거래에 없는 카테고리에 남아 있는 기본값</p>
          {orphans.map((item) => (
            <div key={item.id} className="mt-1 flex items-center gap-2 text-caption">
              <span className="flex-1">{categoryText(item.category_major, item.category_minor)}</span>
              <Badge variant="neutral">{ADJUSTABILITY_TEXT[item.adjustability]}</Badge>
              <DefaultRemove item={item} />
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

function DefaultRemove({ item }: { item: CategoryAdjustabilityDefault }) {
  const hasWrite = useWriteAccess()
  const remove = useDeleteCategoryDefault()
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={!hasWrite || remove.isPending}
      onClick={() => void remove.mutateAsync(item.id).then(
        () => toast.success('기본값을 지웠습니다'),
        (error: unknown) => toast.error('지우지 못했습니다', { description: writeErrorMessage(error) }),
      )}
    >
      지우기
    </Button>
  )
}
