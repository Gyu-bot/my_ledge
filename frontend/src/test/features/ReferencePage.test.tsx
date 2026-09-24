import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReferencePage } from '../../features/data/ReferencePage'
import { lowConfidenceProjectionFixture, projectionFixture } from './projectionFixtures'

const paramsSeen = vi.fn()
let monthProjection = projectionFixture()
beforeEach(() => { monthProjection = projectionFixture(); paramsSeen.mockClear() })
vi.mock('../../hooks/useCanonicalViews', () => ({
  useCanonicalViewsDashboard: (params: { queue_page: number; queue_limit: number }) => {
    paramsSeen(params)
    return {
      isLoading: false,
      isError: false,
      data: {
        data_coverage: { first_transaction_date: '2026-03-01', last_transaction_date: '2026-06-10' },
        monthly_cashflow: [{ period: '2026-06', income_total: 100_000, expense_total: 800_000, net_cashflow: -700_000, savings_rate: null, savings_rate_basis: 'insufficient_partial_month_income', is_complete_month: false, loan_repayment_total: 200_000 }],
        true_spendable_monthly: [{ estimated_income_total: 5_000_000, is_income_estimated: true }],
        month_projection: monthProjection,
        unclassified_work_queue_total: 23,
        unclassified_work_queue_page: params.queue_page,
        unclassified_work_queue_per_page: 10,
        unclassified_work_queue: Array.from({ length: 10 }, (_, i) => ({ transaction_id: i + 1 + (params.queue_page - 1) * 10, merchant: `샘플 미분류 ${i + 1 + (params.queue_page - 1) * 10}`, date: '2026-06-10', priority_reason: ['missing_recurring_kind', 'loan_link_review', 'missing_cost_kind', 'missing_fixed_necessity', 'missing_spend_necessity', 'review', 'future_reason_code'][i % 7], amount_abs: 1000 })),
        merchant_monthly_baseline_total: 45,
        merchant_monthly_baseline: Array.from({ length: 10 }, (_, i) => ({ period: '2026-06', merchant: `샘플 기준선 ${i + 1}`, effective_category_major: '기타', monthly_spend: 5000, baseline_delta: null })),
        recurring_merchant_monthly_total: 19,
        recurring_merchant_monthly: [{ merchant: '샘플 반복' }],
      },
    }
  },
}))
vi.mock('../../hooks/useSchema', () => ({
  useSchemaDocument: () => ({
    isLoading: false,
    isError: false,
    data: { views: [
      { name: 'vw_additional_live_view', columns: [{ name: 'new_column' }, { name: 'needs_recurring_payment_kind' }], recommended_for_ai: false },
      { name: 'vw_monthly_cashflow', columns: [{ name: 'income_total' }], recommended_for_ai: true },
    ] },
  }),
}))

function renderReference() { return render(<MemoryRouter><ReferencePage /></MemoryRouter>) }

