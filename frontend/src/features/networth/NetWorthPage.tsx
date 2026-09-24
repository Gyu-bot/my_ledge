import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '../../ds/Badge'
import { Card } from '../../ds/Card'
import { CoverageGauge } from '../../ds/CoverageGauge'
import { Provenance } from '../../ds/Provenance'
import { SegmentedControl } from '../../ds/SegmentedControl'
import { Sparkline } from '../../ds/Sparkline'
import { Stat } from '../../ds/Stat'
import { ChartSkeleton, ListSkeleton, StatSkeleton } from '../../ds/Skeleton'
import { EmptyState, ErrorState } from '../../ds/States'
import { HBarList } from '../../ds/charts/HBarList'
import { LineArea } from '../../ds/charts/LineArea'
import { EM_DASH, formatDay, formatNetWon, formatPct, formatSignedWon, formatWon, formatWonCompact } from '../../ds/format'
import { PageHeader } from '../../shell/PageHeader'
import {
  useAssetSnapshotCompare,
  useAssetSnapshots,
  useInsuranceSummary,
  useInvestmentSummary,
  useLiquidityHealth,
  useLoanSummary,
  useNetWorthBreakdown,
  useNetWorthHistory,
} from '../../hooks/useAssets'
import { useProfile } from '../../hooks/useProfile'
import { useAnalyticsSettings } from '../../hooks/useSettings'
import { useInstallmentForecast } from '../../hooks/useTransactions'
import { monthlyPaymentEvidence, monthlyPaymentMissingLabel, monthlyPaymentSourceLabel } from './loanPresentation'
import type { LiquidityTier, LoanItem, LoanKind, LoanRepaymentMethod, SnapshotComparisonMode } from '../../types/asset'

const LIQUIDITY_LABEL: Record<LiquidityTier, string> = {
  immediate: '즉시 사용',
  near_liquid: '단기 현금화',
  illiquid: '비유동',
}

const REPAYMENT_LABEL: Record<LoanRepaymentMethod, string> = {
  principal_interest: '원리금 균등',
  principal_equal: '원금 균등',
  interest_only: '이자만',
  unknown: '미정',
}

const LOAN_KIND_LABEL: Record<LoanKind, string> = {
  unknown: '미지정',
  overdraft: '마이너스 통장',
  equal_principal_interest: '원리금 균등 상환',
  equal_principal: '원금 균등 상환',
  bullet: '일시 원금 상환',
  other: '기타',
}

const COMPARE_OPTIONS = [
  { value: 'latest_available_vs_previous_available', label: '최신↔직전' },
  { value: 'last_closed_month_vs_previous_closed_month', label: '마감월↔직전 마감월' },
] as const

