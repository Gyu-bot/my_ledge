import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { metricsApi } from '../../api/metrics'
import { commitmentsFixture, commitmentItem, readDataStatusFixture } from './workbenchFixtures'
import { transactionApi } from '../../api/transactions'
import { InstallmentsPage } from '../../features/data/InstallmentsPage'
import type {
  InstallmentPlansResponse,
  InstallmentTransactionLinkItem,
  InstallmentTransactionMappingListResponse,
  InstallmentTransactionSuggestionItem,
  InstallmentTransactionSuggestionListResponse,
} from '../../types/transaction'

vi.mock('../../hooks/useWriteAccess', () => ({ useWriteAccess: () => true }))

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function buildPlan(id: number, displayName: string) {
  return {
    id,
    display_name: displayName,
    merchant: '애플',
    payment_method: '카드',
    total_installments: 3,
    monthly_amount: 300000,
    first_payment_date: '2026-06-05',
    memo: null,
    status: 'active' as const,
    linked_installment_count: 0,
    created_at: '2026-06-27T09:00:00Z',
    updated_at: '2026-06-27T09:00:00Z',
  }
}

function buildPlansResponse(items = [buildPlan(3, '맥북 3개월')]): InstallmentPlansResponse {
  return { items }
}

function buildSuggestion(
  merchant: string,
  suggestedInstallmentNumber: number,
  options: {
    transactionId: number
    conflictReason?: 'installment_number_already_linked' | 'ambiguous_plan_match' | 'competing_transactions' | 'inactive_installment_link' | null
    isUsable?: boolean
    confidence?: 'high' | 'medium' | 'low'
    installmentPlanId?: number
    installmentPlanDisplayName?: string
    installmentPlanMerchant?: string
    totalInstallments?: number
  },
): InstallmentTransactionSuggestionItem {
  const planId = options.installmentPlanId ?? 3
  const totalInstallments = options.totalInstallments ?? 3

  return {
    transaction: {
      transaction_id: options.transactionId,
      date: '2026-06-03',
      time: '09:00:00',
      type: '지출',
      effective_category_major: '생활',
      effective_category_minor: null,
      description: `${merchant} 결제`,
      merchant,
      amount: -300000,
      currency: 'KRW',
      payment_method: '카드',
      memo: null,
    },
    installment_plan_id: planId,
    installment_plan_display_name: options.installmentPlanDisplayName ?? `계획 ${planId}`,
    installment_plan_merchant: options.installmentPlanMerchant ?? '애플',
    total_installments: totalInstallments,
    monthly_amount: 300000,
    first_payment_date: '2026-06-05',
    suggested_installment_number: suggestedInstallmentNumber,
    expected_billing_date: '2026-06-05',
    amount_delta: 0,
    billing_day_delta: 0,
    score: options.confidence === 'medium' ? 82 : 98,
    confidence: options.confidence ?? 'high',
    reason_labels: ['same_merchant', 'same_amount'],
    conflict_reason: options.conflictReason ?? null,
    is_usable: options.isUsable ?? true,
  }
}

function buildMappingsResponse(linkedItem: InstallmentTransactionLinkItem | null): InstallmentTransactionMappingListResponse {
  if (linkedItem == null) {
    return {
      total: 0,
      page: 1,
      per_page: 40,
      items: [],
    }
  }

  return {
    total: 1,
    page: 1,
    per_page: 40,
    items: [
      {
        transaction_id: linkedItem.transaction_id,
        date: '2026-06-03',
        time: '09:00:00',
        type: '지출',
        effective_category_major: '생활',
        effective_category_minor: null,
        description: '애플 스토어 결제',
        merchant: '애플 스토어',
        amount: -300000,
        currency: 'KRW',
        payment_method: '카드',
        memo: null,
        link: linkedItem,
      },
    ],
  }
}

