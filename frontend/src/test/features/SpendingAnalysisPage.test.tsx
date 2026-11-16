vi.mock('../../features/analysis/SpendingReferenceCard', () => ({ SpendingReferenceCard: ({ period }: { period: string }) => <div data-testid="spending-reference">{period}</div> }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SpendingAnalysisPage } from '../../features/spending-analysis/SpendingAnalysisPage'
import type { ContributionQuery, SpendCubeQuery } from '../../types/metrics'
import {
  basisFixture,
  contractFixture,
  contributionsFixture,
  cubeFixture,
  dataStatusFixture,
  failed,
  loading,
  monthFixture,
  query,
  reviewItemsFixture,
} from './metricsFixtures'

let statusState: ReturnType<typeof query> | ReturnType<typeof failed>
let reviewState: ReturnType<typeof query> | ReturnType<typeof failed>
let contributionsFails = false
let previousMonthUnavailable = false
const cubeCalls: SpendCubeQuery[] = []
const contributionCalls: ContributionQuery[] = []
const reviewMutate = vi.fn()

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

vi.mock('../../hooks/useAnalytics', () => ({
  useReviewPurchaseGateCandidate: () => ({ mutate: reviewMutate, isPending: false, error: null }),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionList: () => query({ total: 0, page: 1, per_page: 200, items: [] }),
}))

vi.mock('../../hooks/useMetrics', () => ({
  useDataStatus: () => statusState,
  useMonthlyFlow: (params: { start_period?: string }) =>
    query({ contract: contractFixture(), items: params.start_period ? [monthFixture(params.start_period, params.start_period === '2026-08' ? 'in_progress' : 'closed')] : [] }),
  useSpendCube: (params: SpendCubeQuery | null) => {
    if (!params) return loading()
    cubeCalls.push(params)
    const groupBy = params.group_by.join(',')
    if (groupBy === 'effective_category_major') {
      return query(cubeFixture([
        { effective_category_major: '샘플 식비', amount: 200_000, transaction_count: 8 },
        { effective_category_major: '샘플 생활', amount: 150_000, transaction_count: 4 },
      ], ['effective_category_major']))
    }
    if (groupBy === 'commitment_kind') {
      return query(cubeFixture([
        { commitment_kind: 'installment', amount: 50_000 },
        { commitment_kind: null, amount: 270_000, transaction_count: 14 },
        { commitment_kind: 'loan', amount: 200_000 },
        { commitment_kind: 'recurring', amount: 30_000 },
      ], ['commitment_kind']))
    }
    if (groupBy === 'flow_row') {
      return query(cubeFixture([{ flow_row: 'ad_hoc_adjustable', amount: 70_000, transaction_count: 3 }], ['flow_row']))
    }
    // effective_category_major,merchant
    return query(cubeFixture([
      { effective_category_major: '샘플 식비', merchant: '샘플 편의점', amount: 70_000, transaction_count: 3 },
      { effective_category_major: '샘플 생활', merchant: '샘플 편의점', amount: 25_000, transaction_count: 2 },
    ], ['effective_category_major', 'merchant']))
  },
  useContributions: (params: ContributionQuery | null) => {
    if (!params) return loading()
    contributionCalls.push(params)
    if (contributionsFails) return failed()
    if (params.level === 'merchant') {
      return query({ ...contributionsFixture(params.adjustability), level: 'merchant', items: [
        { ...contributionsFixture().items[0], merchant: '샘플 편의점', change_amount: 30_000 },
      ] })
    }
    const result = contributionsFixture(params.adjustability)
    if (params.baseline === 'previous_month') {
      return query({ ...result, comparison: { ...result.comparison,
        baseline_method: 'previous_month', baseline_method_label: '직전 월',
        baseline_periods: previousMonthUnavailable ? [] : ['2026-06'],
        baseline_status: previousMonthUnavailable ? 'none' : 'full',
        baseline_unavailable_reason: previousMonthUnavailable ? 'no_data' : null,
      } })
    }
    return query(result)
  },
  useReviewItems: () => reviewState,
  useMonthlyFlowComparison: () => query({ contract: contractFixture(), comparison: basisFixture(), measures: [], residual_rate: null }),
  useTransferTransactions: () => query({ total_count: 0, undecided_count: 0, undecided_activity_total: 0, activity_total: 0, items: [] }),
}))

beforeEach(() => {
  statusState = query(dataStatusFixture())
  reviewState = query(reviewItemsFixture())
  contributionsFails = false
  previousMonthUnavailable = false
  cubeCalls.length = 0
  contributionCalls.length = 0
  reviewMutate.mockReset()
})

function renderPage(path = '/analysis') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SpendingAnalysisPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SpendingAnalysisPage — 지출 분석', () => {
  it('기본 대상은 가장 최근 마감월이고, 진행월은 부분 기록으로 고를 수 있다', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '지출 분석' })).toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: '분석할 달' })
    expect(select).toHaveValue('2026-07')
    expect(screen.getByTestId('spending-reference')).toHaveTextContent('2026-07')
    expect(within(select).getByRole('option', { name: '2026년 8월 (진행월 · 부분 기록)' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '자료 현황' })).toBeInTheDocument()
    expect(cubeCalls).toContainEqual(expect.objectContaining({ start_period: '2026-07', end_period: '2026-07', group_by: ['effective_category_major'] }))
  })

  it('진행월을 고르면 같은 경과일 비교라고 알린다', () => {
    renderPage('/analysis?period=2026-08')
    expect(screen.getByRole('note')).toHaveTextContent('진행월(부분 기록)')
    expect(contributionCalls).toContainEqual(expect.objectContaining({ period: '2026-08' }))
  })

  it('카테고리 → 거래처로 나누고 같은 거래처도 카테고리별로 따로 센다', () => {
    renderPage()
    const categories = screen.getByRole('list', { name: '카테고리별 지출' })
    fireEvent.click(within(categories).getByRole('button', { name: /샘플 식비/ }))
    expect(cubeCalls).toContainEqual(expect.objectContaining({ group_by: ['effective_category_major', 'merchant'], effective_category_major: '샘플 식비' }))

    fireEvent.click(screen.getByRole('tab', { name: '거래처 순 (카테고리 유지)' }))
    const merchants = screen.getByRole('list', { name: '거래처별 지출 (카테고리 유지)' })
    expect(within(merchants).getAllByText('샘플 편의점')).toHaveLength(2)
    expect(within(merchants).getByText('샘플 식비')).toBeInTheDocument()
    expect(within(merchants).getByText('샘플 생활')).toBeInTheDocument()

    fireEvent.click(within(merchants).getAllByRole('button')[0])
    const panel = screen.getByRole('region', { name: '샘플 편의점 (샘플 식비) 근거' })
    expect(within(panel).getByText('산식')).toBeInTheDocument()
    expect(within(panel).getByText(/같은 거래처라도 카테고리가 다르면 다른 칸으로 셉니다/)).toBeInTheDocument()
  })

  it('조정 가능성으로 거르면 지출 큐브에 그 조건을 그대로 넘긴다', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '조정 가능' }))
    expect(cubeCalls).toContainEqual(expect.objectContaining({ group_by: ['effective_category_major'], adjustability: 'adjustable' }))
  })

  it('기준 대비 변화 기여를 금액 순으로 보이고 조정 가능 지출만의 변화를 볼 수 있다', () => {
    renderPage()
    const items = screen.getByRole('list', { name: '카테고리별 변화 기여' })
    const rows = within(items).getAllByRole('button')
    expect(rows[0]).toHaveTextContent('샘플 식비')
    expect(rows[0]).toHaveTextContent('+₩60,000 늘어남')
    expect(rows[1]).toHaveTextContent('-₩10,000 줄어듦')
    expect(screen.getByText(/자료 없는 달 제외: 2026-05/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '조정 가능만' }))
    expect(contributionCalls).toContainEqual(expect.objectContaining({ period: '2026-07', adjustability: 'adjustable', level: 'category' }))

    fireEvent.click(within(screen.getByRole('list', { name: '카테고리별 변화 기여' })).getAllByRole('button')[0])
    expect(contributionCalls).toContainEqual(expect.objectContaining({ adjustability: 'adjustable', level: 'merchant', category: '샘플 식비' }))
    expect(screen.getByRole('list', { name: '샘플 식비 거래처별 변화' })).toHaveTextContent('샘플 편의점')
  })

  it('기존 할부 회차를 뺀 지출을 총지급 − 할부 회차로 보이고 할부 줄을 빠짐으로 표시한다', () => {
    renderPage()
    const formula = screen.getByText('총지급 ₩550,000 − 할부 회차 ₩50,000')
    expect(formula.previousElementSibling).toHaveTextContent('₩500,000')
    const parts = screen.getByRole('list', { name: '지급 형태별 구성' })
    const rows = within(parts).getAllByRole('button')
    expect(rows[0]).toHaveTextContent('약정이 아닌 지출 (수시·미정)')
    expect(rows[rows.length - 1]).toHaveTextContent('할부 회차')
    expect(rows[rows.length - 1]).toHaveTextContent('빠짐')
    fireEvent.click(rows[0])
    expect(screen.getByRole('region', { name: '약정이 아닌 지출 (수시·미정) 근거' })).toBeInTheDocument()
    expect(cubeCalls).toContainEqual(expect.objectContaining({ payment_form: 'ad_hoc', group_by: ['effective_category_major', 'merchant'] }))
  })

  it('사후 검토 목록은 왜 올라왔는지만 보이고 점수·위험도를 싣지 않는다', () => {
    renderPage()
    const list = screen.getByRole('list', { name: '사후 검토 목록' })
    expect(within(list).getByText('큰 일회성 지출')).toBeInTheDocument()
    expect(within(list).getByText('카테고리 지출 증가')).toBeInTheDocument()
    // 거래는 화면을 떠나지 않고 그 자리에서 고친다 (T059)
    expect(within(list).getByRole('button', { name: '이 거래 고치기' })).toBeInTheDocument()
    expect(list).not.toHaveTextContent(/위험|신뢰도|우선순위|3\.2/)
    expect(screen.getByText('구매 단위 검출기는 예전 재량 분류를 읽는다.')).toBeInTheDocument()

    fireEvent.click(within(list).getByRole('button', { name: '봤음으로 표시' }))
    expect(reviewMutate).toHaveBeenCalledWith(
      { candidateKey: 'transaction:901', data: { review_status: 'reviewed', memo: null } },
      expect.anything(),
    )
  })

  it('사후 검토 목록이 비면 빈 상태를, 실패하면 다시 시도를 보인다', () => {
    reviewState = query({ ...reviewItemsFixture(), status: 'ok', data: { ...reviewItemsFixture().data, items: [], total: 0 } })
    const { unmount } = renderPage()
    expect(screen.getByText('이 달에 다시 볼 만한 거래가 없습니다.')).toBeInTheDocument()
    unmount()
    reviewState = failed('503: down')
    renderPage()
    expect(screen.getAllByText(/데이터베이스 조회가 실패했습니다/).length).toBeGreaterThan(0)
  })

  it('변화 기여 조회가 실패해도 다른 영역은 보인다', () => {
    contributionsFails = true
    renderPage()
    expect(screen.getByText('자료를 불러오지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '카테고리별 지출' })).toBeInTheDocument()
  })

  it('기준을 바꾸면 카테고리와 거래처 모두 같은 기준을 요청하고 서버 기간을 보인다', () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: '비교 기준' })).toHaveValue('median_of_recent_closed_months')
    fireEvent.change(screen.getByRole('combobox', { name: '비교 기준' }), { target: { value: 'previous_month' } })
    expect(contributionCalls).toContainEqual(expect.objectContaining({ baseline: 'previous_month', level: 'category' }))
    expect(screen.getByText(/기준 기간: 2026-06/)).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('list', { name: '카테고리별 변화 기여' })).getAllByRole('button')[0])
    expect(contributionCalls).toContainEqual(expect.objectContaining({ baseline: 'previous_month', level: 'merchant' }))
    expect(screen.getByText('기준 금액')).toBeInTheDocument()
  })

  it('직전 월 기준이 없으면 서버 사유를 한국어로 보이고 기본 기준으로 대신하지 않는다', () => {
    previousMonthUnavailable = true
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: '비교 기준' }), { target: { value: 'previous_month' } })
    expect(screen.getByText(/직전 월에 관측된 거래가 없어 비교할 수 없습니다/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '비교 기준' })).toHaveValue('previous_month')
  })

  it('자료가 없으면 가져오기로 안내한다', () => {
    statusState = query(dataStatusFixture({
      as_of: { ...dataStatusFixture().as_of, transaction_as_of: null, last_closed_period: null, in_progress_period: null },
      closed_periods: [],
      in_progress_period: null,
    }))
    renderPage()
    expect(screen.getByText(/아직 가져온 거래가 없습니다/)).toBeInTheDocument()
  })

  it('자료 현황을 못 읽으면 쉬운 말로 알린다', () => {
    statusState = failed('401: Invalid API key.')
    renderPage()
    expect(screen.getAllByText(/API 키가 없거나 맞지 않아/).length).toBeGreaterThan(0)
  })
})
