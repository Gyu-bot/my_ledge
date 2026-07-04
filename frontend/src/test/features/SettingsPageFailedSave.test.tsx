import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../../features/data/SettingsPage'
import type { AnalyticsSettingsResponse } from '../../types/settings'
import { analyticsSettingsResponse } from './settingsPageFixtures'

const patchMutate = vi.fn().mockResolvedValue({})
const settingsMock = vi.hoisted(() => ({
  analyticsSettingsResponse: null as AnalyticsSettingsResponse | null,
}))

vi.mock('../../hooks/useSettings', () => ({
  useAnalyticsSettings: () => ({
    data: settingsMock.analyticsSettingsResponse,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePatchAnalyticsSettings: () => ({ mutateAsync: patchMutate, isPending: false }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function settingsPage() {
  return <MemoryRouter><SettingsPage /></MemoryRouter>
}

function getByLabelPrefix(label: string): HTMLElement {
  return screen.getByLabelText((content) => content.startsWith(label))
}

describe('SettingsPage failed analytics save', () => {
  beforeEach(() => {
    patchMutate.mockReset()
    patchMutate.mockResolvedValue({})
    settingsMock.analyticsSettingsResponse = analyticsSettingsResponse
  })

  it('failed analytics PATCH keeps the dirty draft visible after an effective refetch', async () => {
    patchMutate.mockRejectedValueOnce(new Error('network down'))
    const view = render(settingsPage())

    fireEvent.change(getByLabelPrefix('대형 구매 기준 (원)'), { target: { value: '250000' } })
    fireEvent.click(screen.getByRole('button', { name: '분석 설정 저장' }))

    await waitFor(() => {
      expect(patchMutate).toHaveBeenCalledTimes(1)
    })

    settingsMock.analyticsSettingsResponse = {
      ...analyticsSettingsResponse,
      effective: {
        ...analyticsSettingsResponse.effective,
        purchase_gate: {
          ...analyticsSettingsResponse.effective.purchase_gate,
          large_purchase_threshold: 111000,
        },
      },
    }
    view.rerender(settingsPage())

    expect(getByLabelPrefix('대형 구매 기준 (원)')).toHaveValue(250000)
  })
})
