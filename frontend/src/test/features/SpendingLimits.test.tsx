import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SpendingReferenceCard } from '../../features/analysis/SpendingReferenceCard'
import { SpendingLimitsEditor } from '../../features/settings/SpendingLimitsEditor'
import type { SpendingLimitHistory, SpendingReference } from '../../types/spendingLimits'
import { failed, loading, query } from './metricsFixtures'

const create = vi.fn()
let writable = true
let reference: SpendingReference
let history: SpendingLimitHistory
let state: 'ready' | 'error' | 'loading' = 'ready'
const periods: string[] = []
vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => writable }))
vi.mock('../../hooks/useSpendingLimits', () => ({
  useSpendingReference: (period: string) => { periods.push(period); return state === 'error' ? failed() : state === 'loading' ? loading() : query(reference) },
  useSpendingLimitHistory: () => query(history),
  useCreateSpendingLimit: () => ({ mutateAsync: create, isPending: false }),
}))

beforeEach(() => {
  create.mockReset().mockResolvedValue({})
  writable = true; state = 'ready'; periods.length = 0
  history = { revisions: [], last_closed_period: '2030-12', history_rule: '과거 마감월은 바꾸지 않고 새 버전으로 저장합니다.' }
  reference = {
    basis: { definition: 'spending_reference.v1', scope: '과거 기록', rules: { limit_history: history.history_rule } },
    data: {
      period: '2030-12', total_outflow: 120, window_start_period: '2030-01', window_end_period: '2030-12', annual_missing_reason: null, annual_missing_reason_label: null,
      annual_items: [{ category: '합성 대분류', category_minor: '합성 연간 항목', source: 'observed_pattern', commitment_id: null, commitment_label: null, observed_periods: ['2030-03'], window_amount: 12000, monthly_equivalent: 1000, active_months_in_window: 1 }],
      comparisons: [{ target_kind: 'category', target_value: '합성 항목', target_label: '합성 항목', actual_amount: 120, one_off_amount: 30, limit_amount: 100, limit_revision_id: 1, effective_from_period: '2030-01', difference_amount: 20, missing_reason: null, missing_reason_label: null }],
    },
  }
})

function card(period = '2030-12') { return render(<MemoryRouter><SpendingReferenceCard period={period} /></MemoryRouter>) }

describe('T062 참고 표시와 한도 대비', () => {
  it('연 1회 기록은 12개월 합계와 월 환산을 따로 보이고 총지급을 더하지 않는다', () => {
    card()
    expect(screen.getByText('2030-12 기록 · 총지급 ₩120')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '연간성 지출 월 환산' })).toHaveTextContent('12개월 ₩12,000 → 월 ₩1,000 (참고)')
    expect(screen.getByText(/총지급이나 한도 대비 실적에 다시 더하지/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '월 한도 대비' })).toHaveTextContent('₩20 초과')
    expect(screen.getByRole('list', { name: '월 한도 대비' })).toHaveTextContent('그중 일회성 ₩30')
    expect(periods).toContain('2030-12')
  })
  it('대분류·소분류, 등록 연간 약정 출처와 실제 관측월을 구분한다', () => {
    reference.data.annual_items.push({
      category: '합성 대분류', category_minor: null,
      source: 'registered_yearly_commitment', commitment_id: 7, commitment_label: '합성 약정',
      observed_periods: ['2030-02', '2030-09'], active_months_in_window: 2,
      window_amount: 2400, monthly_equivalent: 200,
    })
    card()
    const list = screen.getByRole('list', { name: '연간성 지출 월 환산' })
    expect(list).toHaveTextContent('합성 대분류 › 합성 연간 항목 · 관측 패턴 · 1개월 관측 (2030-03)')
    expect(list).toHaveTextContent('합성 대분류 › 소분류 없음 · 사람이 등록한 연간 약정 (합성 약정) · 2개월 관측 (2030-02, 2030-09)')
    expect(list).toHaveTextContent('12개월 ₩2,400 → 월 ₩200 (참고)')
    expect(screen.getByText(/지출 합계에 포함하지 않는 참고값/)).toBeInTheDocument()
  })
  it('항목이 없으면 빈 상태를 표시한다', () => {
    reference.data.annual_items = []
    card()
    expect(screen.getByText('이 조건에 해당하는 지출이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '연간성 지출 월 환산' })).not.toBeInTheDocument()
  })
  it('미설정과 진행월은 차이를 만들어 내지 않고 빠진 이유를 보인다', () => {
    reference.data.comparisons[0] = { ...reference.data.comparisons[0], limit_amount: null, difference_amount: null, missing_reason: 'no_limit_set', missing_reason_label: '이 달에 적용할 한도가 없습니다.' }
    const view = card()
    expect(screen.getByRole('list', { name: '월 한도 대비' })).toHaveTextContent('한도 미설정')
    expect(screen.getByText('이 달에 적용할 한도가 없습니다.')).toBeInTheDocument()
    reference.data.annual_items = []; reference.data.annual_missing_reason_label = '진행월에는 12개월 월 환산을 표시하지 않습니다.'
    reference.data.comparisons[0] = { ...reference.data.comparisons[0], missing_reason: 'month_in_progress', missing_reason_label: '진행월은 한도와 비교하지 않습니다.' }
    view.rerender(<MemoryRouter><SpendingReferenceCard period="2031-01" /></MemoryRouter>)
    expect(screen.getByText('진행월은 한도와 비교하지 않습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/₩20 초과/)).not.toBeInTheDocument()
  })
  it('불완전한 12개월 창, 오류와 대기 상태를 처리한다', () => {
    reference.data.annual_items = []; reference.data.annual_missing_reason_label = '최근 12개월이 완전한 자료가 아닙니다.'
    const view = card()
    expect(screen.getByText('최근 12개월이 완전한 자료가 아닙니다.')).toBeInTheDocument()
    state = 'error'; view.rerender(<MemoryRouter><SpendingReferenceCard period="2030-12" /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /다시/ })).toBeInTheDocument()
    state = 'loading'; view.rerender(<MemoryRouter><SpendingReferenceCard period="2030-12" /></MemoryRouter>)
    expect(screen.queryByRole('list', { name: '월 한도 대비' })).not.toBeInTheDocument()
  })
})

