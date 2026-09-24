import { Badge } from '../../ds/Badge'
import type { SelectedInvestments } from '../../types/sourcePolicy'
import { SOURCE_LABEL, sourceBasis, sourceMoney, sourceReason, sourceTime, syncStatus } from './sourcePresentation'

export function SourceSelectionDetails({ data }: { data: SelectedInvestments }) {
  return (
    <div className="flex flex-col gap-3 text-caption">
      <div className="flex flex-wrap gap-2">
        <Badge>뱅샐 스냅샷 {data.banksalad_snapshot_date ?? '없음'}</Badge>
        <Badge>조회 기준일 {data.as_of_date}</Badge>
        {data.mixed_dates && <Badge variant="estimate">서로 다른 기준일 · 추정</Badge>}
      </div>
      {data.warnings.length > 0 && <ul className="list-disc space-y-1 pl-4 text-warn">{data.warnings.map((warning) => <li key={warning}>{sourceReason(warning)}</li>)}</ul>}
      <p className="text-text-muted">투자 관측: 원본 {data.coverage.raw}건 · 선택 {data.coverage.selected}건 · 제외 {data.coverage.excluded}건 · 숨김 {data.coverage.hidden}건 / 계좌 연결 확인 {data.coverage.confirmed}건 · 충돌 {data.coverage.conflicted}그룹 · 오래됨 {data.coverage.stale}그룹</p>
      {data.accounts.length === 0 ? <p className="text-text-muted">아직 선택할 투자 계좌가 없습니다.</p> : (
        <ul className="divide-y divide-border-subtle">
          {data.accounts.map((account) => (
            <li key={account.account_key} className="space-y-1 py-3 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="break-all text-text-secondary" title={account.account_key}>{account.broker ?? '투자'} 계좌 그룹</strong>
                <span className="tnum">{account.conflicts.some((reason) => ['missing_valuation', 'instrument_mapping_ambiguous', 'currency_mismatch'].includes(reason)) ? '확인된 소계 ' : ''}{sourceMoney(account.market_value)}</span>
              </div>
              <p>설정 {SOURCE_LABEL[account.configured_source]} → 적용 {account.effective_source ? SOURCE_LABEL[account.effective_source] : '미선택'} · {sourceBasis(account.configured_source_basis)}</p>
              <p className="text-text-muted">평가 시점 {sourceTime(account.valuation_at, account.valuation_precision ?? (account.effective_source === 'banksalad_snapshot' ? 'date' : 'timestamp'))} · 수집 시점 {sourceTime(account.ingested_at)}</p>
              {account.observed_at && <p className="text-text-muted">원본 관측 시점 {sourceTime(account.observed_at)}</p>}
              {account.configured_source === 'toss_securities_api' && <p className="text-text-muted">토스 최근 수집 {sourceTime(account.last_attempt_at ?? null)} ({syncStatus(account.last_attempt_status)}) · 마지막 정상 수집 {sourceTime(account.last_success_at ?? null)}</p>}
              <p className="text-text-muted">선택 수집 #{account.selected_run_id ?? '없음'} · 보유 {account.holdings_count}건 {account.is_stale && <Badge variant="warn">오래된 평가값</Badge>}</p>
              {account.fallback_reason && <p className="text-warn">대체 사유: {sourceReason(account.fallback_reason)}</p>}
              {account.conflicts.length > 0 && <p className="text-warn">확인 필요: {account.conflicts.map(sourceReason).join(' · ')}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
