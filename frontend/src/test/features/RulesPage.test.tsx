import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RulesPage } from '../../features/data/RulesPage'

const mutations = vi.hoisted(() => ({ remove: vi.fn(), recurring: vi.fn() }))
vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))
vi.mock('../../hooks/useTransactions', () => {
  const query = (data: unknown) => ({ data, isLoading: false })
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false })
  return {
    useAutoClassificationSettings: () => query({}),
    usePatchAutoClassificationSettings: mutation,
    useTransactionFilterOptions: () => query({ category_options: ['식비'], category_minor_options_by_major: {} }),
    useCategoryClassificationRules: () => query({ items: [{ id: 7, category_major: '유효하지 않은 분류', category_minor: null, category_valid: false, validation_message: '현재 지출 카테고리에 없는 규칙입니다.', cost_kind: 'variable', spend_necessity: null }] }),
    useMerchantAliasRules: () => query({ items: [] }),
    useRecurringCategoryRules: () => query({ items: [] }),
    useDeleteCategoryClassificationRule: () => ({ mutateAsync: mutations.remove, isPending: false }),
    useDeleteRecurringCategoryRule: () => ({ mutateAsync: mutations.recurring, isPending: false }),
    useUpsertCategoryClassificationRule: mutation,
    useApplyCategoryClassificationRules: mutation,
    useUpsertMerchantAliasRule: mutation,
    useApplyMerchantAliasRules: mutation,
    useUpsertRecurringCategoryRule: mutation,
    useApplyRecurringCategoryRules: mutation,
  }
})

describe('RulesPage invalid rules', () => {
  beforeEach(() => { mutations.remove.mockReset().mockResolvedValue(undefined) })
  afterEach(() => vi.restoreAllMocks())

  it('유효하지 않은 카테고리 규칙을 표시하고 확인 후 해당 규칙만 삭제한다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MemoryRouter><RulesPage /></MemoryRouter>)
    expect(screen.getByRole('alert')).toHaveTextContent('일치하지 않는 규칙')
    expect(screen.getByText('현재 지출 카테고리에 없는 규칙입니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(mutations.remove).toHaveBeenCalledWith(7))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('기존 거래의 분류는 유지'))
  })

  it('삭제 확인을 취소하면 요청하지 않는다', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MemoryRouter><RulesPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(mutations.remove).not.toHaveBeenCalled()
  })
})
