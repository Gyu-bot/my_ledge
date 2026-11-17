import { writeErrorMessage } from '../analysis/text'
import { Button } from '../../ds/Button'
import { toast } from '../../ds/toastStore'
import { useLoanAccounts, useLoanMerchantRules, useUpsertLoanMerchantRule } from '../../hooks/useTransactions'
import type { LoanRepaymentType } from '../../types/transaction'

export interface LoanRuleTarget { merchant: string; accountId: number; repayment: LoanRepaymentType }

export function LoanRulePrompt({ targets, onClose }: { targets: LoanRuleTarget[]; onClose: () => void }) {
  const rules = useLoanMerchantRules()
  const accounts = useLoanAccounts({ include_hidden: true })
  const upsert = useUpsertLoanMerchantRule()
  const pending = targets.filter((target, index) => target.merchant.trim() && !targets.slice(0, index).some((previous) => previous.merchant === target.merchant)
    && !rules.data?.items.some((rule) => rule.match_field === 'merchant' && rule.merchant === target.merchant))
  if (!pending.length || !rules.data) return null
  async function save(target: LoanRuleTarget) {
    try {
      await upsert.mutateAsync({ merchant: target.merchant, match_field: 'merchant', loan_account_id: target.accountId, repayment_type: target.repayment, memo: null })
      toast.success('거래처 규칙을 추가했습니다')
    } catch (error) { toast.error('규칙 저장 실패', { description: writeErrorMessage(error) }) }
  }
  return <div className="mt-2 rounded-md border border-border bg-bg-inset p-3 text-caption text-text-secondary">
    <p>연결을 확인했습니다. 앞으로 같은 거래처의 거래를 이 계좌에 연결할 규칙을 추가할 수 있습니다.</p>
    {pending.map((target) => <div key={target.merchant} className="mt-2 flex flex-wrap items-center gap-2"><span>{target.merchant} → {accounts.data?.items.find((account) => account.loan_account_id === target.accountId)?.display_name ?? '선택한 계좌'}</span><Button disabled={upsert.isPending || targets.some((other) => other.merchant === target.merchant && other.accountId !== target.accountId)} onClick={() => void save(target)}>이 거래처로 규칙 추가</Button></div>)}
    {targets.some((target) => targets.some((other) => other.merchant === target.merchant && other.accountId !== target.accountId)) && <p className="mt-2 text-warn">같은 거래처를 서로 다른 계좌에 연결했습니다. 규칙 탭에서 매칭 기준을 직접 확인하세요.</p>}
    <Button variant="ghost" onClick={onClose}>닫기</Button>
  </div>
}