function installApiMocks(options?: {
  plans?: InstallmentPlansResponse
  suggestions?: InstallmentTransactionSuggestionItem[]
}) {
  let linkedItem: InstallmentTransactionLinkItem | null = null
  let suggestionItems = options?.suggestions ?? [
    buildSuggestion('애플 스토어', 1, { transactionId: 81 }),
    buildSuggestion('애플 케어', 2, {
      transactionId: 82,
      conflictReason: 'installment_number_already_linked',
      isUsable: false,
      confidence: 'medium',
    }),
  ]
  const plansResponse = options?.plans ?? buildPlansResponse()

  const plansSpy = vi
    .spyOn(transactionApi, 'installmentPlans')
    .mockImplementation(async () => plansResponse)
  const mappingsSpy = vi
    .spyOn(transactionApi, 'installmentTransactionMappings')
    .mockImplementation(async () => buildMappingsResponse(linkedItem))
  const suggestionsSpy = vi
    .spyOn(transactionApi, 'installmentTransactionSuggestions')
    .mockImplementation(async () => ({
      total: suggestionItems.length,
      page: 1,
      per_page: 40,
      items: suggestionItems,
    } satisfies InstallmentTransactionSuggestionListResponse))
  const linkSpy = vi
    .spyOn(transactionApi, 'linkTransactionToInstallment')
    .mockImplementation(async (id, data) => {
      const matchedSuggestion = suggestionItems.find(
        (item) =>
          item.transaction.transaction_id === id &&
          item.installment_plan_id === data.installment_plan_id,
      )
      linkedItem = {
        transaction_id: id,
        installment_plan_id: data.installment_plan_id,
        installment_plan_display_name: matchedSuggestion?.installment_plan_display_name ?? '맥북 3개월',
        installment_number: data.installment_number,
        total_installments: matchedSuggestion?.total_installments ?? 3,
        monthly_amount: matchedSuggestion?.monthly_amount ?? 300000,
        due_date: matchedSuggestion?.expected_billing_date ?? '2026-06-05',
        source: 'manual',
        memo: data.memo ?? null,
        created_at: '2026-06-27T09:10:00Z',
        updated_at: '2026-06-27T09:10:00Z',
      }
      suggestionItems = suggestionItems.filter((item) => item.transaction.transaction_id !== id)
      return linkedItem
    })

  return {  linkSpy, mappingsSpy, plansSpy, suggestionsSpy }
}

function renderPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <InstallmentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openLinksTab() {
  fireEvent.click(screen.getByRole('tab', { name: '거래 연결' }))
}

