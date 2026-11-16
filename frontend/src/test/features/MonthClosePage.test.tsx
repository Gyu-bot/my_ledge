vi.mock('../../features/analysis/SpendingReferenceCard', () => ({ SpendingReferenceCard: ({ period }: { period: string }) => <div data-testid="spending-reference">{period}</div> }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MonthClosePage } from '../../features/monthclose/MonthClosePage'
import type { MonthlyProjection } from '../../types/canonicalViews'
import type { SpendCubeQuery } from '../../types/metrics'
import type { TransactionListParams, TransactionResponse } from '../../types/transaction'
import { projectionFixture } from './projectionFixtures'
import {
  accuracyFixture,
  basisFixture,
  contractFixture,
  cubeFixture,
  dataStatusFixture,
  failed,
  loading,
  monthFixture,
  query,
} from './metricsFixtures'

function inProgressProjection(): MonthlyProjection {
  return {
    ...projectionFixture(),
    period: '2026-08',
    as_of_date: '2026-08-14',
    observed_through: '2026-08-14',
    remaining_period_start: '2026-08-15',
    as_of_basis: 'transaction_as_of',
    missing_reasons: ['정기 수입을 식별할 이력이 없음'],
    remaining_expense_adjustability: {
      basis: '남은 지출 가정(known_expected_remaining_expense)을 조정 가능성 비율로 나눔',
      protected_amount: 500_000,
      adjustable_amount: 100_000,
      undecided_amount: 300_000,
      total_amount: 900_000,
      undecided_share_pct: 33.3,
    },
  }
}

let statusState: ReturnType<typeof query> | ReturnType<typeof failed> | ReturnType<typeof loading>
let flowState: ReturnType<typeof query> | ReturnType<typeof failed> | ReturnType<typeof loading>
let dashboardState: ReturnType<typeof query> | ReturnType<typeof failed>
let accuracyState: ReturnType<typeof query> | ReturnType<typeof failed>
const cubeCalls: SpendCubeQuery[] = []
const txCalls: TransactionListParams[] = []

function tx(id: number, merchant: string, category: string, amount: number, type = '지출'): TransactionResponse {
  return {
    id, date: '2026-07-10', time: '12:00:00', type, category_major: category, category_minor: null,
    category_major_user: null, category_minor_user: null, effective_category_major: category, effective_category_minor: null,
    description: merchant, merchant, amount, currency: 'KRW', payment_method: null, cost_kind: null,
    fixed_cost_necessity: null, spend_necessity: null, cost_classification_source: null, recurring_payment_kind: null,
    memo: null, is_deleted: false, merged_into_id: null, is_edited: false, source: 'excel',
    created_at: '2026-07-10T00:00:00', updated_at: '2026-07-10T00:00:00',
  } as TransactionResponse
}

vi.mock('../../ds/charts/CashflowChart', () => ({
  CashflowChart: ({ items }: { items: { period: string }[] }) => <div data-testid="trend-chart">{items.map((item) => item.period).join(',')}</div>,
}))

vi.mock('../../hooks/useCanonicalViews', () => ({
  useCanonicalViewsDashboard: () => dashboardState,
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionList: (params: TransactionListParams) => {
    txCalls.push(params)
    if (params.type === '수입') return query({ total: 1, page: 1, per_page: 200, items: [tx(11, '샘플 급여처', '샘플 수입', 1_000_000, '수입')] })
    return query({
      total: 3, page: 1, per_page: 200,
      items: [tx(21, '샘플 마트', '샘플 식비', -40_000), tx(22, '샘플 마트', '샘플 식비', -20_000), tx(23, '샘플 마트 2호점', '샘플 식비', -9_000)],
    })
  },
}))

vi.mock('../../hooks/useMetrics', () => ({
  useDataStatus: () => statusState,
  useMonthlyFlow: () => flowState,
  useSpendCube: (params: SpendCubeQuery | null) => {
    if (!params) return loading()
    cubeCalls.push(params)
    if (params.group_by.join(',') === 'flow_row') {
      return query(cubeFixture([
        { flow_row: 'undecided', amount: 60_000, transaction_count: 2 },
        { flow_row: 'ad_hoc_adjustable', amount: 30_000, transaction_count: 1 },
      ], ['flow_row']))
    }
    return query(cubeFixture([
      { effective_category_major: '샘플 식비', merchant: '샘플 마트', amount: 60_000, transaction_count: 2 },
      { effective_category_major: '샘플 생활', merchant: '샘플 마트', amount: 0, transaction_count: 1 },
    ], ['effective_category_major', 'merchant']))
  },
  useMonthlyFlowComparison: () => query({
    contract: contractFixture(),
    comparison: basisFixture(),
    measures: [{ key: 'undecided_total', label: '미정', target_amount: 60_000, baseline_amount: 50_000, change_amount: 10_000, baseline_values: [] }],
    residual_rate: null,
  }),
  useTransferTransactions: () => query({ total_count: 0, undecided_count: 0, undecided_activity_total: 0, activity_total: 0, items: [] }),
  useProjectionAccuracy: () => accuracyState,
}))

beforeEach(() => {
  statusState = query(dataStatusFixture())
  flowState = query({
    contract: contractFixture(),
    items: [
      monthFixture('2026-06', 'closed', 2),
      monthFixture('2026-07', 'closed'),
      monthFixture('2026-08', 'in_progress', 0.5),
    ],
  })
  dashboardState = query({ month_projection: inProgressProjection() })
  accuracyState = query(accuracyFixture())
  cubeCalls.length = 0
  txCalls.length = 0
})

function renderPage(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MonthClosePage />
    </MemoryRouter>,
  )
}

