import { useSearchParams } from 'react-router-dom'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { useDataStatus } from '../../hooks/useMetrics'
import { PageHeader } from '../../shell/PageHeader'
import { CategoryDefaultsEditor } from './CategoryDefaultsEditor'
import { RecurringCommitmentsEditor } from './RecurringCommitmentsEditor'

type Tab = 'defaults' | 'recurring'

function localToday(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** 작업대 · 기본값·정기 지급 — 카테고리 조정 가능성 기본값과 정기 지급 묶음 (2.2). */
export function NatureSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'recurring' ? 'recurring' : 'defaults'
  const status = useDataStatus()
  // 끝남 여부는 오늘이 아니라 거래 기준일로 본다(기록 분석 원칙).
  const asOf = status.data?.as_of.transaction_as_of ?? localToday()

  return (
    <>
      <PageHeader title="작업대 · 기본값·정기 지급" />
      <div className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="기본값·정기 지급"
          options={[{ value: 'defaults', label: '카테고리 기본값' }, { value: 'recurring', label: '정기 지급 묶음' }] as const}
          value={tab}
          onChange={(next) => setSearchParams(() => (next === 'recurring' ? new URLSearchParams({ tab: 'recurring' }) : new URLSearchParams()), { replace: true })}
        />
        {tab === 'defaults' ? <CategoryDefaultsEditor /> : <RecurringCommitmentsEditor today={asOf} />}
      </div>
    </>
  )
}
