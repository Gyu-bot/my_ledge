import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Toaster } from '../../ds/toast'
import { NatureSettingsPage } from '../../features/workbench/NatureSettingsPage'
import type { CategoryAdjustabilityDefault, RecurringCommitment, RecurringMergeSuggestion } from '../../types/nature'
import { cubeFixture, dataStatusFixture, failed, query } from './metricsFixtures'
import { recurringFixture } from './workbenchFixtures'

const mocks = vi.hoisted(() => ({
  setDefault: vi.fn(),
  deleteDefault: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  end: vi.fn(),
  remove: vi.fn(),
  bulkRemove: vi.fn(),
  merge: vi.fn(),
}))

let defaults: CategoryAdjustabilityDefault[] = []
let commitments: RecurringCommitment[] = []
let suggestions: RecurringMergeSuggestion[] = []
let commitmentsFail = false

vi.mock('../../hooks/useMetrics', () => ({
  useDataStatus: () => query(dataStatusFixture()),
  useSpendCube: () => query(cubeFixture([
    { effective_category_major: '샘플 식비', effective_category_minor: '카페', amount: 50_000 },
    { effective_category_major: '샘플 식비', effective_category_minor: null, amount: 10_000 },
  ], ['effective_category_major', 'effective_category_minor'])),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionFilterOptions: () => query({
    category_options: ['샘플 교통', '샘플 식비', '샘플 구독료'],
    category_minor_options: ['카페', '배달'],
    category_minor_options_by_major: { '샘플 식비': ['카페', '배달'] },
    payment_method_options: [],
  }),
}))

vi.mock('../../hooks/useNature', () => ({
  useCategoryDefaults: () => query({ items: defaults }),
  useSetCategoryDefault: () => ({ mutateAsync: mocks.setDefault, isPending: false }),
  useDeleteCategoryDefault: () => ({ mutateAsync: mocks.deleteDefault, isPending: false }),
  useRecurringCommitments: () => (commitmentsFail ? failed('503: down') : query({ items: commitments, merge_suggestions: suggestions })),
  useCreateRecurringCommitment: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateRecurringCommitment: () => ({ mutateAsync: mocks.update, isPending: false }),
  useEndRecurringCommitment: () => ({ mutateAsync: mocks.end, isPending: false }),
  useMergeRecurringCommitments: () => ({ mutateAsync: mocks.merge, isPending: false }),
  useBulkDeleteRecurringCommitments: () => ({ mutateAsync: mocks.bulkRemove, isPending: false }),
  useDeleteRecurringCommitment: () => ({ mutateAsync: mocks.remove, isPending: false }),
}))

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function renderPage(path = '/data/nature') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NatureSettingsPage />
      <Toaster />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  defaults = [{ id: 3, category_major: '샘플 교통', category_minor: null, adjustability: 'protected', created_at: '', updated_at: '' }]
  commitments = [
    recurringFixture(),
    recurringFixture({ id: 8, label: '샘플 보험', match_scope: 'category', merchant: null, category_major: '샘플 보험료', cycle: null, amount_kind: null, adjustability: null, origin: 'migration', member_transaction_count: 12 }),
    recurringFixture({ id: 9, label: '샘플 끝난 구독', end_date: '2026-03-31' }),
  ]
  suggestions = []
  commitmentsFail = false
  for (const mock of Object.values(mocks)) mock.mockReset().mockResolvedValue({ id: 99, member_transaction_count: 4 })
})

describe('NatureSettingsPage — 카테고리 기본값', () => {
  it('미정 금액이 큰 카테고리부터 보이고, 기본값을 고르면 저장한다', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '작업대 · 기본값·정기 지급' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '카테고리 기본값' })
    const firstRow = within(list).getAllByRole('listitem')[0]
    expect(within(firstRow).getByText('샘플 식비')).toBeInTheDocument()
    expect(within(firstRow).getByText('미정 ₩60,000')).toBeInTheDocument()
    expect(screen.getByLabelText('샘플 교통 조정 가능성 기본값')).toHaveValue('protected')
    fireEvent.change(screen.getByLabelText('샘플 식비 조정 가능성 기본값'), { target: { value: 'adjustable' } })
    await waitFor(() => expect(mocks.setDefault).toHaveBeenCalledWith({ category_major: '샘플 식비', category_minor: null, adjustability: 'adjustable' }))
  })

  it('소분류는 대분류 값을 따르거나 따로 정할 수 있고, 정하지 않음으로 돌리면 지운다', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /소분류 2개/ }))
    const cafe = screen.getByLabelText('샘플 식비 / 카페 조정 가능성 기본값')
    expect(within(cafe).getByRole('option', { name: '대분류 값 따름 (미정)' })).toBeInTheDocument()
    fireEvent.change(cafe, { target: { value: 'protected' } })
    await waitFor(() => expect(mocks.setDefault).toHaveBeenCalledWith({ category_major: '샘플 식비', category_minor: '카페', adjustability: 'protected' }))
    fireEvent.change(screen.getByLabelText('샘플 교통 조정 가능성 기본값'), { target: { value: '' } })
    await waitFor(() => expect(mocks.deleteDefault).toHaveBeenCalledWith(3))
  })
})