describe('T062 사람이 입력하는 한도와 이력', () => {
  it('어떤 값도 미리 선택하지 않고 카테고리 한도를 직접 입력해 저장한다', async () => {
    render(<SpendingLimitsEditor />)
    expect(screen.getByLabelText('한도 단위')).toHaveValue('')
    expect(screen.getByLabelText('적용 시작월')).toHaveValue('')
    expect(screen.getByLabelText('월 한도 (원)')).toHaveValue(null)
    expect(screen.getByRole('button', { name: '새 한도 이력 저장' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('한도 단위'), { target: { value: 'category' } })
    expect(screen.getByRole('button', { name: '새 한도 이력 저장' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('카테고리 대분류'), { target: { value: '합성 항목' } })
    fireEvent.change(screen.getByLabelText('적용 시작월'), { target: { value: '2031-01' } })
    fireEvent.change(screen.getByLabelText('월 한도 (원)'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: '새 한도 이력 저장' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({ target_kind: 'category', target_value: '합성 항목', effective_from_period: '2031-01', amount: 100 }))
    expect(await screen.findByRole('status')).toHaveTextContent('이전 이력은 유지됩니다')
  })
  it('이력을 보존하고 선택한 대상에 새 버전을 입력하며 조정 가능성도 자동 선택하지 않는다', async () => {
    history.revisions = [
      { id: 1, target_kind: 'adjustability', target_value: 'adjustable', effective_from_period: '2030-01', amount: 100, created_at: '2030-01-01' },
      { id: 2, target_kind: 'adjustability', target_value: 'adjustable', effective_from_period: '2030-07', amount: 200, created_at: '2030-07-01' },
    ]
    render(<SpendingLimitsEditor />)
    const list = screen.getByRole('list', { name: '한도 변경 이력' })
    expect(list).toHaveTextContent('2030-01부터 · ₩100')
    expect(list).toHaveTextContent('2030-07부터 · ₩200')
    fireEvent.change(screen.getByLabelText('한도 단위'), { target: { value: 'adjustability' } })
    expect(screen.getByLabelText('한도 대상')).toHaveValue('')
    fireEvent.click(within(list).getAllByRole('button')[1])
    expect(screen.getByLabelText('한도 대상')).toHaveValue('adjustable')
    expect(screen.getByLabelText('월 한도 (원)')).toHaveValue(null)
    fireEvent.change(screen.getByLabelText('적용 시작월'), { target: { value: '2031-01' } })
    fireEvent.click(screen.getByLabelText('이 달부터 한도 해제'))
    fireEvent.click(screen.getByRole('button', { name: '새 한도 이력 저장' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({ target_kind: 'adjustability', target_value: 'adjustable', effective_from_period: '2031-01', amount: null }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })
  it('읽기 전용에서는 저장할 수 없고 저장 실패는 초안을 보존한다', async () => {
    writable = false
    const view = render(<SpendingLimitsEditor />)
    expect(screen.getByLabelText('한도 단위')).toBeDisabled()
    view.unmount(); writable = true; create.mockRejectedValueOnce(new Error('422: invalid period'))
    render(<SpendingLimitsEditor />)
    fireEvent.change(screen.getByLabelText('한도 단위'), { target: { value: 'category' } })
    fireEvent.click(screen.getByLabelText('미분류 카테고리를 대상으로 지정'))
    fireEvent.change(screen.getByLabelText('적용 시작월'), { target: { value: '2030-12' } })
    fireEvent.change(screen.getByLabelText('월 한도 (원)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '새 한도 이력 저장' }))
    expect(await screen.findByRole('status')).toHaveTextContent('마감된 달은 바꿀 수 없습니다')
    expect(screen.getByLabelText('적용 시작월')).toHaveValue('2030-12')
  })
})
