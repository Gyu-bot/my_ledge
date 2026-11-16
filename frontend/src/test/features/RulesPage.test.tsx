import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RulesPage } from '../../features/data/RulesPage'

const mutations = vi.hoisted(() => ({ alias: vi.fn(), apply: vi.fn(), settings: vi.fn() }))
vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))
vi.mock('../../hooks/useTransactions', () => ({
  useAutoClassificationSettings: () => ({ data: { apply_loan_rules_on_upload: false }, isLoading: false }),
  usePatchAutoClassificationSettings: () => ({ mutateAsync: mutations.settings, isPending: false }),
  useMerchantAliasRules: () => ({ data: { items: [] }, isLoading: false }),
  useUpsertMerchantAliasRule: () => ({ mutateAsync: mutations.alias, isPending: false }),
  useApplyMerchantAliasRules: () => ({ mutateAsync: mutations.apply, isPending: false }),
}))

beforeEach(() => { vi.clearAllMocks(); mutations.alias.mockResolvedValue({}); mutations.apply.mockResolvedValue({ updated: 1 }) })

describe('RulesPage retired classification inputs', () => {
  it('이전 분류 입력 없이 사람이 관리하는 새 축으로 안내한다', () => {
    render(<MemoryRouter><RulesPage /></MemoryRouter>)
    for (const label of ['비용 성격', '필수/재량', '반복결제 규칙', '고정비 규칙']) expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '작업대로 이동' })).toHaveAttribute('href', '/data/nature')
    expect(screen.getByRole('link', { name: '약정 현황으로 이동' })).toHaveAttribute('href', '/commitments')
    expect(mutations.alias).not.toHaveBeenCalled()
    expect(mutations.apply).not.toHaveBeenCalled()
  })
  it('거래처 정규화와 대출 규칙은 기존 조작을 유지한다', async () => {
    render(<MemoryRouter><RulesPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('포함 패턴'), { target: { value: 'synthetic-raw' } })
    fireEvent.change(screen.getByLabelText('정규 거래처'), { target: { value: 'synthetic-normalized' } })
    fireEvent.click(screen.getByRole('button', { name: '규칙 저장' }))
    await waitFor(() => expect(mutations.alias).toHaveBeenCalledWith({ alias_pattern: 'synthetic-raw', normalized_merchant: 'synthetic-normalized' }))
    fireEvent.click(screen.getByLabelText('업로드 후 대출 거래처 규칙 적용'))
    await waitFor(() => expect(mutations.settings).toHaveBeenCalledWith({ apply_loan_rules_on_upload: true }))
  })
})
