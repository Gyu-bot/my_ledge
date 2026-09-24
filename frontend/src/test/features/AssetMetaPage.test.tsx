import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AssetMetaPage } from '../../features/data/AssetMetaPage'

const state = vi.hoisted(() => ({ cash: null as boolean | null, patch: vi.fn() }))
vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))
vi.mock('../../hooks/useAssets', () => ({
  useAssetSnapshots: () => ({ data: { items: [{ snapshot_date: '2026-06-01', asset_total: '100', liability_total: '0', net_worth: '100' }], asset_items: [{ id: 1, snapshot_date: '2026-06-01', side: 'asset', category: '예금', product_name: '테스트 통장', amount: '100', liquidity_tier: null, is_cash_equivalent: state.cash }] }, isLoading: false, error: null }),
  usePatchAssetLiquidity: () => ({ mutateAsync: state.patch, isPending: false }),
}))

describe('AssetMetaPage', () => {
  beforeEach(() => { state.cash = null; state.patch.mockReset().mockResolvedValue({}) })

  it('현금성 미지정은 자동으로 표시하고 유동성만 바꾸면 현금성은 보내지 않는다', async () => {
    render(<MemoryRouter><AssetMetaPage /></MemoryRouter>)
    expect(screen.getByLabelText('테스트 통장 현금성')).toHaveValue('automatic')
    fireEvent.change(screen.getByLabelText('테스트 통장 유동성 등급'), { target: { value: 'immediate' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(state.patch).toHaveBeenCalledWith({ id: 1, data: { liquidity_tier: 'immediate' } }))
    expect(document.body.textContent).not.toContain('₩₩')
  })

  it.each([['include', true], ['exclude', false]] as const)('명시적 %s 변경만 전송한다', async (mode, value) => {
    render(<MemoryRouter><AssetMetaPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('테스트 통장 현금성'), { target: { value: mode } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(state.patch).toHaveBeenCalledWith({ id: 1, data: { is_cash_equivalent: value } }))
  })

  it('명시적 제외를 자동으로 되돌릴 때만 null을 보낸다', async () => {
    state.cash = false
    render(<MemoryRouter><AssetMetaPage /></MemoryRouter>)
    expect(screen.getByLabelText('테스트 통장 현금성')).toHaveValue('exclude')
    fireEvent.change(screen.getByLabelText('테스트 통장 현금성'), { target: { value: 'automatic' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(state.patch).toHaveBeenCalledWith({ id: 1, data: { is_cash_equivalent: null } }))
  })
  it('현금성을 자동으로 원복하면 저장을 끄고 유동성 변경만 남으면 그것만 저장한다', async () => {
    render(<MemoryRouter><AssetMetaPage /></MemoryRouter>)
    const cash = screen.getByLabelText('테스트 통장 현금성')
    const save = screen.getByRole('button', { name: '저장' })
    expect(save).toBeDisabled()
    fireEvent.change(cash, { target: { value: 'include' } })
    expect(save).toBeEnabled()
    fireEvent.change(cash, { target: { value: 'automatic' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('테스트 통장 유동성 등급'), { target: { value: 'near_liquid' } })
    fireEvent.change(cash, { target: { value: 'exclude' } })
    fireEvent.change(cash, { target: { value: 'automatic' } })
    fireEvent.click(save)
    await waitFor(() => expect(state.patch).toHaveBeenCalledWith({ id: 1, data: { liquidity_tier: 'near_liquid' } }))
  })

})
