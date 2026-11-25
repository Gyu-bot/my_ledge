import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { NetWorthPage } from '../../features/networth/NetWorthPage'
import type { EmergencyFundResponse, NetWorthReconciliationResponse } from '../../types/netWorth'
import { dataStatusFixture } from './metricsFixtures'
import { emergencyFundFixture, intervalsFixture, reconciliationFixture } from './netWorthFixtures'

// 합성 자료만 사용한다 (공개 저장소).

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

const state = vi.hoisted(() => ({
  reconciliation: null as unknown,
  reconciliationError: null as Error | null,
  emergency: null as unknown,
  pairs: [] as Array<{ start_date: string; end_date: string } | null>,
  txParams: [] as unknown[],
}))

vi.mock('../../hooks/useNetWorth', () => ({
  useNetWorthIntervals: () => query(intervalsFixture()),
  useNetWorthReconciliation: (pair: { start_date: string; end_date: string } | null) => {
    state.pairs.push(pair)
    if (state.reconciliationError) return { data: undefined, isLoading: false, error: state.reconciliationError, refetch: vi.fn() }
    return query(state.reconciliation as NetWorthReconciliationResponse)
  },
  useEmergencyFund: () => query(state.emergency as EmergencyFundResponse),
}))

vi.mock('../../hooks/useMetrics', () => ({
  useDataStatus: () => query(dataStatusFixture()),
  useTransferTransactions: () => query({ total_count: 0, undecided_count: 0, undecided_activity_total: 0, activity_total: 0, items: [] }),
  useMonthlyFlowComparison: () => query(undefined),
  useSpendCube: () => query(undefined),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionList: (params: unknown) => {
    state.txParams.push(params)
    return query({
      total: 1,
      page: 1,
      per_page: 200,
      items: [{ id: 501, date: '2026-06-25', merchant: '가상회사', amount: 5_000_000, currency: 'KRW', effective_category_major: '급여', effective_category_minor: null, memo: null }],
    })
  },
}))

vi.mock('../../hooks/useAssets', () => ({
  useAssetSnapshots: () =>
    query({
      items: [{ snapshot_date: '2026-06-07', asset_total: '684000000', liability_total: '263000000', net_worth: '421000000' }],
      asset_items: [
        { id: 1, snapshot_date: '2026-06-07', side: 'asset', category: '자유입출금', product_name: '토스뱅크', amount: '8100000', liquidity_tier: 'immediate', is_cash_equivalent: true },
        { id: 2, snapshot_date: '2026-06-07', side: 'asset', category: '부동산', product_name: '아파트', amount: '650000000', liquidity_tier: null, is_cash_equivalent: null },
      ],
    }),
  useNetWorthHistory: () =>
    query({ items: [
      { snapshot_date: '2026-05-01', net_worth: '394000000' },
      { snapshot_date: '2026-06-07', net_worth: '421000000' },
    ] }),
  useAssetSnapshotCompare: () =>
    query({
      comparison_mode: 'latest_available_vs_previous_available',
      current: { snapshot_date: '2026-06-07', asset_total: '684000000', liability_total: '263000000', net_worth: '421000000' },
      baseline: { snapshot_date: '2026-05-01', asset_total: '662000000', liability_total: '268000000', net_worth: '394000000' },
      delta: { asset_total: '22000000', liability_total: '-5000000', net_worth: '27000000', asset_total_pct: 0.033, liability_total_pct: -0.018, net_worth_pct: 0.0685 },
      comparison_days: 37,
      is_partial: false,
      is_stale: false,
      can_compare: true,
      comparison_label: '이전 스냅샷 대비',
    }),
  useNetWorthBreakdown: () =>
    query({
      snapshot_date: '2026-06-07',
      asset_total: '684000000',
      negative_asset_excluded_total: '-1200000',
      liability_total: '263000000',
      net_worth: '421000000',
      items: [
        { side: 'asset', category: '부동산', amount: '650000000', ratio: 0.95 },
        { side: 'liability', category: '주택담보대출', amount: '240000000', ratio: 0.91 },
      ],
    }),
  useLoanSummary: () =>
    query({
      snapshot_date: '2026-06-07',
      totals: { principal: '300000000', balance: '263000000' },
      items: [
        {
          id: 1, loan_type: '은행 대출', lender: '국민은행', product_name: '주택담보대출',
          principal: '300000000', balance: '240000000', interest_rate: '3.85',
          monthly_payment: '1420000', repayment_method: 'principal_interest',
          monthly_payment_source: 'estimated_from_linked_transactions', repayment_method_source: 'derived_from_loan_account',
          loan_kind: 'equal_principal_interest', start_date: '2023-01-01', maturity_date: '2053-01-01',
        },
      ],
    }),
  useInvestmentSummary: () =>
    query({
      snapshot_date: '2026-06-07',
      totals: { cost_basis: '120000000', market_value: '160000000' },
      items: [
        { product_type: '주식', broker: '증권사A', product_name: '미국주식ETF', cost_basis: '60000000', market_value: '67200000', return_rate: '12.4', pct_of_investment_total: 0.42 },
      ],
    }),
  useInsuranceSummary: () =>
    query({
      snapshot_date: '2026-06-07',
      items: [
        { id: 1, snapshot_date: '2026-06-07', insurer: '한화생명', product_name: '종신보험', contract_status: '유지', total_paid: '8400000', contract_date: '2020-05-01', maturity_date: null },
      ],
      monthly_premium_estimate: { period: '2026-05', amount: '214000', assumptions: ['최근 마감월 보험 카테고리 지출 기반'] },
    }),
}))

