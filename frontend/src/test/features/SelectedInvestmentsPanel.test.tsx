import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SelectedInvestmentsPanel } from '../../features/networth/SelectedInvestmentsPanel'
import { selectedInvestments } from './sourcePolicyFixtures'

const state = vi.hoisted(() => ({ unsafe: false, incomplete: false }))
vi.mock('../../hooks/useSourcePolicy', () => ({
  useSelectedInvestments: () => ({ data: { ...selectedInvestments, investment_total_complete: !state.incomplete, estimated_net_worth: state.unsafe ? null : selectedInvestments.estimated_net_worth }, isLoading: false, error: null }),
}))
beforeEach(() => { state.unsafe = false; state.incomplete = false })

describe('SelectedInvestmentsPanel', () => {
  it('스냅샷 순자산과 현재 추정을 구분하고 시점 차이와 이체 위험을 표시한다', () => {
    render(<MemoryRouter><SelectedInvestmentsPanel /></MemoryRouter>)
    expect(screen.getByText('뱅샐 스냅샷 순자산')).toBeInTheDocument()
    expect(screen.getByText('₩1,000,000')).toBeInTheDocument()
    expect(screen.getByText('₩1,020,000')).toBeInTheDocument()
    expect(screen.getByText('서로 다른 기준일 · 추정')).toBeInTheDocument()
    expect(screen.getByText(/투자 성과나 수익률로 해석하지 않습니다/)).toBeInTheDocument()
    expect(screen.getByText(/매핑·예수금 범위를 확인할 수 없으면/)).toBeInTheDocument()
    expect(screen.getByText('선택된 보유 항목 1건')).toBeInTheDocument()
    expect(screen.getByText('테스트 주식')).toBeInTheDocument()
  })
  it('불완전한 평가액은 전체 합계가 아닌 확인된 소계로 표시한다', () => {
    state.incomplete = true
    state.unsafe = true
    render(<MemoryRouter><SelectedInvestmentsPanel /></MemoryRouter>)
    expect(screen.getByText('확인된 평가액 소계 (전체 합계 아님)')).toBeInTheDocument()
    expect(screen.queryByText('선택 소스 투자 평가액')).not.toBeInTheDocument()
    expect(screen.getByText('산출 불가')).toBeInTheDocument()
  })
  it('안전하게 합산할 수 없는 총액은 0이나 확정 값 대신 산출 불가로 표시한다', () => {
    state.unsafe = true
    render(<MemoryRouter><SelectedInvestmentsPanel /></MemoryRouter>)
    expect(screen.getByText('산출 불가')).toBeInTheDocument()
    expect(screen.queryByText('₩1,020,000')).not.toBeInTheDocument()
    expect(screen.getByText('₩1,000,000')).toBeInTheDocument()
  })
})