describe('MonthClosePage — 월 결산', () => {
  it('첫 화면은 가장 최근 마감월의 월 흐름표다', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '월 결산' })).toBeInTheDocument()
    expect(screen.getByText('2026년 7월 월 흐름표')).toBeInTheDocument()
    const table = screen.getByRole('list', { name: '2026-07 월 흐름표' })
    expect(within(table).getByRole('button', { name: /수입 ₩1,000,000/ })).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: /총지급 \(약정 \+ 수시 \+ 미정\) ₩550,000/ })).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: /잔여 \(수입 − 총지급\) \+₩450,000/ })).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: /목적 미정 이체 -₩20,000/ })).toBeInTheDocument()
    expect(screen.getByText('45.0%')).toBeInTheDocument()
  })

  it('머리에 자료 현황(거래 기준일, 종류별 스냅샷 기준일, 미정 비중)을 둔다', () => {
    renderPage()
    const status = screen.getByRole('region', { name: '자료 현황' })
    expect(within(status).getByText('2026년 8월 14일')).toBeInTheDocument()
    expect(within(status).getByText('자산 2026-07-31')).toBeInTheDocument()
    expect(within(status).getByText('대출 2026-06-30')).toBeInTheDocument()
    expect(within(status).getByText('투자 없음')).toBeInTheDocument()
    expect(within(status).getByText('2026년 7월 11.8%')).toBeInTheDocument()
    expect(within(status).getByText('전체 기간 10.0%')).toBeInTheDocument()
    expect(within(status).getByText(/원화가 아닌 거래 1건/)).toBeInTheDocument()
  })

  it('URL의 month로 다른 마감월을 고를 수 있고, 진행월은 고를 수 없다', () => {
    renderPage('/?month=2026-06')
    expect(screen.getByText('2026년 6월 월 흐름표')).toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: '결산할 마감월' })
    const options = within(select).getAllByRole('option').map((option) => option.getAttribute('value'))
    expect(options).toEqual(['2026-07', '2026-06', '2026-04', '2026-03', '2026-02', '2026-01'])
    expect(options).not.toContain('2026-08')
  })

  it('진행월 관측 누적과 월말 전망을 서로 다른 영역에 나눠 보이고 비율은 내지 않는다', () => {
    renderPage()
    const observed = screen.getByRole('list', { name: '2026-08 관측 누적' })
    expect(within(observed).getByRole('button', { name: /수입 ₩500,000/ })).toBeInTheDocument()
    expect(within(observed).getByRole('button', { name: /총지급 ₩275,000/ })).toBeInTheDocument()
    expect(screen.queryByText('진행월에는 내지 않음')).not.toBeInTheDocument()

    const observedPart = screen.getByRole('region', { name: '전망의 관측 부분' })
    expect(within(observedPart).getByText('-₩700,000')).toBeInTheDocument()
    const assumption = screen.getByRole('region', { name: '전망의 남은 기간 가정' })
    expect(within(assumption).getByText(/2026년 8월 15일부터 월말까지/)).toBeInTheDocument()
    expect(within(assumption).getByText('+₩3,000,000')).toBeInTheDocument()
    expect(within(assumption).getByText(/조정 가능성 미정 33.3%/)).toBeInTheDocument()
    expect(within(observedPart).queryByText('+₩3,000,000')).not.toBeInTheDocument()

    const result = screen.getByRole('region', { name: '월말 전망 값' })
    expect(within(result).getByText('+₩1,400,000')).toBeInTheDocument()
    expect(within(result).getByText(/판단이나 권고가 아닙니다/)).toBeInTheDocument()
    expect(within(result).getByText('정기 수입을 식별할 이력이 없음')).toBeInTheDocument()
  })

  it('지난 마감월 되짚기 오차를 기준일 구간별로 보인다', () => {
    renderPage()
    const table = screen.getByRole('table', { name: '지난 마감월 되짚기 오차' })
    expect(within(table).getByText('지금 구간')).toBeInTheDocument()
    expect(within(table).getByText('-₩120,000')).toBeInTheDocument()
    expect(within(table).getByText('4회 · 보류 2회')).toBeInTheDocument()
    expect(within(table).getByText('+4.0%')).toBeInTheDocument()
  })

  it('남은 지출을 추정하지 못하면 월말 값 대신 보류와 이유를 보인다', () => {
    dashboardState = query({
      month_projection: { ...inProgressProjection(), projected_month_end_net: null, expected_remaining_expense: null, missing_reasons: ['변동 지출 기준 달이 부족함'] },
    })
    renderPage()
    const result = screen.getByRole('region', { name: '월말 전망 값' })
    expect(within(result).getByText('전망 보류')).toBeInTheDocument()
    expect(within(result).getByText('보류 이유')).toBeInTheDocument()
    expect(within(result).getByText('변동 지출 기준 달이 부족함')).toBeInTheDocument()
    expect(within(result).getByText(/이것은 월말 전망이 아닙니다/)).toBeInTheDocument()
  })

  it('전망 오차를 못 읽어도 관측 흐름표는 그대로다', () => {
    accuracyState = failed('503: down')
    renderPage()
    expect(screen.getByRole('list', { name: '2026-07 월 흐름표' })).toBeInTheDocument()
    expect(screen.getByText(/지난 오차: 데이터베이스 조회가 실패했습니다/)).toBeInTheDocument()
  })

  it('흐름표 금액을 누르면 그 자리에서 산식·포함·제외·구성·거래가 열린다', () => {
    renderPage()
    const table = screen.getByRole('list', { name: '2026-07 월 흐름표' })
    fireEvent.click(within(table).getByRole('button', { name: /^−?\s*미정/ }))
    const panel = screen.getByRole('region', { name: '미정 근거' })
    expect(within(table).getByRole('region', { name: '미정 근거' })).toBe(panel)
    expect(within(panel).getByText('산식')).toBeInTheDocument()
    expect(within(panel).getByText(/약정이 아닌 지출 중 조정 가능성을 아직 정하지 않은 것/)).toBeInTheDocument()
    expect(within(panel).getByText('포함하는 것')).toBeInTheDocument()
    expect(within(panel).getByText('빼는 것')).toBeInTheDocument()
    expect(within(panel).getByText(/원화가 아닌 거래 1건/)).toBeInTheDocument()
    expect(within(panel).getByText(/최근 6개 마감월 중앙값 ₩50,000 · 차이 \+₩10,000/)).toBeInTheDocument()
    expect(cubeCalls).toContainEqual(expect.objectContaining({ start_period: '2026-07', end_period: '2026-07', flow_row: 'undecided' }))

    const composition = within(panel).getByRole('list', { name: '카테고리·거래처 구성' })
    // 같은 거래처라도 카테고리가 다르면 다른 칸
    expect(within(composition).getAllByText('샘플 마트')).toHaveLength(2)
    fireEvent.click(within(composition).getAllByRole('button')[0])
    // T059: 거래 목록은 금액과 같은 흐름표 줄 조건(미정)으로 거른다
    expect(txCalls).toContainEqual(expect.objectContaining({ type: '지출', category_major: '샘플 식비', search: '샘플 마트', flow_row: 'undecided', start_date: '2026-07-01', end_date: '2026-07-31' }))
    const list = within(panel).getByRole('list', { name: '샘플 식비 · 샘플 마트 거래' })
    // 검색이 부분 일치라도 거래처 이름이 정확히 같은 거래만 보인다
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getAllByRole('button', { name: /거래 고치기/ })).toHaveLength(2)
    // 목록의 합계가 설명하는 금액과 같다는 것을 밝힌다
    expect(within(panel).getByText('아래 2건의 합계가 이 금액과 같습니다.')).toBeInTheDocument()
    expect(within(panel).queryByText(/흐름표 여러 줄에 걸쳐 있습니다/)).not.toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: '근거 닫기' }))
    expect(screen.queryByRole('region', { name: '미정 근거' })).not.toBeInTheDocument()
  })

  it('잔여에서 이루는 금액(수입)으로 옮겨 가고 수입 거래가 열린다', () => {
    renderPage()
    const table = screen.getByRole('list', { name: '2026-07 월 흐름표' })
    fireEvent.click(within(table).getByRole('button', { name: /잔여 \(수입 − 총지급\)/ }))
    const residual = screen.getByRole('region', { name: '잔여 근거' })
    expect(within(residual).getByText('수입 ₩1,000,000 − 총지급 ₩550,000 = +₩450,000')).toBeInTheDocument()
    fireEvent.click(within(residual).getByRole('button', { name: '수입 내역 열기' }))
    const income = screen.getByRole('region', { name: '수입 근거' })
    expect(within(income).getByRole('list', { name: '수입 거래' })).toBeInTheDocument()
    expect(within(income).getByText(/흐름표는 2건인데 거래 목록은 1건/)).toBeInTheDocument()
    expect(txCalls).toContainEqual(expect.objectContaining({ type: '수입', flow_row: 'income_undetermined' }))
  })

  it('최근 12개월 추이에서 자료 없는 달과 가져오기 전 달을 0원과 구분한다', () => {
    renderPage()
    expect(screen.getByTestId('trend-chart')).toHaveTextContent('2026-06,2026-07,2026-08')
    const table = screen.getByRole('table', { name: '최근 12개월 월 흐름' })
    expect(within(table).getAllByText('자료 없음').length).toBe(5)
    expect(within(table).getAllByText('가져오기 전').length).toBe(4)
    fireEvent.click(within(table).getByRole('button', { name: '2026-06' }))
    expect(screen.getByText('2026년 6월 월 흐름표')).toBeInTheDocument()
  })

  it('자료가 없으면 가져오기로 안내한다', () => {
    statusState = query(dataStatusFixture({
      as_of: { ...dataStatusFixture().as_of, transaction_as_of: null, last_closed_period: null, in_progress_period: null, first_transaction_date: null },
      closed_periods: [],
      in_progress_period: null,
    }))
    flowState = query({ contract: contractFixture(), items: [] })
    renderPage()
    expect(screen.getByText(/아직 가져온 거래가 없습니다/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '가져오기로 가기' })).toHaveAttribute('href', '/data/import')
  })

  it('조회에 실패하면 쉬운 말로 알리고 다시 시도할 수 있다', () => {
    statusState = failed('401: Invalid API key.')
    renderPage()
    expect(screen.getAllByText(/API 키가 없거나 맞지 않아/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('불러오는 동안 형태를 보존한 자리 표시를 보인다', () => {
    statusState = loading()
    flowState = loading()
    renderPage()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })
})
