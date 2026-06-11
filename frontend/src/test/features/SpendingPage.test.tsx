import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SpendingPage } from '../../features/spending/SpendingPage'

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
        { period: '2026-06', previous_period: '2026-05', category: '식비', current_amount: 740_000, previous_amount: 410_000, delta_amount: 330_000, delta_pct: 80.5 },
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
})
