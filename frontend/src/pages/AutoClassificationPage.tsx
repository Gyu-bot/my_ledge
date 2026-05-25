import { useEffect, useState } from 'react'
import { AlertBanner } from '../components/ui/AlertBanner'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { useChromeContext } from '../components/layout/chromeContext'
import {
  useApplyCategoryClassificationRules,
  useApplyLoanMerchantRules,
  useAutoClassificationSettings,
  useCategoryClassificationRules,
  useLoanAccounts,
  useLoanMerchantRules,
  usePatchAutoClassificationSettings,
  useUpsertCategoryClassificationRule,
  useUpsertLoanMerchantRule,
} from '../hooks/useTransactions'
import { useWriteAccess } from '../hooks/useWriteAccess'
import type { LoanRepaymentType } from '../types/transaction'

type CostKind = 'fixed' | 'variable'
type Necessity = '' | 'essential' | 'discretionary'

const INPUT_CLS = 'text-caption text-text-secondary bg-surface-bar border border-border-subtle rounded-md px-2.5 py-1.5 disabled:opacity-50'

const REPAYMENT_LABEL: Record<LoanRepaymentType, string> = {
  principal: '원금',
  interest: '이자',
  mixed: '원리금',
  unknown: '미정',
}

export function AutoClassificationPage() {
  const hasWrite = useWriteAccess()
  const { setMetaBadge } = useChromeContext()
  const settings = useAutoClassificationSettings()
  const categoryRules = useCategoryClassificationRules()
  const loanRules = useLoanMerchantRules()
  const loanAccounts = useLoanAccounts()
  const patchSettings = usePatchAutoClassificationSettings()
  const upsertCategoryRule = useUpsertCategoryClassificationRule()
  const applyCategoryRules = useApplyCategoryClassificationRules()
  const upsertLoanRule = useUpsertLoanMerchantRule()
  const applyLoanRules = useApplyLoanMerchantRules()

  const [categoryMajor, setCategoryMajor] = useState('')
  const [categoryMinor, setCategoryMinor] = useState('')
  const [costKind, setCostKind] = useState<CostKind>('variable')
  const [necessity, setNecessity] = useState<Necessity>('')
  const [merchant, setMerchant] = useState('')
  const [loanAccountId, setLoanAccountId] = useState('')
  const [repaymentType, setRepaymentType] = useState<LoanRepaymentType>('mixed')
  const [loanMemo, setLoanMemo] = useState('')
  const [alert, setAlert] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)

  useEffect(() => {
    const total = (categoryRules.data?.items.length ?? 0) + (loanRules.data?.items.length ?? 0)
    setMetaBadge(
      <span className="text-caption text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {total}개 규칙
      </span>,
    )
    return () => setMetaBadge(null)
  }, [categoryRules.data, loanRules.data, setMetaBadge])

  async function toggleSetting(field: 'apply_cost_rules_on_upload' | 'apply_loan_rules_on_upload', value: boolean) {
    try {
      await patchSettings.mutateAsync({ [field]: value })
      setAlert({ variant: 'success', title: '자동 적용 옵션 저장 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '자동 적용 옵션 저장 실패', description: String(e) })
    }
  }

  async function saveCategoryRule() {
    if (!categoryMajor.trim()) return
    try {
      await upsertCategoryRule.mutateAsync({
        category_major: categoryMajor.trim(),
        category_minor: categoryMinor.trim() || null,
        cost_kind: costKind,
        fixed_cost_necessity: costKind === 'fixed' ? (necessity || null) : null,
      })
      setCategoryMajor('')
      setCategoryMinor('')
      setCostKind('variable')
      setNecessity('')
      setAlert({ variant: 'success', title: '고정비 규칙 저장 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '고정비 규칙 저장 실패', description: String(e) })
    }
  }

  async function applyExistingCategoryRules() {
    try {
      const result = await applyCategoryRules.mutateAsync()
      setAlert({ variant: 'success', title: '고정비 규칙 일괄 적용 완료', description: `${result.updated}건 반영` })
    } catch (e) {
      setAlert({ variant: 'error', title: '고정비 규칙 일괄 적용 실패', description: String(e) })
    }
  }

  async function saveLoanRule() {
    const parsedLoanAccountId = Number(loanAccountId)
    if (!merchant.trim() || !Number.isFinite(parsedLoanAccountId)) return
    try {
      await upsertLoanRule.mutateAsync({
        merchant: merchant.trim(),
        loan_account_id: parsedLoanAccountId,
        repayment_type: repaymentType,
        memo: loanMemo.trim() || null,
      })
      setMerchant('')
      setLoanAccountId('')
      setRepaymentType('mixed')
      setLoanMemo('')
      setAlert({ variant: 'success', title: '대출 거래처 규칙 저장 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '대출 거래처 규칙 저장 실패', description: String(e) })
    }
  }

  async function applyExistingLoanRules() {
    try {
      const result = await applyLoanRules.mutateAsync()
      setAlert({ variant: 'success', title: '대출 거래처 규칙 일괄 적용 완료', description: `${result.updated}건 반영` })
    } catch (e) {
      setAlert({ variant: 'error', title: '대출 거래처 규칙 일괄 적용 실패', description: String(e) })
    }
  }

  const isLoading = settings.isLoading || categoryRules.isLoading || loanRules.isLoading
  const disabled = !hasWrite

  return (
    <div className="flex flex-col gap-3">
      {alert && (
        <AlertBanner
          variant={alert.variant}
          title={alert.title}
          description={alert.description}
          onDismiss={() => setAlert(null)}
        />
      )}

      {!hasWrite && (
        <AlertBanner
          variant="warn"
          title="읽기 전용 모드"
          description="API 키가 없어 자동분류 설정 저장이 비활성화됩니다."
        />
      )}

      <section className="bg-surface-card border border-border-subtle rounded-card px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-caption text-text-secondary font-semibold">자동분류 옵션</div>
            <div className="text-micro text-text-ghost mt-0.5">업로드 후 자동 적용 여부와 기존 데이터 일괄 적용을 관리합니다.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-caption text-text-secondary">
              <input
                type="checkbox"
                aria-label="업로드 후 고정비 규칙 자동 적용"
                checked={settings.data?.apply_cost_rules_on_upload ?? false}
                disabled={disabled || patchSettings.isPending}
                onChange={(event) => void toggleSetting('apply_cost_rules_on_upload', event.target.checked)}
                className="w-3 h-3 accent-accent disabled:opacity-40"
              />
              업로드 후 고정비 규칙 자동 적용
            </label>
            <label className="flex items-center gap-2 text-caption text-text-secondary">
              <input
                type="checkbox"
                aria-label="업로드 후 대출 거래처 규칙 자동 적용"
                checked={settings.data?.apply_loan_rules_on_upload ?? false}
                disabled={disabled || patchSettings.isPending}
                onChange={(event) => void toggleSetting('apply_loan_rules_on_upload', event.target.checked)}
                className="w-3 h-3 accent-accent disabled:opacity-40"
              />
              업로드 후 대출 거래처 규칙 자동 적용
            </label>
          </div>
        </div>
      </section>

      {isLoading ? <LoadingState /> : (
        <>
          <section className="bg-surface-card border border-border-subtle rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-faint">
              <div>
                <span className="text-label font-semibold text-text-secondary">고정비/변동비 규칙</span>
                <div className="text-micro text-text-ghost mt-0.5">대분류와 소분류 기준으로 비용 성격을 저장합니다.</div>
              </div>
              <button
                type="button"
                onClick={() => void applyExistingCategoryRules()}
                disabled={disabled || applyCategoryRules.isPending}
                className="text-caption px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md disabled:opacity-40"
              >
                고정비 규칙 일괄 적용
              </button>
            </div>

            <div className="px-4 py-3 flex flex-wrap items-end gap-2 border-b border-border-faint">
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">대분류</span>
                <input aria-label="대분류" className={`${INPUT_CLS} w-28`} value={categoryMajor} onChange={(event) => setCategoryMajor(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">소분류</span>
                <input aria-label="소분류" className={`${INPUT_CLS} w-28`} value={categoryMinor} onChange={(event) => setCategoryMinor(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">비용 성격</span>
                <select aria-label="비용 성격" className={INPUT_CLS} value={costKind} onChange={(event) => setCostKind(event.target.value as CostKind)}>
                  <option value="variable">변동비</option>
                  <option value="fixed">고정비</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">고정비 필수 여부</span>
                <select aria-label="고정비 필수 여부" className={INPUT_CLS} value={necessity} disabled={costKind !== 'fixed'} onChange={(event) => setNecessity(event.target.value as Necessity)}>
                  <option value="">미지정</option>
                  <option value="essential">필수</option>
                  <option value="discretionary">비필수</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void saveCategoryRule()}
                disabled={disabled || !categoryMajor.trim() || upsertCategoryRule.isPending}
                className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
              >
                고정비 규칙 저장
              </button>
            </div>

            {categoryRules.data && categoryRules.data.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-caption" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th className="text-micro text-text-ghost px-4 py-2 text-left font-medium">카테고리</th>
                      <th className="text-micro text-text-ghost px-4 py-2 text-left font-medium">분류</th>
                      <th className="text-micro text-text-ghost px-4 py-2 text-left font-medium">필수 여부</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRules.data.items.map((rule) => (
                      <tr key={rule.id} className="border-t border-border-faint">
                        <td className="px-4 py-2 text-text-secondary truncate">
                          {rule.category_major}{rule.category_minor ? ` / ${rule.category_minor}` : ''}
                        </td>
                        <td className="px-4 py-2 text-text-muted">{rule.cost_kind === 'fixed' ? '고정비' : '변동비'}</td>
                        <td className="px-4 py-2 text-text-muted">{rule.fixed_cost_necessity === 'essential' ? '필수' : rule.fixed_cost_necessity === 'discretionary' ? '비필수' : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState message="등록된 고정비 규칙이 없습니다." />}
          </section>

          <section className="bg-surface-card border border-border-subtle rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-faint">
              <div>
                <span className="text-label font-semibold text-text-secondary">대출 거래처 규칙</span>
                <div className="text-micro text-text-ghost mt-0.5">거래처명이 정확히 일치하는 지출 거래를 대출 계좌와 연결합니다.</div>
              </div>
              <button
                type="button"
                onClick={() => void applyExistingLoanRules()}
                disabled={disabled || applyLoanRules.isPending}
                className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
              >
                대출 거래처 규칙 일괄 적용
              </button>
            </div>

            <div className="px-4 py-3 flex flex-wrap items-end gap-2 border-b border-border-faint">
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">거래처명</span>
                <input aria-label="거래처명" className={`${INPUT_CLS} w-36`} value={merchant} onChange={(event) => setMerchant(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">대출 계좌</span>
                <select aria-label="대출 계좌" className={`${INPUT_CLS} min-w-44`} value={loanAccountId} onChange={(event) => setLoanAccountId(event.target.value)}>
                  <option value="">— 선택 —</option>
                  {loanAccounts.data?.items
                    .filter((account) => account.loan_account_id !== null)
                    .map((account) => (
                      <option key={account.loan_account_id} value={account.loan_account_id ?? ''}>{account.display_name}</option>
                    ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">상환 성격</span>
                <select className={INPUT_CLS} value={repaymentType} onChange={(event) => setRepaymentType(event.target.value as LoanRepaymentType)}>
                  <option value="mixed">원리금</option>
                  <option value="interest">이자</option>
                  <option value="principal">원금</option>
                  <option value="unknown">미정</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-micro text-text-faint">메모</span>
                <input className={`${INPUT_CLS} w-36`} value={loanMemo} onChange={(event) => setLoanMemo(event.target.value)} />
              </label>
              <button
                type="button"
                onClick={() => void saveLoanRule()}
                disabled={disabled || !merchant.trim() || !loanAccountId || upsertLoanRule.isPending}
                className="text-caption px-3 py-1.5 bg-info-dim border border-info-muted text-info-default rounded-md disabled:opacity-40"
              >
                대출 거래처 규칙 저장
              </button>
            </div>

            {loanRules.data && loanRules.data.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-caption" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th className="text-micro text-text-ghost px-4 py-2 text-left font-medium">거래처</th>
                      <th className="text-micro text-text-ghost px-4 py-2 text-left font-medium">대출 계좌</th>
                      <th className="text-micro text-text-ghost px-4 py-2 text-left font-medium">상환 성격</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loanRules.data.items.map((rule) => (
                      <tr key={rule.id} className="border-t border-border-faint">
                        <td className="px-4 py-2 text-text-secondary truncate">{rule.merchant}</td>
                        <td className="px-4 py-2 text-text-muted truncate">{rule.display_name}</td>
                        <td className="px-4 py-2 text-text-muted">{REPAYMENT_LABEL[rule.repayment_type]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState message="등록된 대출 거래처 규칙이 없습니다." />}
          </section>
        </>
      )}
    </div>
  )
}
