import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SourceSelectionDetails } from '../../features/assets/SourceSelectionDetails'
import { selectedInvestments } from './sourcePolicyFixtures'

describe('SourceSelectionDetails', () => {
  it('토스 조회 시각을 평가 시각으로 오인하지 않도록 추정 근거를 표시한다', () => {
    render(<SourceSelectionDetails data={{ ...selectedInvestments, accounts: selectedInvestments.accounts.map((account) => ({
      ...account, effective_source: 'toss_securities_api', valuation_precision: 'observation_proxy',
      conflicts: ['provider_valuation_timestamp_unavailable'],
    })) }} />)
    expect(screen.getByText(/조회 시각 \(평가시각 미제공\)/)).toBeInTheDocument()
    expect(screen.queryByText(/^평가 시점/)).not.toBeInTheDocument()
    expect(screen.getByText(/토스가 평가 시각을 제공하지 않아 조회 시각 기준 추정값/)).toBeInTheDocument()
  })

  it('토스 조회 범위 밖 자산이 있으면 뱅샐 유지 사유를 번역한다', () => {
    render(<SourceSelectionDetails data={{ ...selectedInvestments, accounts: selectedInvestments.accounts.map((account) => ({
      ...account, fallback_reason: 'unsupported_holdings_scope', conflicts: [],
    })) }} />)
    expect(screen.getByText(/국내·미국 주식\(ETF 포함\) 외의 자산이 있어 토스 API로 대체하지 않고 뱅샐을 유지/)).toBeInTheDocument()
    expect(screen.queryByText(/unsupported_holdings_scope/)).not.toBeInTheDocument()
  })
})
