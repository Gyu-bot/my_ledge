import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SpendingPage } from '../../features/spending/SpendingPage'
import * as transactionHooks from '../../hooks/useTransactions'
import * as analyticsHooks from '../../hooks/useAnalytics'

afterEach(() => vi.restoreAllMocks())

function query<T>(data: T) {
  return { data, isLoading: false, error: null, refetch: vi.fn() }
}

vi.mock('../../hooks/useTransactions', () => ({
  useCategoryTimeline: () =>
    query({
      items: [
        { period: '2026-05', category: '식비', amount: 410_000 },
        { period: '2026-06', category: '식비', amount: 740_000 },
        { period: '2026-06', category: '구독', amount: 64_000 },
      ],
    }),
  useCategoryBreakdown: () =>
    query({ items: [{ category: '식비', amount: 740_000 }, { category: '구독', amount: 64_000 }] }),
  useSubcategoryBreakdown: () => query({ items: [{ category: '배달', amount: 320_000 }] }),
  useDailySpend: () => query({ items: [{ date: '2026-06-09', amount: -23_000 }] }),
  useMerchantTreemap: () =>
    query({ items: [{ name: '식비', value: 740_000, children: [{ name: '쿠팡이츠', value: 320_000 }] }] }),
  useIncomeCategoryTimeline: () => query({ items: [{ period: '2026-06', category: '급여', amount: 5_000_000 }] }),
  useIncomeCategoryBreakdown: () => query({ items: [{ category: '급여', amount: 5_000_000 }] }),
  useTransactionList: () =>
    query({
      total: 1,
      page: 1,
      per_page: 20,
      items: [
        {
          id: 1,
          date: '2026-06-09',
          merchant: '쿠팡이츠',
          effective_category_major: '식비',
          effective_category_minor: '배달',
          amount: -23_000,
        },
      ],
    }),
}))

vi.mock('../../hooks/useAnalytics', () => ({
  useCategoryMoM: () =>
    query({
      items: [
        { period: '2026-06', previous_period: '2026-05', category: '식비', current_amount: 740_000, previous_amount: 410_000, delta_amount: 330_000, delta_pct: 0.8049 },
      ],
    }),
  useFixedCostSummary: () =>
    query({
      expense_total: 3_400_000, fixed_total: 1_200_000, variable_total: 1_800_000, fixed_ratio: 0.4,
      essential_fixed_total: 900_000, discretionary_fixed_total: 300_000,
      essential_variable_total: 600_000, discretionary_variable_total: 1_200_000,
      required_spend_total: 1_500_000, discretionary_spend_total: 1_500_000,
      unclassified_total: 400_000, unclassified_count: 12,
    }),
  useFixedCostTrend: () =>
    query({
      items: [
        { period: '2026-06', expense_total: 3_400_000, fixed_total: 1_200_000, variable_total: 1_800_000, essential_fixed_total: 900_000, discretionary_fixed_total: 300_000, essential_variable_total: 600_000, discretionary_variable_total: 1_200_000, required_spend_total: 1_500_000, discretionary_spend_total: 1_500_000, unclassified_total: 400_000, unclassified_count: 12, fixed_ratio: 0.4 },
      ],
    }),
  useMerchantSpend: () =>
    query({ items: [{ merchant: '쿠팡이츠', amount: 320_000, count: 14, avg_amount: 22_857, last_seen_at: '2026-06-09' }] }),
}))

function renderPage(path = '/spending') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SpendingPage />
    </MemoryRouter>,
  )
}