vi.mock('../../hooks/useProfile', () => ({
  useProfile: () =>
    query({
      snapshot_date: '2026-06-07',
      gender: '남',
      age: 34,
      credit_score_kcb: 942,
      credit_score_history: [
        { snapshot_date: '2026-05-01', credit_score_kcb: 931 },
        { snapshot_date: '2026-06-07', credit_score_kcb: 942 },
      ],
    }),
}))

vi.mock('../../hooks/useSettings', () => ({
  useAnalyticsSettings: () =>
    query({
      defaults: {},
      saved: {},
      effective: {
        financial_targets: { emergency_fund_target_months: 4, savings_rate_target: 0.5, debt_strategy_preference: 'avalanche' },
      },
    }),
}))


function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderPage(path = '/net-worth') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/net-worth" element={<><NetWorthPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

function equation() {
  return screen.getByRole('region', { name: '순자산 변동 대조식' })
}

describe('NetWorthPage (재무상태)', () => {
  beforeEach(() => {
    state.reconciliation = reconciliationFixture('complete')
    state.reconciliationError = null
    state.emergency = emergencyFundFixture()
    state.pairs = []
    state.txParams = []
  })

  it('KPI: 순자산/총자산(음수 자산 제외 ⓘ)/총부채/현금성 — 현금성은 비상금 응답에서', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '재무상태' })).toBeInTheDocument()
    expect(screen.getAllByText('₩4.21억').length).toBeGreaterThan(0)
    expect(screen.getByText('₩6.84억')).toBeInTheDocument()
    expect(screen.getByLabelText('총자산 계산 기준 근거 보기')).toBeInTheDocument()
    expect(screen.getByText('월 보호 지급의 2.50개월분')).toBeInTheDocument()
  })

  it('비교 모드 선택과 비교 메타를 보여준다', () => {
    renderPage()
    expect(screen.getByRole('tablist', { name: '스냅샷 비교 모드' })).toBeInTheDocument()
    expect(screen.getByText(/2026-05-01 대비/)).toBeInTheDocument()
  })

  it('신용점수, 투자, 보험 스냅샷을 그대로 보인다', () => {
    renderPage()
    expect(screen.getByText('신용점수 (KCB)')).toBeInTheDocument()
    expect(screen.getByText('942')).toBeInTheDocument()
    expect(screen.getByText('미국주식ETF')).toBeInTheDocument()
    expect(screen.getByText('종신보험')).toBeInTheDocument()
  })

  it('이자 추정·할부 전망·현재 추정 순자산 같은 기록 밖 값은 두지 않는다', () => {
    renderPage()
    expect(screen.getByText(/정렬 고금리순/)).toBeInTheDocument()
    expect(screen.queryByText(/월 이자 추정/)).not.toBeInTheDocument()
    expect(screen.queryByText('할부 잔여')).not.toBeInTheDocument()
    expect(screen.queryByText(/현재 추정 순자산/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '약정 현황' })).toHaveAttribute('href', '/commitments')
  })

  it('음수 제외 합계를 부호와 계산 기준으로 설명한다', () => {
    renderPage()
    fireEvent.click(screen.getByLabelText('총자산 계산 기준 근거 보기'))
    expect(screen.getByText('-₩1,200,000')).toBeInTheDocument()
    expect(screen.getByText('0원 이상 자산 − 부채')).toBeInTheDocument()
  })

  it('스냅샷 날짜를 종류마다 따로 보인다', () => {
    renderPage()
    const list = screen.getByRole('list', { name: '종류별 스냅샷 날짜' })
    expect(within(list).getByText('자산(순자산)')).toBeInTheDocument()
    expect(within(list).getByText('4개')).toBeInTheDocument() // 대출 날짜 4개
    expect(within(list).getAllByText('최근 2026-06-30').length).toBe(4)
    expect(within(list).getByText('최근 없음')).toBeInTheDocument() // 프로필
  })

  it('완료된 구간: 대조식의 값이 응답 그대로이고 더하면 순자산 변동과 같다', () => {
    renderPage()
    expect(state.pairs[state.pairs.length - 1]).toBeNull() // 기본값: 최근 두 스냅샷
    expect(within(screen.getByRole('group', { name: '대조 상태' })).getByText(/대조 완료/)).toBeInTheDocument()
    const eq = equation()
    expect(within(eq).getByText('+₩3,500,000')).toBeInTheDocument()
    expect(within(eq).getByText('+₩2,000,000')).toBeInTheDocument()
    expect(within(eq).getByText('+₩600,000')).toBeInTheDocument()
    expect(within(eq).getByText('+₩700,000')).toBeInTheDocument()
    expect(within(eq).getByText('+₩200,000')).toBeInTheDocument()
    expect(within(eq).getByText('네 항목을 더하면 순자산 변동과 같습니다.')).toBeInTheDocument()
    expect(within(eq).getByText(/투자 평가액 변화 \+₩1,700,000 − 투자 이체로 들어간 돈 \+₩1,000,000/)).toBeInTheDocument()
    // 구간 규칙: 시작 스냅샷 다음 날부터 끝 스냅샷일까지
    expect(screen.getByText('2026년 6월 1일 ~ 2026년 6월 30일')).toBeInTheDocument()
    expect(screen.getByText(/시작 스냅샷일\(2026-05-31\)의 거래는 이미 시작 잔액에 들어 있어 빼고/)).toBeInTheDocument()
  })

  it('분류가 덜 된 구간: 이유와 이체 미정 비중, 이체 목적 화면으로 가는 링크(구간을 기간으로)', () => {
    state.reconciliation = reconciliationFixture('incomplete_classification')
    renderPage()
    expect(within(screen.getByRole('group', { name: '대조 상태' })).getByText(/분류가 덜 됨/)).toBeInTheDocument()
    expect(screen.getByText(/목적이 정해지지 않은 이체가 이체 금액의 9.1%입니다/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: '이체 목적 정하기' })
    expect(link).toHaveAttribute('href', '/data/transfers?start=2026-06-01&end=2026-06-30&undecided=1&from=2026-05-31%7E2026-06-30')
    expect(within(equation()).getByText('-₩100,000')).toBeInTheDocument()
  })

  it('거래가 구간을 덮지 않는 구간: 설명되지 않는 차이는 계산 보류이고 이유를 보인다', () => {
    state.reconciliation = reconciliationFixture('transactions_not_covered')
    renderPage()
    expect(within(screen.getByRole('group', { name: '대조 상태' })).getByText(/거래가 구간을 덮지 않음/)).toBeInTheDocument()
    expect(screen.getByText(/거래 기록이 2026년 6월 10일부터 있어 구간 첫날\(2026년 6월 1일\)을 덮지 않습니다/)).toBeInTheDocument()
    const eq = equation()
    expect(within(eq).getByText('계산 보류')).toBeInTheDocument()
    expect(within(eq).getByText(/거래 기록이 구간을 덮지 않아 계산하지 않았습니다/)).toBeInTheDocument()
    expect(within(eq).getByText('+₩2,000,000')).toBeInTheDocument() // 잔여는 부분 근거로 보인다
    expect(within(eq).queryByText(/네 항목을 더하면/)).not.toBeInTheDocument()
  })

  it('종류별 스냅샷 날짜가 맞지 않는 구간: 대출 항목과 차이는 보류, 날짜를 맞추지 않는다', () => {
    state.reconciliation = reconciliationFixture('snapshot_dates_mismatched')
    renderPage()
    expect(within(screen.getByRole('group', { name: '대조 상태' })).getByText(/스냅샷 날짜가 맞지 않음/)).toBeInTheDocument()
    expect(screen.getByText(/대출 스냅샷 날짜가 구간과 다릅니다. 시작일\(2026-05-31\)에는 2026-05-15/)).toBeInTheDocument()
    const eq = equation()
    expect(within(eq).getAllByText('계산 보류')).toHaveLength(2)
    expect(within(eq).getByText('보류 이유: 대출 스냅샷 날짜가 구간과 맞지 않아 계산하지 않았습니다.')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('날짜가 맞지 않음')).toBeInTheDocument()
    expect(within(table).getByText('2026-05-15')).toBeInTheDocument()
  })

  it('날짜가 일치해도 투자 값이 빠지면 차이를 보류하고 확인된 합계와 대출 감소는 보여준다', () => {
    state.reconciliation = reconciliationFixture('incomplete_snapshot_values')
    renderPage()

    const status = screen.getByRole('group', { name: '대조 상태' })
    expect(within(status).getByText(/스냅샷 값 누락/)).toBeInTheDocument()
    const eq = equation()
    expect(within(eq).getAllByText('계산 보류')).toHaveLength(2)
    expect(within(eq).getByText(/투자 스냅샷에 값이 비어 있는 항목/)).toBeInTheDocument()
    expect(within(eq).getByText(/대출 잔액 또는 투자 평가액이 누락되어/)).toBeInTheDocument()
    expect(within(eq).getByText('+₩600,000')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText(/확인된 값 합계 ₩0/)).toBeInTheDocument()
    expect(within(table).getByText('₩20,000,000')).toBeInTheDocument()
  })

  it('스냅샷 쌍이 없으면 그 상태와 이유만 보인다', () => {
    state.reconciliation = reconciliationFixture('no_snapshot_pair')
    renderPage()
    expect(within(screen.getByRole('group', { name: '대조 상태' })).getByText(/스냅샷 쌍 없음/)).toBeInTheDocument()
    expect(screen.getByText(/자산 스냅샷 날짜가 3개뿐이라|자산 스냅샷 날짜가 두 개 이상/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '순자산 변동 대조식' })).not.toBeInTheDocument()
  })

  it('구간 목록에서 다른 구간을 고르면 주소와 대조가 그 구간으로 바뀐다', () => {
    renderPage()
    const list = screen.getByRole('list', { name: '스냅샷 구간 목록' })
    expect(within(list).getByText(/설명되지 않는 차이 계산 보류/)).toBeInTheDocument()
    fireEvent.click(within(list).getByText('2026-04-30 → 2026-05-31'))
    expect(screen.getByTestId('location')).toHaveTextContent('/net-worth?start=2026-04-30&end=2026-05-31')
    expect(state.pairs[state.pairs.length - 1]).toEqual({ start_date: '2026-04-30', end_date: '2026-05-31' })
  })

  it('구간 선택 상자로도 구간을 바꾼다', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('대조할 스냅샷 구간'), { target: { value: '2026-04-30~2026-05-31' } })
    expect(screen.getByTestId('location')).toHaveTextContent('/net-worth?start=2026-04-30&end=2026-05-31')
  })

  it('주소의 구간을 그대로 읽는다 (이체 목적 화면에서 돌아올 때)', () => {
    renderPage('/net-worth?start=2026-04-30&end=2026-05-31')
    expect(state.pairs[0]).toEqual({ start_date: '2026-04-30', end_date: '2026-05-31' })
  })

  it('주소의 날짜가 스냅샷이 아니면(422) 쉬운 말로 알리고 최근 구간으로 돌아갈 수 있다', () => {
    state.reconciliationError = new Error('422: bad')
    renderPage('/net-worth?start=2026-04-01&end=2026-05-31')
    expect(screen.getByText('주소에 적힌 날짜가 자산 스냅샷 날짜가 아니거나 순서가 바뀌었습니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '최근 구간 보기' }))
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/net-worth$/)
  })

  it('대조 조회 실패는 오류 상태로 보인다', () => {
    state.reconciliationError = new Error('503: db')
    renderPage()
    expect(screen.getByText('데이터베이스 조회가 실패했습니다. 잠시 뒤 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('잔여를 누르면 같은 자리에서 산식과 구간 거래가 열린다', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '잔여 (수입 − 총지급) 근거와 거래 열기' }))
    const panel = screen.getByRole('region', { name: '잔여 근거' })
    expect(within(panel).getByText('₩5,000,000 − ₩3,000,000 = +₩2,000,000')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: /수입 내역 열기/ }))
    const income = screen.getByRole('region', { name: '수입 근거' })
    expect(within(income).getByText('가상회사')).toBeInTheDocument()
    expect(state.txParams).toContainEqual(expect.objectContaining({ flow_row: 'income_undetermined', start_date: '2026-06-01', end_date: '2026-06-30' }))
  })

  it('총지급은 흐름표 줄을 골라 구간 거래를 연다', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '잔여 (수입 − 총지급) 근거와 거래 열기' }))
    fireEvent.click(screen.getByRole('button', { name: /총지급 내역 열기/ }))
    const panel = screen.getByRole('region', { name: '총지급 근거' })
    fireEvent.click(within(panel).getByRole('button', { name: '약정 지급 · 대출 원리금' }))
    expect(state.txParams).toContainEqual(expect.objectContaining({ flow_row: 'committed_loan', start_date: '2026-06-01', end_date: '2026-06-30' }))
  })

  it('비상금 개월 수: 식, 기준 기간, 미정 비중, 조언이 아니라는 문장', () => {
    renderPage()
    expect(screen.getByText('2.50개월')).toBeInTheDocument()
    expect(screen.getByText(/현금성 자산 ÷ 월 보호 지급. 기록된 값으로 계산한 비율이며, 얼마가 적당한지에 대한 조언이 아닙니다./)).toBeInTheDocument()
    expect(screen.getByText(/2026년 2월 ~ 2026년 6월 마감월 5개의 중앙값/)).toBeInTheDocument()
    expect(screen.getByText('8.0%')).toBeInTheDocument()
    expect(screen.getByText(/분류 결과에 따라 월 보호 지급과 비상금 개월 수가 달라질 수 있습니다/)).toBeInTheDocument()
    expect(screen.queryByText(/비상금 확보/)).not.toBeInTheDocument() // 예전 값(liquidity-health)은 쓰지 않는다
  })

  it('비상금 미정 비중이 0이어도 미정 거래 건수와 분류 링크를 보여준다', () => {
    state.emergency = emergencyFundFixture({
      adjustability_undecided_share: 0,
      adjustability_undecided_transaction_count: 2,
      monthly_adjustability_undecided_outflow: 0,
    })
    renderPage()
    expect(screen.getByText(/조정 가능성이 미정인 지출 거래가 2건 있습니다/)).toBeInTheDocument()
    const card = screen.getByRole('heading', { name: '비상금 개월 수' }).closest('section')!
    expect(within(card).getByRole('link', { name: '분류하러 가기' })).toHaveAttribute('href', '/data/inbox')
  })

  it('비상금 기준 기간이 없으면 계산 보류와 이유', () => {
    state.emergency = emergencyFundFixture({ status: 'no_baseline', emergency_fund_months: null, monthly_protected_outflow: null, adjustability_undecided_share: null, cash_like_name_rule_total: 0, baseline: { ...emergencyFundFixture().baseline, periods: [], month_count: 0, status: 'none' } })
    renderPage()
    expect(screen.getAllByText('계산 보류').length).toBeGreaterThan(0)
    expect(screen.getByText(/기준으로 사용할 마감월이 없어/)).toBeInTheDocument()
    expect(screen.getByText('비상금 개월 수 계산 보류')).toBeInTheDocument()
  })
})


