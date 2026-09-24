import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SourcePolicyEditor } from '../../features/data/SourcePolicyEditor'
import { selectedInvestments, sourcePolicy, sourcePreview } from './sourcePolicyFixtures'

const mocks = vi.hoisted(() => ({
  writable: true, loading: false, error: false, selectedError: false, otherBroker: false,
  preview: vi.fn(), apply: vi.fn(), refetch: vi.fn(),
}))
vi.mock('../../hooks/useSourcePolicy', () => ({
  useSourcePolicy: () => ({ data: mocks.loading || mocks.error ? undefined : sourcePolicy, isLoading: mocks.loading, error: mocks.error, refetch: mocks.refetch }),
  useSelectedInvestments: () => ({ data: mocks.selectedError ? undefined : { ...selectedInvestments, accounts: selectedInvestments.accounts.map((account) => ({ ...account, broker: mocks.otherBroker ? '다른증권사' : account.broker })) }, isLoading: false, error: mocks.selectedError, refetch: mocks.refetch }),
  usePreviewSourcePolicy: () => ({ mutateAsync: mocks.preview, isPending: false }),
  useApplySourcePolicy: () => ({ mutateAsync: mocks.apply, isPending: false }),
}))
vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => mocks.writable }))

beforeEach(() => {
  mocks.writable = true; mocks.loading = false; mocks.error = false; mocks.selectedError = false; mocks.otherBroker = false
  mocks.preview.mockReset().mockResolvedValue(sourcePreview)
  mocks.apply.mockReset().mockResolvedValue({ ...sourcePolicy, revision: 2, ...sourcePreview.policy })
  mocks.refetch.mockReset()
})

describe('SourcePolicyEditor', () => {
  it('실제 적용 소스와 평가/수집 시점, stale와 fallback을 구분한다', () => {
    render(<SourcePolicyEditor />)
    expect(screen.getByLabelText('토스증권 투자 기본 소스')).toHaveValue('banksalad_snapshot')
    expect(screen.getByText(/Toss 투자 항목만 대체, 나머지는 BankSalad 유지/)).toBeInTheDocument()
    expect(screen.getByText(/API 자동 연결은 아직 제공되지 않습니다/)).toBeInTheDocument()
    expect(screen.getByText(/뱅샐 스냅샷 2026-09-01/)).toBeInTheDocument()
    expect(screen.getByText(/평가 시점.*2026.*09.*01.*수집 시점.*2026.*09.*03/)).toBeInTheDocument()
    expect(screen.getByText(/평가 시점/)).toHaveTextContent('(날짜 기준)')
    expect(screen.getByText(/평가 시점/).textContent?.split(' · 수집 시점')[0]).not.toMatch(/00:00|09:00/)
    expect(screen.getByText('오래된 평가값')).toBeInTheDocument()
    expect(screen.getByText(/대체 사유: 선택한 소스의 정상 수집 결과/)).toBeInTheDocument()
  })

  it('계좌 예외 미리보기 후 명시적으로 확인해야 적용하며 폼 편집 시 미리보기를 폐기한다', async () => {
    render(<SourcePolicyEditor />)
    fireEvent.change(screen.getByLabelText('계좌 그룹 토스증권'), { target: { value: 'toss_securities_api' } })
    expect(mocks.apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '변경 미리보기' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '확인 후 소스 적용' })).toBeInTheDocument())
    expect(mocks.preview).toHaveBeenCalledWith({ global_source: 'banksalad_snapshot', investment_source: 'banksalad_snapshot', stale_after_days: 7, account_overrides: [{ account_key: 'broker:toss', source: 'toss_securities_api' }] })
    expect(mocks.apply).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('오래된 평가 기준 (일)'), { target: { value: '14' } })
    expect(screen.queryByRole('button', { name: '확인 후 소스 적용' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '변경 미리보기' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '확인 후 소스 적용' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '확인 후 소스 적용' }))
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith({ policy: sourcePreview.policy, preview_token: sourcePreview.preview_token, confirmed: true }))
    expect(screen.getByRole('status')).toHaveTextContent('소스 선택을 저장했습니다.')
  })

  it('실패한 적용은 다시 미리보기하도록 하고 성공 메시지를 표시하지 않는다', async () => {
    mocks.apply.mockRejectedValue(new Error('409 stale preview'))
    render(<SourcePolicyEditor />)
    fireEvent.click(screen.getByRole('button', { name: '변경 미리보기' }))
    fireEvent.click(await screen.findByRole('button', { name: '확인 후 소스 적용' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('다시 미리보기'))
    expect(screen.queryByRole('button', { name: '확인 후 소스 적용' })).not.toBeInTheDocument()
    expect(screen.queryByText('소스 선택을 저장했습니다.')).not.toBeInTheDocument()
  })

  it('읽기 전용에서는 소스 선택·미리보기·저장을 허용하지 않는다', () => {
    mocks.writable = false
    render(<SourcePolicyEditor />)
    expect(screen.getByText(/읽기 전용/)).toBeInTheDocument()
    expect(screen.getByLabelText('토스증권 투자 기본 소스')).toBeDisabled()
    expect(screen.getByLabelText('계좌 그룹 토스증권')).toBeDisabled()
    expect(screen.getByRole('button', { name: '변경 미리보기' })).toBeDisabled()
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('다른 증권사 계좌에는 토스 API 예외를 선택할 수 없다', () => {
    mocks.otherBroker = true
    render(<SourcePolicyEditor />)
    expect(within(screen.getByLabelText('계좌 그룹 다른증권사')).getByRole('option', { name: '토스증권 API' })).toBeDisabled()
    expect(within(screen.getByLabelText('계좌 그룹 다른증권사')).getByRole('option', { name: '뱅크샐러드 스냅샷' })).not.toBeDisabled()
  })

  it('미리보기 실패 시 적용 버튼 없이 재시도 메시지를 제공한다', async () => {
    mocks.preview.mockRejectedValue(new Error('unavailable'))
    render(<SourcePolicyEditor />)
    fireEvent.click(screen.getByRole('button', { name: '변경 미리보기' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('변경 미리보기를 불러오지 못했습니다'))
    expect(screen.queryByRole('button', { name: '확인 후 소스 적용' })).not.toBeInTheDocument()
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it('빈 freshness 입력은 API를 호출하지 않는다', () => {
    render(<SourcePolicyEditor />)
    fireEvent.change(screen.getByLabelText('오래된 평가 기준 (일)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '변경 미리보기' }))
    expect(screen.getByRole('status')).toHaveTextContent('1~365일')
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('설정 로딩 중에는 편집하지 못한다', () => {
    mocks.loading = true
    render(<SourcePolicyEditor />)
    expect(screen.queryByLabelText('토스증권 투자 기본 소스')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '변경 미리보기' })).not.toBeInTheDocument()
  })

  it('설정 오류와 내역 오류를 독립적으로 표시하고 재시도한다', () => {
    mocks.error = true; mocks.selectedError = true
    render(<SourcePolicyEditor />)
    expect(screen.getByText('소스 설정을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.getByText('현재 소스 내역을 불러오지 못했습니다')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '다시 시도' })[0])
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })
})