describe('SpendingPage', () => {
  it('렌즈 탭 6개와 기간 컨트롤을 렌더한다', () => {
    renderPage()
    const lensTabs = screen.getByRole('tablist', { name: '지출 렌즈' })
    for (const label of ['추이', '구성', '고정비', '거래처', '달력', '수입']) {
      expect(lensTabs).toHaveTextContent(label)
    }
    expect(screen.getByText('3개월')).toBeInTheDocument()
    expect(screen.getByLabelText('수입 포함')).toBeInTheDocument()
  })

  it('기본 렌즈(추이): 스택 바 + MoM', () => {
    renderPage()
    expect(screen.getByText('월별 카테고리 추이')).toBeInTheDocument()
    expect(screen.getByText('카테고리 전월 대비')).toBeInTheDocument()
    expect(screen.getByText(/\+80\.5%/)).toBeInTheDocument()
    expect(screen.getByText('+₩33만')).toBeInTheDocument()
  })

  it('공통 거래 내역 패널이 렌더된다', () => {
    renderPage()
    expect(screen.getByText('거래 내역')).toBeInTheDocument()
    expect(screen.getByText('쿠팡이츠')).toBeInTheDocument()
    expect(screen.getByText('-₩23,000')).toBeInTheDocument()
  })

  it('수입 렌즈로 전환하면 수입 구성이 표시된다', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '수입' }))
    expect(screen.getByText('월별 수입 구성')).toBeInTheDocument()
    expect(screen.getByText('수입원별 합계')).toBeInTheDocument()
  })

  it('고정비 렌즈: 미분류 게이지 + 인박스 딥링크', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '고정비' }))
    expect(screen.getByText('미분류 지출 · 12건')).toBeInTheDocument()
    expect(screen.getByText('인박스에서 분류')).toBeInTheDocument()
  })

  it('신호 딥링크의 카테고리와 부분기간을 차트 및 거래 요청에 전달한다', () => {
    const transactions = vi.spyOn(transactionHooks, 'useTransactionList')
    const breakdown = vi.spyOn(transactionHooks, 'useCategoryBreakdown')
    const subcategory = vi.spyOn(transactionHooks, 'useSubcategoryBreakdown')
    renderPage('/spending?lens=composition&category=보험&from=2026-06&to=2026-06&start_date=2026-06-01&end_date=2026-06-12')
    expect(transactions).toHaveBeenLastCalledWith(expect.objectContaining({ category_major: '보험', start_date: '2026-06-01', end_date: '2026-06-12', type: '지출' }))
    expect(breakdown).toHaveBeenLastCalledWith(expect.objectContaining({ start_date: '2026-06-01', end_date: '2026-06-12' }))
    expect(subcategory).toHaveBeenLastCalledWith(expect.objectContaining({ category_major: '보험', end_date: '2026-06-12' }))
    expect(screen.getByText('카테고리: 보험')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '수입' }))
    expect(transactions).toHaveBeenLastCalledWith(expect.objectContaining({ type: '수입', category_major: undefined, search: undefined }))
    expect(screen.queryByText('카테고리: 보험')).not.toBeInTheDocument()
  })

  it('수입 포함은 추이·구성·거래처·전월비·거래 목록에 적용하며 이체를 요청하지 않는다', () => {
    const timeline = vi.spyOn(transactionHooks, 'useCategoryTimeline')
    const breakdown = vi.spyOn(transactionHooks, 'useCategoryBreakdown')
    const transactions = vi.spyOn(transactionHooks, 'useTransactionList')
    const merchants = vi.spyOn(analyticsHooks, 'useMerchantSpend')
    const mom = vi.spyOn(analyticsHooks, 'useCategoryMoM')
    renderPage()
    fireEvent.click(screen.getByLabelText('수입 포함'))
    expect(timeline).toHaveBeenLastCalledWith(expect.objectContaining({ include_income: true }))
    expect(breakdown).toHaveBeenLastCalledWith(expect.objectContaining({ include_income: true }))
    expect(merchants).toHaveBeenLastCalledWith(expect.objectContaining({ include_income: true }))
    expect(mom).toHaveBeenLastCalledWith(expect.objectContaining({ include_income: true }))
    expect(transactions).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'income_expense' }))
    fireEvent.click(screen.getByRole('tab', { name: '고정비' }))
    expect(screen.getByLabelText('수입 포함')).toBeDisabled()
    expect(transactions).toHaveBeenLastCalledWith(expect.objectContaining({ type: '지출' }))
  })

  it('필수·재량은 고정/변동 미분류와 다른 필요도 미분류를 사용한다', () => {
    const original = analyticsHooks.useFixedCostSummary()
    vi.spyOn(analyticsHooks, 'useFixedCostSummary').mockReturnValue({ ...original, data: {
      ...original.data!, necessity_unclassified_total: 450_000, necessity_unclassified_count: 15,
    } } as ReturnType<typeof analyticsHooks.useFixedCostSummary>)
    renderPage('/spending?lens=fixed')
    fireEvent.click(screen.getByRole('tab', { name: '필수/재량' }))
    expect(screen.getByText('필요도 미분류 · 15건')).toBeInTheDocument()
    expect(screen.getByText('₩45만')).toBeInTheDocument()
  })


  it('부분기간 딥링크에서 다른 달력을 고르면 기존 종료일 제한을 해제한다', () => {
    const daily = vi.spyOn(transactionHooks, 'useDailySpend')
    renderPage('/spending?lens=calendar&from=2026-06&to=2026-06&start_date=2026-06-01&end_date=2026-06-12')
    expect(daily).toHaveBeenLastCalledWith(expect.objectContaining({ month: '2026-06', end_date: '2026-06-12' }))
    fireEvent.change(screen.getByLabelText('달력 월'), { target: { value: '2026-05' } })
    expect(daily).toHaveBeenLastCalledWith(expect.objectContaining({ month: '2026-05', start_date: undefined, end_date: undefined }))
  })

})