it('투자 평가 변동의 잠정 사유·서버 비중·대조 완료의 한계를 함께 보인다', () => {
  const data = reconciliationFixture()
  state.reconciliation = { ...data, status_note: '합성 안내: 계산 완료가 차이의 해소를 뜻하지 않습니다.', items: {
    ...data.items!, investment_valuation_change_provisional: true,
    investment_valuation_change_provisional_reason: '목적 미정 이체의 분류 후 투자 변동이 달라질 수 있습니다.',
    unexplained_share_of_change: -1.2345,
  } }
  render(<MemoryRouter><NetWorthPage /></MemoryRouter>)
  expect(screen.getByText('투자 평가 변동 · 잠정')).toBeInTheDocument()
  expect(screen.getByText('잠정')).toBeInTheDocument()
  expect(screen.getByText(/목적 미정 이체의 분류 후/)).toBeInTheDocument()
  expect(screen.getByText(/순자산 변동 절댓값 대비.*-123.4%/)).toBeInTheDocument()
  expect(screen.getByText('합성 안내: 계산 완료가 차이의 해소를 뜻하지 않습니다.')).toBeInTheDocument()
})

it('순자산 변동이 0이면 비중을 새로 계산하지 않고 보류 사유를 표시한다', () => {
  const data = reconciliationFixture()
  state.reconciliation = { ...data, items: { ...data.items!, net_worth_change: 0, unexplained_share_of_change: null, unexplained_share_withheld_reason: 'net_worth_change_zero' } }
  render(<MemoryRouter><NetWorthPage /></MemoryRouter>)
  expect(screen.getByText(/순자산 변동이 0원이어서 비중을 내지 않습니다/)).toBeInTheDocument()
})
