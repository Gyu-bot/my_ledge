import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '../../features/data/SettingsPage'

const patchMutate = vi.fn().mockResolvedValue({})

vi.mock('../../hooks/useSettings', () => ({
  useAnalyticsSettings: () => ({
    data: {
      defaults: { financial_targets: { emergency_fund_target_months: 3, savings_rate_target: null, debt_strategy_preference: null } },
      saved: {},
      effective: { financial_targets: { emergency_fund_target_months: 4, savings_rate_target: 0.5, debt_strategy_preference: 'avalanche' } },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePatchAnalyticsSettings: () => ({ mutateAsync: patchMutate, isPending: false }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function renderPage() {
  return render(<MemoryRouter><SettingsPage /></MemoryRouter>)
}

describe('SettingsPage', () => {
  it('effective 값으로 폼을 초기화한다 (4개월 / 50% / avalanche)', () => {
    renderPage()
    expect(screen.getByDisplayValue('4')).toBeInTheDocument() // 비상금 목표
    expect(screen.getByDisplayValue('50')).toBeInTheDocument() // 저축률 목표
    expect((screen.getByText('고금리 우선 (avalanche)') as HTMLOptionElement).selected).toBe(true)
  })

  it('저장 시 % → 비율 변환하여 PATCH한다', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '목표 저장' }))
    await waitFor(() => {
      expect(patchMutate).toHaveBeenCalledWith({
        financial_targets: { emergency_fund_target_months: 4, savings_rate_target: 0.5, debt_strategy_preference: 'avalanche' },
      })
    })
  })
})
