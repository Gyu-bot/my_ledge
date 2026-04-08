import { apiFetch } from '../lib/apiClient'
import { monthSpanToDateRange, monthToDateRange } from '../lib/dateRange'
import type {
  TransactionListResponse,
  TransactionListParams,
  TransactionFilterOptionsResponse,
  TransactionUpdateRequest,
  TransactionBulkUpdateRequest,
  CategoryTimelineItem,
  CategoryBreakdownItem,
  CategoryBreakdownParams,
  SubcategoryBreakdownParams,
  MerchantTreemapNode,
} from '../types/transaction'

function buildQuery(params: object): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function loadTransactionsForDateRange(params: {
  start_date?: string
  end_date?: string
  include_income?: boolean
}) {
  const type = params.include_income ? 'all' : '지출'
  const perPage = 200
  const firstPage = await apiFetch<TransactionListResponse>(`/transactions${buildQuery({
    start_date: params.start_date,
    end_date: params.end_date,
    type,
    page: 1,
    per_page: perPage,
  })}`)

  const items = [...firstPage.items]
  const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.per_page))

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await apiFetch<TransactionListResponse>(`/transactions${buildQuery({
      start_date: params.start_date,
      end_date: params.end_date,
      type,
      page,
      per_page: perPage,
    })}`)
    items.push(...nextPage.items)
  }

  return items
}

export const transactionApi = {
  list: (params: TransactionListParams = {}) => {
    const { start_month, end_month, ...rest } = params
    return apiFetch<TransactionListResponse>(`/transactions${buildQuery({
      ...rest,
      ...monthSpanToDateRange(start_month, end_month),
    })}`)
  },

  filterOptions: () =>
    apiFetch<TransactionFilterOptionsResponse>('/transactions/filter-options'),

  update: (id: number, data: TransactionUpdateRequest) =>
    apiFetch<void>(`/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    apiFetch<void>(`/transactions/${id}`, { method: 'DELETE' }),

  restore: (id: number) =>
    apiFetch<void>(`/transactions/${id}/restore`, { method: 'POST' }),

  bulkUpdate: (data: TransactionBulkUpdateRequest) =>
    apiFetch<{ updated: number }>('/transactions/bulk-update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  categoryTimeline: (params: { start_month?: string; end_month?: string } = {}) =>
    apiFetch<{ items: CategoryTimelineItem[] }>(`/transactions/by-category/timeline${buildQuery(
      monthSpanToDateRange(params.start_month, params.end_month),
    )}`),

  categoryBreakdown: (params: CategoryBreakdownParams = {}) =>
    apiFetch<{ items: CategoryBreakdownItem[] }>(`/transactions/by-category${buildQuery({
      ...monthSpanToDateRange(params.start_month, params.end_month),
      type: params.include_income ? 'all' : '지출',
      level: params.level,
    })}`),

  subcategoryBreakdown: async (params: SubcategoryBreakdownParams) => {
    const items = await loadTransactionsForDateRange({
      ...monthSpanToDateRange(params.start_month, params.end_month),
      include_income: params.include_income,
    })
    const grouped = new Map<string, number>()

    for (const item of items) {
      if (item.effective_category_major !== params.category_major) continue
      const category = item.effective_category_minor ?? '미분류'
      grouped.set(category, (grouped.get(category) ?? 0) + item.amount)
    }

    return {
      items: Array.from(grouped.entries())
        .sort(([leftCategory, leftAmount], [rightCategory, rightAmount]) =>
          leftAmount - rightAmount || leftCategory.localeCompare(rightCategory),
        )
        .map(([category, amount]) => ({ category, amount })),
    }
  },

  dailySpend: async (params: { month: string; include_income?: boolean }) => {
    const items = await loadTransactionsForDateRange({
      ...monthToDateRange(params.month),
      include_income: params.include_income,
    })

    const totals = new Map<string, number>()
    for (const item of items) {
      totals.set(item.date, (totals.get(item.date) ?? 0) + item.amount)
    }

    return {
      items: Array.from(totals.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, amount]) => ({ date, amount })),
    }
  },

  merchantTreemap: async (params: {
    start_month?: string
    end_month?: string
    include_income?: boolean
  }) => {
    const items = await loadTransactionsForDateRange({
      ...monthSpanToDateRange(params.start_month, params.end_month),
      include_income: params.include_income,
    })

    const grouped = new Map<string, Map<string, number>>()
    for (const item of items) {
      const category = item.effective_category_major || '기타'
      const merchant = item.merchant || item.description || '기타'
      const merchants = grouped.get(category) ?? new Map<string, number>()
      merchants.set(merchant, (merchants.get(merchant) ?? 0) + item.amount)
      grouped.set(category, merchants)
    }

    const tree: MerchantTreemapNode[] = Array.from(grouped.entries())
      .map(([category, merchants]) => {
        const children = Array.from(merchants.entries())
          .map(([merchant, amount]) => ({
            name: merchant,
            value: Math.abs(amount),
          }))
          .filter((node) => node.value > 0)
          .sort((left, right) => right.value - left.value)

        return {
          name: category,
          value: children.reduce((sum, node) => sum + node.value, 0),
          children,
        }
      })
      .filter((node) => node.value > 0)
      .sort((left, right) => right.value - left.value)

    return { items: tree }
  },
}