function decimal(value: string | null | undefined): number | null {
  if (value == null) return null
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function runwayLabel(months: number | null): string {
  if (months == null) return EM_DASH
  if (months === 0 || months >= 1) return `${months.toFixed(1)}개월`
  const days = months * 30
  if (days >= 7) return `약 ${(days / 7).toFixed(1)}주`
  if (days >= 0.1) return `약 ${days.toFixed(1)}일`
  return '1일 미만'
}

const CONFIDENCE_LABEL: Record<string, string> = { high: '높음', medium: '보통', low: '낮음' }

/** 월 이자 단리 추정 — vw_loan_account_canonical과 같은 식 (balance × rate / 100 / 12) */
function estimatedMonthlyInterest(loan: LoanItem): number | null {
  const balance = decimal(loan.balance)
  const rate = decimal(loan.interest_rate)
  if (balance == null || rate == null) return null
  return Math.round((balance * rate) / 100 / 12)
}

export function NetWorthPage() {
  const [compareMode, setCompareMode] = useState<SnapshotComparisonMode>(
    'latest_available_vs_previous_available',
  )
  const snapshots = useAssetSnapshots()
  const history = useNetWorthHistory()
  const compare = useAssetSnapshotCompare(compareMode)
  const breakdown = useNetWorthBreakdown()
  const liquidity = useLiquidityHealth()
  const loans = useLoanSummary()
  const investments = useInvestmentSummary()
  const insurance = useInsuranceSummary()
  const profile = useProfile()
  const settings = useAnalyticsSettings()
  const forecast = useInstallmentForecast({ months: 6 })

  const latest = [...(snapshots.data?.items ?? [])]
    .reverse()
    .find((item) => item.asset_total && item.liability_total && item.net_worth)
  const currentSnapshot = compare.data?.current ?? latest
  const netWorth = currentSnapshot ? decimal(currentSnapshot.net_worth) : null
  const assetTotal = currentSnapshot ? decimal(currentSnapshot.asset_total) : null
  const liabilityTotal = currentSnapshot ? decimal(currentSnapshot.liability_total) : null
  const negativeExcluded = decimal(currentSnapshot?.negative_asset_excluded_total) ?? (currentSnapshot?.snapshot_date === breakdown.data?.snapshot_date ? decimal(breakdown.data?.negative_asset_excluded_total) : null) ?? 0
  const cashEquivalent = decimal(liquidity.data?.cash_equivalent_total)
  const emergencyMonths = liquidity.data?.emergency_fund_months ?? null
  const emergencyTarget = liquidity.data?.emergency_fund_target_months ?? null
  const targetProgress = liquidity.data?.target_progress_ratio ?? null

  const compareData = compare.data
  const compareMeta = compareData?.baseline
    ? `${compareData.baseline.snapshot_date} 대비${compareData.comparison_days != null ? ` · ${compareData.comparison_days}일` : ''}`
    : compareData?.comparison_label

  const debtStrategy = settings.data?.effective.financial_targets.debt_strategy_preference ?? null
  const sortedLoans = useMemo(() => {
    const items = [...(loans.data?.items ?? [])]
    if (debtStrategy === 'avalanche') {
      return items.sort((a, b) => (decimal(b.interest_rate) ?? 0) - (decimal(a.interest_rate) ?? 0))
    }
    if (debtStrategy === 'snowball') {
      return items.sort((a, b) => (decimal(a.balance) ?? 0) - (decimal(b.balance) ?? 0))
    }
    return items.sort((a, b) => (decimal(b.balance) ?? 0) - (decimal(a.balance) ?? 0))
  }, [loans.data?.items, debtStrategy])

  const liquidityTierTotals = useMemo(() => {
    const totals = new Map<string, number>()
    let unassigned = 0
    for (const asset of snapshots.data?.asset_items ?? []) {
      if (asset.side !== 'asset' || asset.snapshot_date !== latest?.snapshot_date || (decimal(asset.amount) ?? 0) < 0) continue
      const amount = decimal(asset.amount) ?? 0
      if (asset.liquidity_tier) totals.set(asset.liquidity_tier, (totals.get(asset.liquidity_tier) ?? 0) + amount)
      else unassigned += 1
    }
    return { totals, unassigned }
  }, [snapshots.data?.asset_items, latest?.snapshot_date])

  const remainingForecast = (forecast.data?.monthly_summary ?? []).reduce(
    (sum, item) => sum + item.projected_total, 0,
  )
  const missedForecast = (forecast.data?.monthly_summary ?? []).reduce((sum, item) => sum + (item.past_unconfirmed_total ?? item.missed_total), 0)

  const creditHistory = (profile.data?.credit_score_history ?? [])
    .map((item) => item.credit_score_kcb)
    .filter((score): score is number => score != null)

  const kpiLoading = snapshots.isLoading || liquidity.isLoading

  return (
    <>
      <PageHeader
        title="자산·부채"
        controls={
          <SegmentedControl
            ariaLabel="스냅샷 비교 모드"
            options={COMPARE_OPTIONS}
            value={compareMode}
            onChange={setCompareMode}
          />
        }
        meta={
          currentSnapshot ? (
            <span className="flex items-center gap-2">
              <span className="tnum rounded-sm border border-border bg-bg-inset px-2 py-0.5">
                스냅샷 {currentSnapshot.snapshot_date}
              </span>
              {compareMeta ? (
                <span
                  className={`tnum rounded-sm border px-2 py-0.5 ${
                    compareData?.is_stale
                      ? 'border-warn-border bg-warn-bg text-warn'
                      : 'border-border bg-bg-inset'
                  }`}
                >
                  {compareMeta}
                  {compareData?.is_stale ? ' · 오래됨' : ''}
                </span>
              ) : null}
            </span>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        {/* KPI */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {kpiLoading ? (
            <>
              <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
            </>
          ) : (
            <>
              <Stat
                label="순자산"
                className="border-t-2 border-t-accent"
                value={netWorth != null ? formatNetWon(netWorth, { compact: true }) : EM_DASH}
                badge={<Provenance title="순자산 비교 기준" rows={[
                  { label: '현재 기준', value: currentSnapshot?.snapshot_date ?? EM_DASH },
                  { label: '현재 순자산', value: netWorth != null ? formatNetWon(netWorth) : EM_DASH },
                  { label: '비교 기준', value: compareData?.baseline?.snapshot_date ?? '비교 스냅샷 없음' },
                  { label: '비교 순자산', value: compareData?.baseline ? formatNetWon(decimal(compareData.baseline.net_worth) ?? 0) : EM_DASH },
                ]} note={compareData?.can_compare ? '두 스냅샷 모두 음수 자산 행을 제외한 동일 기준입니다.' : '선택한 기간에 비교 가능한 스냅샷이 없습니다. 마감월 비교에는 각 월말의 저장 스냅샷이 필요합니다.'} />}
                sub={
                  compareData?.delta
                    ? `대비 ${formatSignedWon(decimal(compareData.delta.net_worth) ?? 0, { compact: true })} (${formatPct(compareData.delta.net_worth_pct != null ? compareData.delta.net_worth_pct * 100 : null)})`
                    : '비교 가능한 기준 스냅샷이 없습니다'
                }
                subTone={(decimal(compareData?.delta?.net_worth) ?? 0) >= 0 ? 'good' : 'bad'}
              />
              <Stat
                label="총자산"
                value={assetTotal != null ? formatWonCompact(assetTotal) : EM_DASH}
                badge={
                  negativeExcluded < 0 ? (
                    <Provenance
                      title="총자산 계산 기준"
                      rows={[{ label: '원본 음수 자산 합계', value: formatSignedWon(negativeExcluded) }, { label: '합산 기준', value: '0원 이상 자산 − 부채' }]}
                      note="마이너스 통장처럼 음수로 잡힌 자산 행은 부채 행과 이중 계산되지 않도록 총자산에서 제외합니다."
                    />
                  ) : undefined
                }
              />
              <Stat
                label="총부채"
                className="border-t-2 border-t-expense"
                value={liabilityTotal != null ? formatWonCompact(liabilityTotal) : EM_DASH}
              />
              <Stat
                label="현금성 자산"
                value={cashEquivalent != null ? formatWonCompact(cashEquivalent) : EM_DASH}
                sub={emergencyMonths != null ? `비상금 ${runwayLabel(emergencyMonths)}` : '월 필수지출 근거 부족'}
                subTone={targetProgress != null && targetProgress >= 1 ? 'good' : 'neutral'}
              />
            </>
          )}
        </div>

        {/* 순자산 추이 + 구성/신용점수 */}
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Card title="순자산 추이" meta="스냅샷 시계열">
            {history.isLoading ? <ChartSkeleton height={220} /> :
             history.error ? <ErrorState onRetry={() => void history.refetch()} /> :
             history.data && history.data.items.length > 0 ? (
               <LineArea
                 ariaLabel="순자산 추이"
                 points={history.data.items.map((point) => ({
                   label: point.snapshot_date,
                   value: decimal(point.net_worth) ?? 0,
                 }))}
               />
             ) : <EmptyState message="스냅샷 데이터가 없습니다" actionLabel="가져오기" actionTo="/data/import" />}
          </Card>

          <div className="flex flex-col gap-4">
            <Card title="순자산 구성" meta={breakdown.data?.snapshot_date ?? undefined}>
              {breakdown.isLoading ? <ListSkeleton rows={5} /> :
               breakdown.data && breakdown.data.items.length > 0 ? (
                 <HBarList
                   items={breakdown.data.items.map((item) => ({
                     label: item.side === 'asset' ? item.category : `부채 · ${item.category}`,
                     amount: Math.abs(decimal(item.amount) ?? 0),
                     color: item.side === 'asset' ? 'var(--ds-accent-fg)' : 'var(--ds-expense-fg)',
                   }))}
                 />
               ) : <EmptyState message="구성 데이터가 없습니다" />}
            </Card>

            {profile.data?.credit_score_kcb != null && (
              <Card
                title="신용점수 (KCB)"
                meta={profile.data.snapshot_date ? `기준 ${formatDay(profile.data.snapshot_date)}` : undefined}
              >
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="tnum text-kpi text-text-primary">{profile.data.credit_score_kcb}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-caption text-text-muted">
                      {[profile.data.age != null ? `${profile.data.age}세` : null, profile.data.gender]
                        .filter(Boolean)
                        .join(' · ') || EM_DASH}
                      <Provenance
                        title="프로필 출처"
                        note="BankSalad 고객정보 스냅샷입니다. 이름·이메일은 저장하지 않습니다."
                      />
                    </div>
                  </div>
                  {creditHistory.length >= 2 && (
                    <Sparkline values={creditHistory} width={140} height={36} label="신용점수 이력" />
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* 유동성 */}
        <Card
          title="유동성"
          meta={liquidityTierTotals.unassigned > 0 ? `미지정 자산 ${liquidityTierTotals.unassigned}건 ⚠` : undefined}
          action={
            <Link to="/data/assets" className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline">
              자산 메타 편집
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {liquidity.isLoading || snapshots.isLoading ? <ListSkeleton rows={4} /> :
           liquidity.data ? (
             <div className="flex flex-col gap-4">
               <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                 {(['immediate', 'near_liquid', 'illiquid'] as LiquidityTier[]).map((tier) => (
                   <div key={tier} className="rounded-md border border-border bg-bg-inset p-3">
                     <div className="text-micro text-text-faint">{LIQUIDITY_LABEL[tier]}</div>
                     <div className="tnum mt-1 text-label font-bold text-text-primary">
                       {formatWonCompact(liquidityTierTotals.totals.get(tier) ?? 0)}
                     </div>
                   </div>
                 ))}
                 <div className="rounded-md border border-border bg-bg-inset p-3">
                   <div className="text-micro text-text-faint">월 부채상환</div>
                   <div className="tnum mt-1 text-label font-bold text-expense">
                     {formatWonCompact(decimal(liquidity.data.monthly_debt_payment) ?? 0)}
                   </div>
                 </div>
               </div>
               {emergencyTarget != null && (
                 <div className="flex items-center gap-2">
                   <CoverageGauge
                     className="flex-1"
                     label={`비상금 확보 ${runwayLabel(emergencyMonths)} · 목표 ${emergencyTarget}개월`}
                     ratio={targetProgress}
                   />
                   <Provenance
                     title="비상금 목표"
                     rows={[
                       { label: '목표', value: `${emergencyTarget}개월 (설정에서 변경)` },
                       { label: '월 필수지출', value: formatWon(decimal(liquidity.data.monthly_required_spend) ?? 0) },
                       { label: '지출 기준 월', value: liquidity.data.required_spend_period ?? EM_DASH },
                       { label: '필수로 분류한 순지출', value: formatWon(decimal(liquidity.data.required_spend_essential_total) ?? 0) },
                       { label: '중복 제외 후 추가 상환', value: formatWon(decimal(liquidity.data.required_spend_additional_debt_total) ?? 0) },
                       { label: '입력 기준일', value: liquidity.data.input_as_of_date ?? liquidity.data.snapshot_date ?? EM_DASH },
                       { label: '대출 스냅샷', value: liquidity.data.debt_payment_snapshot_date ?? EM_DASH },
                       { label: '신뢰도', value: CONFIDENCE_LABEL[liquidity.data.confidence] ?? '판단 근거 부족' },
                     ]}
                     note={liquidity.data.manual_input_overrides?.includes('monthly_required_spend') ? '월 필수지출을 수동 입력한 기준입니다. 현금성 미지정 자산은 종류와 이름으로 추정합니다.' : '해당 마감월의 필수 순지출에, 이미 포함되지 않은 연결 상환 거래만 더합니다. 추정 월상환액을 다시 더하지 않습니다. 현금성 미지정 자산은 종류와 이름으로 추정하며, 일·주 환산은 30일 기준입니다.'}
                   />
                 </div>
               )}
             </div>
           ) : <EmptyState message="유동성 데이터가 없습니다" />}
        </Card>

        {/* 대출 */}
        <Card
          title="대출"
          meta={
            loans.data
              ? `총원금 ${formatWonCompact(decimal(loans.data.totals.principal) ?? 0)} · 잔액 ${formatWonCompact(decimal(loans.data.totals.balance) ?? 0)} · 정렬 ${
                  debtStrategy === 'avalanche' ? '고금리순' : debtStrategy === 'snowball' ? '잔액 적은 순' : '잔액순'
                }`
              : undefined
          }
          action={
            <Link to="/data/loans" className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline">
              대출 관리
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {loans.isLoading ? <ListSkeleton rows={4} /> :
           loans.error ? <ErrorState onRetry={() => void loans.refetch()} /> :
           sortedLoans.length > 0 ? (
             <div className="grid gap-3 xl:grid-cols-2">
               {sortedLoans.map((loan, index) => {
                 const principal = decimal(loan.principal)
                 const balance = decimal(loan.balance)
                 const progress = principal && balance != null && principal > 0 ? 1 - balance / principal : null
                 const monthlyInterest = estimatedMonthlyInterest(loan)
                 return (
                   <div key={loan.id ?? index} className="rounded-md border border-border bg-bg-inset p-3.5">
                     <div className="flex items-start justify-between gap-3">
                       <div className="min-w-0">
                         <div className="truncate text-label font-semibold text-text-primary">{loan.product_name}</div>
                         <div className="mt-0.5 text-caption text-text-muted">
                           {[loan.lender, loan.loan_kind ? LOAN_KIND_LABEL[loan.loan_kind] : null].filter(Boolean).join(' · ')}
                         </div>
                       </div>
                       <div className="text-right">
                         <div className="tnum text-label font-bold text-expense">
                           {balance != null ? formatWonCompact(balance) : EM_DASH}
                         </div>
                         <div className="tnum text-caption text-text-muted">
                           {loan.interest_rate ? `${parseFloat(loan.interest_rate).toFixed(2)}%` : EM_DASH}
                         </div>
                       </div>
                     </div>
                     <div className="tnum mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-caption text-text-muted">
                       <span className="flex items-center gap-1">
                         월상환 {loan.monthly_payment != null ? formatWonCompact(decimal(loan.monthly_payment) ?? 0) : EM_DASH}
                         <Provenance title="월상환액 출처" rows={[{ label: '출처', value: monthlyPaymentSourceLabel(loan) }]} note={[monthlyPaymentMissingLabel(loan), ...monthlyPaymentEvidence(loan)].filter(Boolean).join(' · ')} />
                       </span>
                       <span className="flex items-center gap-1">
                         월 이자 추정 {monthlyInterest != null ? formatWonCompact(monthlyInterest) : EM_DASH}
                         <Provenance
                           title="월 이자 추정"
                           note="잔액 × 금리 / 12 단리 추정입니다. 상환 스케줄 기반이 아닙니다."
                         />
                       </span>
                       <span>상환 방식 {loan.repayment_method ? REPAYMENT_LABEL[loan.repayment_method] : '미정'}</span>
                       <span>만기 {loan.maturity_date ?? EM_DASH}</span>
                     </div>
                     {progress != null && (
                       <div className="mt-2.5">
                         <div className="h-1.5 overflow-hidden rounded-sm bg-bg-surface">
                           <div className="h-full rounded-sm bg-accent" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
                         </div>
                         <div className="tnum mt-1 text-micro text-text-faint">원금 대비 {formatPct(progress * 100, 0)} 상환</div>
                       </div>
                     )}
                   </div>
                 )
               })}
             </div>
           ) : <EmptyState message="대출 데이터가 없습니다" />}
        </Card>

        {/* 투자 + 보험 */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="투자 구성" meta={investments.data?.snapshot_date ?? undefined}>
            {investments.isLoading ? <ListSkeleton rows={4} /> :
             investments.data && investments.data.items.length > 0 ? (
               <HBarList
                 items={investments.data.items.map((item) => ({
                   label: item.product_name,
                   amount: decimal(item.market_value) ?? 0,
                   sub: (
                     <>
                       {item.pct_of_investment_total != null ? `${formatPct(item.pct_of_investment_total * 100, 0)}` : EM_DASH}
                       {item.return_rate != null ? (
                         <span className={decimal(item.return_rate)! >= 0 ? 'text-income' : 'text-expense'}>
                           {' '}{decimal(item.return_rate)! >= 0 ? '+' : ''}{parseFloat(item.return_rate).toFixed(1)}%
                         </span>
                       ) : null}
                     </>
                   ),
                 }))}
               />
             ) : <EmptyState message="투자 데이터가 없습니다" />}
          </Card>

          {insurance.data && insurance.data.items.length > 0 ? (
            <Card title="보험" meta={insurance.data.snapshot_date ?? undefined}>
              <ul className="divide-y divide-border-subtle">
                {insurance.data.items.map((contract) => (
                  <li key={contract.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                    <div className="min-w-0">
                      <div className="truncate text-label text-text-primary">{contract.product_name}</div>
                      <div className="text-caption text-text-muted">
                        {[contract.insurer, contract.contract_status, contract.maturity_date ? `만기 ${contract.maturity_date}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <span className="tnum shrink-0 text-caption text-text-secondary">
                      {contract.total_paid != null ? `납입 ${formatWonCompact(decimal(contract.total_paid) ?? 0)}` : EM_DASH}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
                <span className="flex items-center gap-1.5 text-caption text-text-muted">
                  월 보험료 추정
                  <Provenance
                    title="월 보험료 추정"
                    rows={insurance.data.monthly_premium_estimate.period
                      ? [{ label: '기준 월', value: insurance.data.monthly_premium_estimate.period }]
                      : []}
                    note="최근 마감월의 보험 카테고리 순지출입니다. 사용자가 변경한 카테고리를 우선하며, 환급·취소는 차감합니다."
                  />
                </span>
                <span className="tnum text-label font-semibold text-text-primary">
                  {insurance.data.monthly_premium_estimate.amount != null
                    ? formatNetWon(decimal(insurance.data.monthly_premium_estimate.amount) ?? 0)
                    : EM_DASH}
                </span>
              </div>
            </Card>
          ) : (
            <Card title="보험">
              {insurance.isLoading ? <ListSkeleton rows={3} /> : <EmptyState message="보험 계약 스냅샷이 없습니다" />}
            </Card>
          )}
        </div>

        {/* 할부 잔여 */}
        <Card title="할부 잔여" meta="향후 6개월">
          {forecast.isLoading ? <ListSkeleton rows={1} /> :
           forecast.data && forecast.data.monthly_summary.length > 0 ? (
             <div className="flex flex-wrap items-center justify-between gap-3">
               <div className="tnum flex items-center gap-4 text-label text-text-secondary">
                 <span>미래 예정 <strong className="text-text-primary">{formatWonCompact(remainingForecast)}</strong></span>
                 {missedForecast > 0 && (
                   <Badge variant="warn">과거 연결 미확인 {formatWonCompact(missedForecast)}</Badge>
                 )}
               </div>
               <Link to="/data/installments" className="flex items-center gap-1 text-caption font-medium text-transfer hover:underline">
                 할부 관리
                 <ArrowRight className="h-3 w-3" />
               </Link>
             </div>
           ) : <EmptyState message="등록된 할부 계획이 없습니다" actionLabel="할부 관리" actionTo="/data/installments" />}
        </Card>
      </div>
    </>
  )
}
