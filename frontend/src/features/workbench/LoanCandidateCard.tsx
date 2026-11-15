import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../ds/Badge'
import { Button } from '../../ds/Button'
import { Field, Select } from '../../ds/Field'
import { toast } from '../../ds/toastStore'
import { formatSignedWon } from '../../ds/format'
import { useBulkLinkTransactionsToLoan, useReviewLoanTransactionCandidate } from '../../hooks/useTransactions'
import { useWriteAccess } from '../../hooks/useWriteAccess'
import type { LoanAccountCandidate, LoanRepaymentType } from '../../types/transaction'
import { writeErrorMessage } from '../analysis/text'

function accountValue(account: LoanAccountCandidate) {
  return account.loan_account_id !== null ? `id:${account.loan_account_id}` : `pair:${account.lender}:${account.product_name}`
}

/** 대출 연결 후보 한 건 — 사람이 계좌를 골라 연결하거나 "후보 아님"으로 넘긴다. */
export function LoanCandidateCard({
  item,
  accounts,
}: {
  item: { transaction_id: number; date: string; merchant: string; amount: number; effective_category_major: string }
  accounts: LoanAccountCandidate[]
}) {
  const hasWrite = useWriteAccess()
  const link = useBulkLinkTransactionsToLoan()
  const review = useReviewLoanTransactionCandidate()
  const [accountKey, setAccountKey] = useState('')
  const [repayment, setRepayment] = useState<LoanRepaymentType>('mixed')
  const controlsDisabled = !hasWrite || link.isPending || review.isPending

  async function connect() {
    const account = accounts.find((candidate) => accountValue(candidate) === accountKey)
    if (!account) return
    try {
      const result = await link.mutateAsync({
        transaction_ids: [item.transaction_id],
        loan_account_id: account.loan_account_id,
        lender: account.loan_account_id === null ? account.lender : null,
        product_name: account.loan_account_id === null ? account.product_name : null,
        repayment_type: repayment,
        memo: null,
      })
      toast.success('대출 연결 완료', { description: `${result.updated}건 반영` })
    } catch (error) {
      toast.error('대출 연결 실패', { description: writeErrorMessage(error) })
    }
  }

  async function dismissCandidate() {
    try {
      await review.mutateAsync({
        transactionId: item.transaction_id,
        data: { review_status: 'not_candidate' },
      })
      toast.success('대출 후보 제외 완료', { description: item.merchant })
    } catch (error) {
      toast.error('대출 후보 제외 실패', { description: writeErrorMessage(error) })
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-inset px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="warn">대출 연결 후보</Badge>
        <span className="text-label font-semibold text-text-primary">{item.merchant}</span>
        <span className="tnum text-caption text-text-muted">{item.date} · {formatSignedWon(item.amount)} · {item.effective_category_major}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-end gap-2">
        <Field label="대출 계좌">
          <Select disabled={controlsDisabled} value={accountKey} onChange={(event) => setAccountKey(event.target.value)}>
            <option value="">— 선택 —</option>
            {accounts.map((account) => <option key={accountValue(account)} value={accountValue(account)}>{account.display_name}</option>)}
          </Select>
        </Field>
        <Field label="상환 성격">
          <Select disabled={controlsDisabled} value={repayment} onChange={(event) => setRepayment(event.target.value as LoanRepaymentType)}>
            <option value="mixed">원리금</option><option value="interest">이자</option><option value="principal">원금</option><option value="unknown">미정</option>
          </Select>
        </Field>
        <Button variant="primary" disabled={controlsDisabled || !accountKey} onClick={() => void connect()}>연결</Button>
        <Button variant="secondary" disabled={controlsDisabled} onClick={() => void dismissCandidate()}>
          {review.isPending ? '처리 중...' : '대출 후보 아님'}
        </Button>
        <Link to="/data/loans" className="pb-1.5 text-caption text-transfer hover:underline">대출에서 열기</Link>
      </div>
    </div>
  )
}
