import { useState } from 'react'
import { LoanRulePrompt, type LoanRuleTarget } from './LoanRulePrompt'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '../../ds/Card'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { ListSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { useDataStatus } from '../../hooks/useMetrics'
import { useLoanAccounts, useLoanTransactionMappings } from '../../hooks/useTransactions'
import { PageHeader } from '../../shell/PageHeader'
import { loadErrorMessage, sharePct } from '../analysis/text'
import { ClassificationQueue } from './ClassificationQueue'
import { LoanCandidateCard } from './LoanCandidateCard'

type Tab = 'classify' | 'loan'

function LoanCandidates() {
  const [ruleTargets, setRuleTargets] = useState<LoanRuleTarget[]>([])
  const unlinked = useLoanTransactionMappings({ linked: 'unlinked', page: 1, per_page: 20 })
  const loanAccounts = useLoanAccounts()
  const items = unlinked.data?.items ?? []
  const total = unlinked.data?.total ?? items.length
  return (
    <Card title="대출 연결 후보" meta="대출 상환처럼 보이지만 대출에 연결되지 않은 지출입니다. 연결하면 약정(대출 원리금)으로 집계됩니다.">
      {ruleTargets.length > 0 && <LoanRulePrompt targets={ruleTargets} onClose={() => setRuleTargets([])} />}
      {unlinked.isLoading ? <ListSkeleton rows={3} /> : unlinked.error ? (
        <ErrorState message={loadErrorMessage(unlinked.error)} onRetry={() => void unlinked.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState message="연결을 기다리는 대출 후보가 없습니다." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <LoanCandidateCard
              key={`loan-${item.transaction_id}`}
              item={item}
              onLinked={setRuleTargets}
              accounts={loanAccounts.data?.items ?? []}
            />
          ))}
          {total > items.length ? (
            <Link to="/data/loans" className="flex items-center gap-1 px-1 text-caption text-transfer hover:underline">
              대출 연결 후보 전체 보기 ({total}건)
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      )}
    </Card>
  )
}

/** 작업대 · 분류 — 분류 큐(조정 가능성)와 대출 연결 후보. */
export function ClassificationPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'loan' ? 'loan' : 'classify'
  const status = useDataStatus()
  const loans = useLoanTransactionMappings({ linked: 'unlinked', page: 1, per_page: 20 })
  const share = status.data?.adjustability_undecided_share ?? null

  return (
    <>
      <PageHeader
        title="작업대 · 분류"
        meta={status.data ? <span className="tnum">조정 가능성 미정 비중 {sharePct(share)} (금액 기준)</span> : null}
      />
      <div className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="분류 작업"
          options={[
            { value: 'classify', label: '분류할 지출' },
            { value: 'loan', label: `대출 연결 후보 ${loans.data?.total ?? ''}`.trim() },
          ] as const}
          value={tab}
          onChange={(next) =>
            setSearchParams(() => {
              const params = new URLSearchParams()
              if (next === 'loan') params.set('tab', 'loan')
              return params
            }, { replace: true })
          }
        />
        {tab === 'classify' ? <ClassificationQueue /> : <LoanCandidates />}
        <p className="text-caption text-text-muted">
          카테고리 기본값과 정기 지급 묶음은{' '}
          <Link to="/data/nature" className="text-transfer hover:underline">기본값·정기 지급</Link>
          에서 한눈에 보고 고칠 수 있습니다.
        </p>
      </div>
    </>
  )
}