describe('ReferencePage projection and completeness', () => {
  it('수집 범위 배지는 모든 미확인 월을 진행중으로 단정하지 않고 검증 안내는 현재 흐름을 설명한다', () => {
    renderReference()
    expect(screen.getByText('부분 수집·진행월')).toBeInTheDocument()
    expect(screen.getByText('1개월 · 수집 범위 미확인 월 표시')).toBeInTheDocument()
    expect(screen.getByText(/월간 전망 근거는 최근 6개월이며, 표의 마감월 여부는 각 월의 관측 범위로 판정합니다/)).toBeInTheDocument()
    expect(screen.queryByText('진행중')).not.toBeInTheDocument()
    expect(screen.getByText(/업로드 결과와 원본 파일을 대조해 확인하세요/)).toBeInTheDocument()
    expect(screen.queryByText(/표면 확정 후 추가됩니다/)).not.toBeInTheDocument()
  })

  it('관측 수입/순현금흐름과 전망을 별도 행에 표시하고 음수 부호를 보존한다', () => {
    renderReference()
    expect(screen.getByText('관측 수입')).toBeInTheDocument()
    expect(screen.getAllByText('-₩70만').length).toBeGreaterThan(0)
    expect(screen.getByText('월 예상 수입')).toBeInTheDocument()
    expect(screen.getByText('₩310만')).toBeInTheDocument()
    expect(screen.queryByText('₩500만')).not.toBeInTheDocument()
    expect(screen.getByText('부분월 수입 부족으로 산출하지 않음')).toBeInTheDocument()
    expect(screen.getByText('현재 계좌 잔액과 별개')).toBeInTheDocument()
  })
  it('낮은 신뢰도의 수치 전망에 확인 사항과 홈 상세 근거 링크를 제공한다', () => {
    monthProjection = lowConfidenceProjectionFixture()
    renderReference()
    const hero = screen.getByText('월말 예상 순현금흐름').parentElement!
    expect(within(hero).getByText('₩140만')).toBeInTheDocument()
    expect(within(hero).getByText('예상 · 신뢰도 낮음')).toBeInTheDocument()
    expect(screen.getByText('낮음')).toBeInTheDocument()
    const summary = screen.getByText('전망 확인 사항 2건')
    fireEvent.click(summary)
    expect(summary.closest('details')).toHaveAttribute('open')
    expect(screen.getByText('샘플 보험: 안정적인 이력이 2개월뿐이어서 추정 신뢰도가 낮습니다.')).toBeVisible()
    expect(screen.getByRole('link', { name: '홈에서 입금 일정과 반복결제 거래처별 전망 근거 보기' })).toHaveAttribute('href', '/')
    expect(screen.queryByText('산출 불가')).not.toBeInTheDocument()
  })
  it('필수 입력이 없으면 월말 전망을 산출 불가로 유지하고 부분 추정 차액을 구분한다', () => {
    monthProjection = { ...monthProjection, expected_remaining_expense: null, projected_month_expense: null, projected_month_end_net: null, confidence: 'unavailable', missing_reasons: ['대출 상환 예정액 누락'] }
    renderReference()
    const hero = screen.getByText('월말 예상 순현금흐름').parentElement!
    expect(within(hero).getByText('산출 불가')).toBeInTheDocument()
    expect(within(hero).getByText('입력 부족')).toBeInTheDocument()
    expect(screen.getByText('산출 제한: 대출 상환 예정액 누락')).toBeInTheDocument()
    expect(screen.getByText(/일부 항목의 추정만 반영한 차액 ₩140만 · 월말 전망 아님/)).toBeInTheDocument()
    expect(screen.queryByText('예상 · 신뢰도 낮음')).not.toBeInTheDocument()
  })
  it('반환된 큐를 모두 표시하고 전체 개수 기준으로 페이지 이동한다', () => {
    renderReference()
    expect(screen.getByText('전체 23건')).toBeInTheDocument()
    expect(screen.getByText('샘플 미분류 10')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '인박스에서 처리' })).toHaveAttribute('href', '/data/inbox')
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(paramsSeen).toHaveBeenLastCalledWith({ queue_page: 2, queue_limit: 10 })
    expect(screen.getByText('샘플 미분류 20')).toBeInTheDocument()
    expect(screen.getByText('2 / 3 페이지 · 총 23건')).toBeInTheDocument()
  })
  it('동적 검토 사유는 한국어로 표시하고 알 수 없는 코드도 그대로 노출하지 않는다', () => {
    renderReference()
    expect(screen.getAllByText(/반복 결제 유형 분류 필요/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/대출 상환 연결 검토/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/고정·변동 지출 분류 필요/).length).toBeGreaterThan(0)
    expect(screen.getByText(/· 고정 지출 필요도 분류 필요$/)).toBeInTheDocument()
    expect(screen.getByText(/· 지출 필요도 분류 필요$/)).toBeInTheDocument()
    expect(screen.getAllByText(/분류 정보 검토 필요/)).toHaveLength(2)
    expect(screen.queryByText(/missing_recurring_kind|loan_link_review|future_reason_code/)).not.toBeInTheDocument()
    expect(screen.getByText(/new_column, needs_recurring_payment_kind/)).toBeInTheDocument()
  })

  it('기준선 요약 제한을 밝히고 선호 목록 밖 스키마도 모두 표시한다', () => {
    renderReference()
    expect(screen.getByText('샘플 기준선 10')).toBeInTheDocument()
    expect(screen.getByText('요약 10 / 전체 45건')).toBeInTheDocument()
    expect(screen.getByText(/반복 거래처도 요약 1 \/ 전체 19건/)).toBeInTheDocument()
    const extra = screen.getByText('vw_additional_live_view')
    expect(extra).toBeInTheDocument()
    const schemaTable = extra.closest('table')
    expect(schemaTable).not.toBeNull()
    const rows = within(schemaTable!).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('vw_monthly_cashflow')
    expect(rows[2]).toHaveTextContent('vw_additional_live_view')
  })
})