describe('NatureSettingsPage — 정기 지급 묶음', () => {
  it('진행 중 묶음을 속성과 함께 보이고 끝난 것은 따로 본다', () => {
    renderPage('/data/nature?tab=recurring')
    const list = screen.getByRole('list', { name: '정기 지급 묶음' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText(/주기 매월 · 매번 같은 금액 · 조정 가능성 조정 가능/)).toBeInTheDocument()
    expect(within(list).getByText('예전 분류에서 옮김')).toBeInTheDocument()
    expect(within(list).getByText(/주기 미정 · 금액 미정 · 조정 가능성 미정/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '끝난 것' }))
    expect(within(screen.getByRole('list', { name: '정기 지급 묶음' })).getByText('샘플 끝난 구독')).toBeInTheDocument()
  })

  it('분류 큐에서 넘어온 거래처·카테고리를 채워 등록하고, 나머지 값은 비워 둔다', async () => {
    renderPage('/data/nature?tab=recurring&new=1&merchant=%EC%83%98%ED%94%8C%20%EC%B9%B4%ED%8E%98&category_major=%EC%83%98%ED%94%8C%20%EC%8B%9D%EB%B9%84&category_minor=%EC%B9%B4%ED%8E%98')
    const form = screen.getByRole('form', { name: '정기 지급 등록' })
    expect(within(form).getByLabelText('거래처 (분석용 거래처 이름 그대로)')).toHaveValue('샘플 카페')
    expect(within(form).getByLabelText('대분류')).toHaveValue('샘플 식비')
    expect(within(form).getByLabelText('소분류')).toHaveValue('카페')
    expect(within(form).getByLabelText('주기')).toHaveValue('')
    expect(within(form).getByLabelText('조정 가능성')).toHaveValue('')
    fireEvent.change(within(form).getByLabelText('주기'), { target: { value: 'monthly' } })
    fireEvent.click(within(form).getByRole('button', { name: '정기 지급 등록' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      label: null, match_scope: 'merchant', merchant_match: 'exact', merchant: '샘플 카페', category_major: '샘플 식비', category_minor: '카페',
      cycle: 'monthly', total_count: null, amount_kind: null, adjustability: null, start_date: null, end_date: null, memo: null,
    }))
  })

  it('입력이 맞지 않으면 쉬운 말로 알리고 보내지 않는다', () => {
    renderPage('/data/nature?tab=recurring&new=1')
    const form = screen.getByRole('form', { name: '정기 지급 등록' })
    fireEvent.change(within(form).getByLabelText('대분류'), { target: { value: '샘플 식비' } })
    fireEvent.click(within(form).getByRole('button', { name: '정기 지급 등록' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('거래처 단위로 묶으려면 거래처 이름이 필요합니다.')
    fireEvent.change(within(form).getByLabelText('거래처 (분석용 거래처 이름 그대로)'), { target: { value: '샘플 렌탈' } })
    fireEvent.change(within(form).getByLabelText('주기'), { target: { value: 'n_times' } })
    fireEvent.click(within(form).getByRole('button', { name: '정기 지급 등록' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('정해진 횟수 약정은 전체 횟수(1 이상)가 필요합니다.')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('고치기, 끝내기(날짜), 지우기(확인 문구)를 한다', async () => {
    renderPage('/data/nature?tab=recurring')
    const row = screen.getByText('샘플 구독 · 샘플 구독료').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '고치기' }))
    const form = within(row).getByRole('form', { name: '고친 내용 저장' })
    fireEvent.change(within(form).getByLabelText('조정 가능성'), { target: { value: 'protected' } })
    fireEvent.click(within(form).getByRole('button', { name: '고친 내용 저장' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 7, data: expect.objectContaining({ adjustability: 'protected', merchant: '샘플 구독', cycle: 'monthly' }) }))

    fireEvent.click(within(row).getByRole('button', { name: '끝내기' }))
    expect(within(row).getByRole('button', { name: '이 날까지로 끝내기' })).toBeDisabled()
    fireEvent.change(within(row).getByLabelText('마지막 날'), { target: { value: '2026-07-31' } })
    fireEvent.click(within(row).getByRole('button', { name: '이 날까지로 끝내기' }))
    await waitFor(() => expect(mocks.end).toHaveBeenCalledWith({ id: 7, endDate: '2026-07-31' }))

    fireEvent.click(within(row).getByRole('button', { name: '지우기' }))
    const dialog = screen.getByRole('alertdialog', { name: '정기 지급 지우기' })
    expect(within(dialog).getByText(/속했던 거래 7건은 약정이 아닌 수시 지출로 돌아가고/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '지우기' })).toBeDisabled()
    fireEvent.change(within(dialog).getByPlaceholderText('확인 문구 입력'), { target: { value: '지우기' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(7))
  })

  it('등록된 묶음이 없으면 안내를, 읽기 실패면 오류를 보인다', () => {
    commitments = []
    const view = renderPage('/data/nature?tab=recurring')
    expect(screen.getByText(/등록된 정기 지급이 없습니다/)).toBeInTheDocument()
    view.unmount()
    commitmentsFail = true
    renderPage('/data/nature?tab=recurring')
    expect(screen.getByText('데이터베이스 조회가 실패했습니다. 잠시 뒤 다시 시도해 주세요.')).toBeInTheDocument()
  })
})

it('확인 대기는 끝난 묶음도 보여 주고 빈 속성을 그대로 확인할 수 있다', async () => {
  commitments = [recurringFixture({ id: 8, label: '샘플 확인 대기', origin: 'migration', cycle: null, amount_kind: null, needs_attribute_confirmation: true, end_date: '2026-01-01' })]
  renderPage('/data/nature?tab=recurring&confirmation=pending')
  const list = screen.getByRole('list', { name: '정기 지급 묶음' })
  expect(within(list).getByText('확인 필요')).toBeInTheDocument()
  fireEvent.click(within(list).getByRole('button', { name: '지금 주기·금액 그대로 확인' }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 8, data: { confirm_attributes: true } }))
})

it('빈 주기를 저장해도 다른 주기를 미리 고르지 않는다', async () => {
  commitments = [recurringFixture({ id: 8, origin: 'migration', cycle: null, amount_kind: null, needs_attribute_confirmation: true })]
  renderPage('/data/nature?tab=recurring&edit=8')
  const form = screen.getByRole('form', { name: '고친 내용 저장' })
  expect(within(form).getByLabelText('주기')).toHaveValue('')
  expect(within(form).getByLabelText('금액')).toHaveValue('')
  fireEvent.click(within(form).getByRole('button', { name: '고친 내용 저장' }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: 8, data: expect.objectContaining({ cycle: null, amount_kind: null }) }))
})


describe('T066 정기 지급 정리', () => {
  it('낮은 관측 필터와 관측 기간을 표시하고 확인 뒤 일괄 삭제한다', async () => {
    commitments = [recurringFixture({ origin: 'migration', low_observation: true, observed_transaction_count: 1 }), recurringFixture({ id: 8, merchant: '샘플 다른 구독' })]
    renderPage('/data/nature?tab=recurring&observation=low')
    expect(within(screen.getByRole('list', { name: '정기 지급 묶음' })).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText(/관측 1회/)).toHaveTextContent('2026-01-05 ~ 2026-07-05')
    fireEvent.click(screen.getByRole('button', { name: '보이는 항목 모두 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 일괄 삭제' }))
    const dialog = screen.getByRole('alertdialog', { name: '정기 지급 1개 일괄 삭제' })
    expect(within(dialog).getByText(/명시적 묶음 연결을 해제/)).toBeInTheDocument()
    expect(mocks.bulkRemove).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByPlaceholderText('확인 문구 입력'), { target: { value: '지우기' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '1개 삭제' }))
    await waitFor(() => expect(mocks.bulkRemove).toHaveBeenCalledWith([7]))
  })

  it('제안 접두어를 미리 채우고 대상과 일치 방식을 확인한 뒤 합친다', async () => {
    commitments = [recurringFixture({ merchant: '샘플 구독01' }), recurringFixture({ id: 8, merchant: '샘플 구독02' })]
    suggestions = [{ ids: [7, 8], target_id: 7, suggested_prefix: '샘플구독' }]
    renderPage('/data/nature?tab=recurring')
    expect(mocks.merge).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '2개를 하나로 합치기' }))
    const dialog = screen.getByRole('alertdialog', { name: '정기 지급 합치기' })
    expect(within(dialog).getByLabelText('합친 뒤 거래처·접두어')).toHaveValue('샘플구독')
    expect(within(dialog).getByLabelText('합친 뒤 일치 방식')).toHaveValue('prefix')
    fireEvent.change(within(dialog).getByLabelText('합친 뒤 거래처·접두어'), { target: { value: 'a' } })
    fireEvent.change(within(dialog).getByPlaceholderText('확인 문구 입력'), { target: { value: '합치기' } })
    expect(within(dialog).getByRole('button', { name: '확인하고 합치기' })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('남길 대상'), { target: { value: '8' } })
    fireEvent.change(within(dialog).getByLabelText('합친 뒤 일치 방식'), { target: { value: 'prefix' } })
    fireEvent.change(within(dialog).getByLabelText('합친 뒤 거래처·접두어'), { target: { value: '샘플구독' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '확인하고 합치기' }))
    await waitFor(() => expect(mocks.merge).toHaveBeenCalledWith({ target_id: 8, source_ids: [7], merchant_match: 'prefix', merchant: '샘플구독' }))
  })

  it('서로 다른 카테고리 선택은 합칠 수 없다', () => {
    commitments = [recurringFixture(), recurringFixture({ id: 8, category_minor: '다른 소분류' })]
    renderPage('/data/nature?tab=recurring')
    fireEvent.click(screen.getByRole('button', { name: '보이는 항목 모두 선택' }))
    expect(screen.getByRole('button', { name: '선택 합치기' })).toBeDisabled()
    expect(screen.getByText('대분류와 소분류가 같은 항목만 합칠 수 있습니다.')).toBeInTheDocument()
  })
})
