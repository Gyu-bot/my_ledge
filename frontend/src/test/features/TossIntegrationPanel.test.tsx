import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TossIntegrationPanel } from '../../features/data/TossIntegrationPanel'
import type { TossIntegrationStatus } from '../../types/tossIntegration'

const mocks = vi.hoisted(() => ({
  writable: true, pending: false, loading: false, error: false,
  status: { configured: true, mapping_connected: false, cooldown_seconds: 0, last_attempt: null } as TossIntegrationStatus,
  sync: vi.fn(), refetch: vi.fn(), changed: vi.fn(),
}))
vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => mocks.writable }))
vi.mock('../../hooks/useTossIntegration', () => ({
  useTossIntegrationStatus: () => ({ data: mocks.status, isLoading: mocks.loading, error: mocks.error, refetch: mocks.refetch }),
  useSyncTossIntegration: () => ({ mutateAsync: mocks.sync, isPending: mocks.pending }),
}))
beforeEach(() => {
  mocks.writable = true; mocks.pending = false; mocks.loading = false; mocks.error = false
  mocks.status = { configured: true, mapping_connected: false, cooldown_seconds: 0, last_attempt: null }
  mocks.sync.mockReset().mockResolvedValue({ status: 'success_complete', holdings_count: 2, mapping_connected: false })
  mocks.refetch.mockReset(); mocks.changed.mockReset()
})
const renderPanel = () => render(<TossIntegrationPanel disabled={false} onSyncStateChange={mocks.changed} />)

describe('TossIntegrationPanel', () => {
  it('계좌 연결 확인은 기본 해제이고 확인 없이 수집만 할 수 있다', async () => {
    renderPanel()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(/이 그룹에는 국내·미국 주식\(ETF 포함\)만 있습니다/)
    expect(screen.getByText(/예수금은 포함하지 않습니다/)).toBeInTheDocument()
    expect(screen.getByText(/채권·옵션·예수금은 포함하지 않습니다/)).toBeInTheDocument()
    expect(screen.getByText(/평가 시각을 제공하지 않아 조회 시각 기준 추정/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '토스 보유자산 새로고침' }))
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledWith({ confirm_single_account_mapping: false }))
    expect(await screen.findByRole('status')).toHaveTextContent('계좌 연결은 아직 확인되지 않아 합산에서 제외')
    expect(mocks.changed.mock.calls).toEqual([[true], [false]])
  })

  it('명시적으로 단일 계좌 확인을 선택한 경우에만 연결을 요청한다', async () => {
    mocks.sync.mockResolvedValue({ status: 'success_complete', holdings_count: 2, mapping_connected: true })
    renderPanel()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '토스 보유자산 새로고침' }))
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledWith({ confirm_single_account_mapping: true }))
    expect(await screen.findByRole('status')).toHaveTextContent('미리보기 후 적용')
  })

  it('이미 연결된 계좌는 재확인 체크박스를 보이지 않는다', () => {
    mocks.status.mapping_connected = true
    renderPanel()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText(/계좌 연결 확인됨/)).toBeInTheDocument()
  })

  it('조회 성공 후 범위 밖 자산으로 연결이 거절되면 대체 불가 이유를 안내한다', async () => {
    mocks.sync.mockResolvedValue({ status: 'success_complete', error_code: 'unsupported_holdings_scope', holdings_count: 2, mapping_connected: false })
    renderPanel()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '토스 보유자산 새로고침' }))
    expect(await screen.findByRole('status')).toHaveTextContent('조회 범위 밖의 자산이 있어 토스 API로 대체할 수 없습니다')
    expect(screen.getByRole('status')).not.toHaveTextContent('unsupported_holdings_scope')
  })

  it.each(['unconfigured', 'readonly', 'pending', 'cooldown'] as const)('%s 상태에서는 조회할 수 없다', (state) => {
    if (state === 'unconfigured') mocks.status.configured = false
    if (state === 'readonly') mocks.writable = false
    if (state === 'pending') mocks.pending = true
    if (state === 'cooldown') mocks.status.cooldown_seconds = 20
    renderPanel()
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it.each(['failed', 'success_partial', 'rejected'])('%s 결과를 성공으로 표시하지 않고 안전한 메시지만 보여준다', async (status) => {
    mocks.sync.mockResolvedValue({ status, error_code: 'unsafe-secret-body', holdings_count: 1, mapping_connected: false })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '토스 보유자산 새로고침' }))
    expect(await screen.findByRole('status')).toHaveTextContent('마지막 완전한 정상 수집 결과를 유지')
    expect(screen.queryByText(/unsafe-secret-body/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent('1건을 조회했습니다')
  })

  it('알려진 HTTP 오류는 한국어로 안내하고 알 수 없는 본문은 숨긴다', async () => {
    mocks.sync.mockRejectedValue(new Error('409: {"detail":"sync_cooldown"} secret'))
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '토스 보유자산 새로고침' }))
    expect(await screen.findByRole('status')).toHaveTextContent('요청 간격을 두고')
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument()
    mocks.sync.mockRejectedValue(new Error('sensitive server response'))
    fireEvent.click(screen.getByRole('button', { name: '토스 보유자산 새로고침' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('완전히 조회하지 못했습니다'))
    expect(screen.queryByText(/sensitive/)).not.toBeInTheDocument()
  })

  it('조회 상태 오류를 재시도할 수 있으며 조회 버튼을 노출하지 않는다', () => {
    mocks.error = true
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: '토스 보유자산 새로고침' })).not.toBeInTheDocument()
  })
})