describe('InstallmentsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders installment suggestions with the proposed number and does not auto-link', async () => {
    const queryClient = createQueryClient()
    const { linkSpy } = installApiMocks()

    renderPage(queryClient)
    await openLinksTab()
    await screen.findByLabelText('애플 스토어 제안 회차')

    expect(screen.getAllByText('제안 회차').length).toBeGreaterThan(0)
    expect(screen.getByText('1회차')).toBeInTheDocument()
    expect(screen.getByLabelText('애플 스토어 제안 회차')).toHaveValue(1)
    expect(screen.getAllByText('거래처 일치').length).toBeGreaterThan(0)
    expect(linkSpy).not.toHaveBeenCalled()
  })

  it('marks conflict suggestions clearly and disables linking for unusable rows', async () => {
    const queryClient = createQueryClient()
    installApiMocks()

    renderPage(queryClient)
    await openLinksTab()
    await screen.findByRole('button', { name: '애플 케어 추천 연결' })

    expect(screen.getByText('회차 충돌')).toBeInTheDocument()
    expect(screen.getByText('이미 연결된 회차')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '애플 케어 추천 연결' })).toBeDisabled()
  })

  it('links a suggestion with the suggested number and refetches suggestions and list', async () => {
    const queryClient = createQueryClient()
    const invalidateQueries = queryClient.invalidateQueries.bind(queryClient)
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation((...args) => invalidateQueries(...args))
    const {  linkSpy, mappingsSpy, suggestionsSpy } = installApiMocks()

    renderPage(queryClient)
    await openLinksTab()
    await screen.findByRole('button', { name: '애플 스토어 추천 연결' })

    const initialSuggestionCalls = suggestionsSpy.mock.calls.length
    const initialMappingCalls = mappingsSpy.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: '애플 스토어 추천 연결' }))

    await waitFor(() => {
      expect(linkSpy).toHaveBeenCalledWith(81, {
        installment_plan_id: 3,
        installment_number: 1,
        memo: null,
      })
    })

    await waitFor(() => {
      expect(suggestionsSpy.mock.calls.length).toBeGreaterThan(initialSuggestionCalls)
      expect(mappingsSpy.mock.calls.length).toBeGreaterThan(initialMappingCalls)
    })

    await waitFor(() => {
      expect(screen.queryByLabelText('애플 스토어 제안 회차')).not.toBeInTheDocument()
    })

    const invalidatedKeys = invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey)
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ['transactions'],
        ['canonical-views'],
        ['analytics'],
        ['assets'],
      ]),
    )
  })

  it('keeps duplicate transaction suggestions isolated by installment plan when editing and linking', async () => {
    const queryClient = createQueryClient()
    const { linkSpy } = installApiMocks({
      plans: buildPlansResponse([buildPlan(3, '맥북 3개월'), buildPlan(7, '아이패드 6개월')]),
      suggestions: [
        buildSuggestion('애플 스토어', 1, {
          transactionId: 91,
          installmentPlanId: 3,
          installmentPlanDisplayName: '맥북 3개월',
        }),
        buildSuggestion('애플 스토어', 2, {
          transactionId: 91,
          installmentPlanId: 7,
          installmentPlanDisplayName: '아이패드 6개월',
          totalInstallments: 6,
        }),
      ],
    })

    renderPage(queryClient)
    await openLinksTab()
    await screen.findAllByRole('button', { name: '애플 스토어 추천 연결' })

    const firstRow = screen.getByText('맥북 3개월', { selector: 'div' }).closest('tr')
    const secondRow = screen.getByText('아이패드 6개월', { selector: 'div' }).closest('tr')

    expect(firstRow).not.toBeNull()
    expect(secondRow).not.toBeNull()

    fireEvent.change(within(firstRow!).getByLabelText('애플 스토어 제안 회차'), {
      target: { value: '4' },
    })
    fireEvent.change(within(secondRow!).getByLabelText('애플 스토어 제안 회차'), {
      target: { value: '6' },
    })
    fireEvent.click(within(secondRow!).getByRole('button', { name: '애플 스토어 추천 연결' }))

    await waitFor(() => {
      expect(linkSpy).toHaveBeenCalledWith(91, {
        installment_plan_id: 7,
        installment_number: 6,
        memo: null,
      })
    })

    expect(linkSpy).not.toHaveBeenCalledWith(91, {
      installment_plan_id: 3,
      installment_number: 6,
      memo: null,
    })
  })
  it('계획을 완료 처리한다', async () => {
    const queryClient = createQueryClient()
    installApiMocks()
    const patchSpy = vi.spyOn(transactionApi, 'patchInstallmentPlan').mockResolvedValue({ ...buildPlan(3, '맥북 3개월'), status: 'completed' })
    renderPage(queryClient)
    const select = await screen.findByLabelText('맥북 3개월 진행 상태')
    fireEvent.change(select, { target: { value: 'completed' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith(3, { display_name: '맥북 3개월', memo: null, status: 'completed' }))
    expect(document.body.textContent).not.toContain('₩₩')
  })

  it('서로 경쟁하는 추천을 한국어로 설명하고 자동 연결하지 않는다', async () => {
    const queryClient = createQueryClient()
    const { linkSpy } = installApiMocks({ suggestions: [buildSuggestion('모호한 거래처', 1, { transactionId: 99, conflictReason: 'competing_transactions', isUsable: false })] })
    renderPage(queryClient)
    await openLinksTab()
    expect(await screen.findByText('같은 회차의 다른 후보 거래 확인 필요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '모호한 거래처 추천 연결' })).toBeDisabled()
    expect(linkSpy).not.toHaveBeenCalled()
  })

  it('삭제·병합 연결은 명시적으로 해제하며 추천 거래는 자동 연결하지 않는다', async () => {
    const queryClient = createQueryClient()
    const { linkSpy } = installApiMocks({ suggestions: [{ ...buildSuggestion('연결 보류 거래처', 1, { transactionId: 99, conflictReason: 'inactive_installment_link', isUsable: false }), conflicting_transaction_id: 80, conflicting_transaction_state: 'deleted' }] })
    const unlinkSpy = vi.spyOn(transactionApi, 'unlinkTransactionFromInstallment').mockResolvedValue(undefined)
    renderPage(queryClient)
    await openLinksTab()
    const button = await screen.findByRole('button', { name: '연결 보류 거래처 삭제·병합 거래의 연결 해제' })
    expect(screen.getByRole('button', { name: '연결 보류 거래처 추천 연결' })).toBeDisabled()
    expect(screen.getByText(/삭제된 원거래 #80의 연결만 해제/)).toBeInTheDocument()
    fireEvent.click(button)
    await waitFor(() => expect(unlinkSpy).toHaveBeenCalledWith(80, { require_inactive: true }))
    expect(linkSpy).not.toHaveBeenCalled()
  })

})


it('할부의 월별 관측과 남은 회차를 읽고 미래 예측은 표시하지 않는다', async () => {
  installApiMocks()
  const read = vi.spyOn(metricsApi, 'commitments').mockResolvedValue(commitmentsFixture([
    commitmentItem({ kind: 'installment', kind_label: '할부', name: '샘플 할부', remaining_count: 2, end_date: '2026-09-15', state: 'expected_not_observed' }),
  ]))
  vi.spyOn(metricsApi, 'readDataStatus').mockResolvedValue(readDataStatusFixture())
  renderPage(createQueryClient())
  expect(screen.queryByRole('tab', { name: '예측' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: '관측 여부' }))
  expect(await screen.findByText('샘플 할부')).toBeInTheDocument()
  expect(screen.getByText('남은 회차 2회 · 마지막 회차 예정일 2026-09-15')).toBeInTheDocument()
  expect(screen.getByText(/앞으로의 출금 예측이나 미납 판정이 아닙니다/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: '할부 관측할 달' }), { target: { value: '2026-08' } })
  await waitFor(() => expect(read).toHaveBeenLastCalledWith('2026-08'))
  expect(screen.queryByText('미래 예정')).not.toBeInTheDocument()
})
