import { Badge } from '../../ds/Badge'
import type { LoanTransactionMappingItem } from '../../types/transaction'

const REASONS: Record<string, string> = {
  same_payment_method: '출금 수단 일치', within_day_window: '납부일 ±3일',
  amount_within_band: '최근 금액대 ±15%', merchant_seen: '거래처·원문 이력 일치',
  registered_rule: '사람이 등록한 규칙', multiple_accounts: '여러 계좌에 일치',
}

export type LoanSuggestionFields = Pick<LoanTransactionMappingItem, 'suggested_loan_account_id' | 'suggestion_basis' | 'suggestion_confidence' | 'suggestion_reasons' | 'suggestion_ambiguous'>

export function LoanSuggestionInfo({ item, accountName }: { item: LoanSuggestionFields; accountName?: string }) {
  if (!item.suggestion_basis) return null
  return <div className="mt-1 flex max-w-sm flex-wrap items-center gap-1 text-caption text-text-muted">
    <Badge variant={item.suggestion_ambiguous ? 'warn' : 'neutral'}>{item.suggestion_basis === 'rule' ? '등록 규칙' : '이력 제안'}</Badge>
    {item.suggestion_ambiguous ? <span>여러 계좌 일치 · 직접 선택 필요</span> : <span>{accountName} · 신뢰도 {item.suggestion_confidence === 'high' ? '높음' : item.suggestion_confidence === 'medium' ? '보통' : '낮음'}</span>}
    <span>{item.suggestion_reasons?.map((reason) => REASONS[reason] ?? reason).join(' · ')}</span>
  </div>
}
