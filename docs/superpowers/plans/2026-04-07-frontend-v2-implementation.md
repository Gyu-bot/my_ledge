# Frontend V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dark Pro 테마 기반의 개인 재무 대시보드 프론트엔드를 `feat/frontend-v2` 브랜치에 완전히 새로 구축한다.

**Architecture:** `frontend/src/` 전체를 새로 작성한다. 기존 파일은 참조하지 않는다. App shell(Sidebar + Topbar) → 공통 UI 컴포넌트 → API 레이어 → 차트 컴포넌트 → 페이지 순으로 Bottom-up 구축한다.

**Tech Stack:** React 18 + TypeScript strict + Tailwind CSS v3 (커스텀 토큰) + TanStack Query v5 + React Router DOM v7 + Recharts v3 + Vitest + React Testing Library

**Design spec:** `docs/superpowers/specs/2026-04-07-frontend-v2-design.md`

---

## File Map

```
frontend/src/
├── main.tsx                          # 앱 진입점
├── App.tsx                           # QueryClientProvider + Router
├── router.tsx                        # 라우트 정의 + redirects
├── index.css                         # Tailwind directives + CSS 변수
├── lib/
│   ├── utils.ts                      # cn(), formatKRW(), formatPct(), formatDate()
│   ├── queryClient.ts                # TanStack Query 클라이언트
│   └── apiClient.ts                  # fetch wrapper + X-API-Key 헤더 주입
├── types/
│   ├── transaction.ts                # TransactionResponse, 필터/수정 request types
│   ├── asset.ts                      # AssetSnapshot, Investment, Loan types
│   ├── analytics.ts                  # MonthlyCashflow, CategoryMoM, 인사이트 types
│   └── upload.ts                     # UploadResponse, UploadLogResponse, Reset types
├── api/
│   ├── transactions.ts               # 거래 CRUD/필터/페이지네이션 API 함수
│   ├── assets.ts                     # 자산/투자/대출 API 함수
│   ├── analytics.ts                  # cashflow/category/merchant/insights API 함수
│   └── upload.ts                     # 업로드/이력/reset API 함수
├── hooks/
│   ├── useWriteAccess.ts             # VITE_API_KEY 존재 여부 → has_write_access
│   ├── useTransactions.ts            # useTransactionList, useTransactionFilterOptions
│   ├── useAssets.ts                  # useAssetSummary, useNetWorthHistory, useInvestments, useLoans
│   ├── useAnalytics.ts               # useMonthlyCashflow, useCategoryTimeline, useCategoryBreakdown,
│   │                                 #   useFixedCostSummary, useMerchantSpend, useIncomeStability,
│   │                                 #   useRecurringPayments, useSpendingAnomalies, useCategoryMoM
│   └── useUpload.ts                  # useUploadFile, useUploadLogs, useResetData
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx             # 전체 레이아웃 (sidebar + topbar + main)
│   │   ├── AppSidebar.tsx            # 56px 아이콘 사이드바
│   │   ├── MobileDrawer.tsx          # 모바일 drawer + overlay
│   │   └── AppTopbar.tsx             # breadcrumb + 페이지 제목 + meta slot
│   ├── ui/
│   │   ├── KpiCard.tsx               # label + value + sub-text 카드
│   │   ├── SectionCard.tsx           # 카드 wrapper (header + children)
│   │   ├── Pagination.tsx            # 페이지 탐색 컨트롤
│   │   ├── EmptyState.tsx            # 빈 상태 placeholder
│   │   ├── LoadingState.tsx          # 스켈레톤/스피너
│   │   ├── ErrorState.tsx            # 에러 메시지 + 재시도
│   │   ├── StatusBadge.tsx           # 원본/수정됨/삭제됨
│   │   ├── NecessityBadge.tsx        # 필수/비필수/해당없음
│   │   ├── SegmentedBar.tsx          # 고정비/변동비 비율 바
│   │   ├── AlertBanner.tsx           # 액션 피드백 배너 (성공/실패/경고)
│   │   └── RangeSlider.tsx           # 월 범위 슬라이더
│   └── charts/
│       ├── DualBarChart.tsx          # 수입/지출 듀얼 바 (개요 현금흐름)
│       ├── StackedBarChart.tsx       # 월별 카테고리 stacked bar
│       ├── LineAreaChart.tsx         # 순자산 추이 line + area
│       ├── HorizontalBarList.tsx     # 카테고리/소분류 수평 바 리스트
│       └── MoMBarList.tsx            # 전월 대비 좌우 증감 바
├── pages/
│   ├── OverviewPage.tsx
│   ├── SpendingPage.tsx
│   ├── AssetsPage.tsx
│   ├── InsightsPage.tsx
│   └── WorkbenchPage.tsx
└── test/
    ├── setup.ts                      # vitest setup (jest-dom)
    ├── lib/utils.test.ts
    ├── components/layout/AppSidebar.test.tsx
    ├── components/ui/KpiCard.test.tsx
    ├── components/ui/Pagination.test.tsx
    ├── hooks/useWriteAccess.test.ts
    └── pages/OverviewPage.test.tsx
```

---

## Task 1: 브랜치 생성 + Tailwind 토큰 + 프로젝트 초기화

**Files:**
- Create: `frontend/src/index.css`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/lib/queryClient.ts`
- Create: `frontend/src/lib/apiClient.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: 브랜치 생성**

```bash
cd /home/gyurin/projects/my_ledge
git checkout -b feat/frontend-v2
```

Expected: `Switched to a new branch 'feat/frontend-v2'`

- [ ] **Step 2: 기존 `frontend/src/` 내용 제거 후 새 구조 생성**

```bash
cd frontend
# 기존 src 백업 후 초기화
rm -rf src
mkdir -p src/{lib,types,api,hooks,components/{layout,ui,charts},pages,test/{lib,components/{layout,ui},hooks,pages}}
```

- [ ] **Step 3: Tailwind 커스텀 토큰 설정**

`frontend/tailwind.config.js`를 아래로 교체:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          base:  '#060810',
          panel: '#0b0f1a',
          card:  '#0f1623',
          bar:   '#080b12',
        },
        border: {
          DEFAULT: '#1a2035',
          subtle:  '#111827',
          strong:  '#1f2937',
        },
        accent: {
          DEFAULT: '#10b981',
          dim:     '#0d2b1e',
          muted:   '#1a3b2e',
          bright:  '#6ee7b7',
        },
        danger: {
          DEFAULT: '#f87171',
          dim:     '#2d1a1a',
          muted:   '#3b2020',
        },
        warn: {
          DEFAULT: '#f59e0b',
          dim:     '#2a1f0a',
          muted:   '#3b2d10',
        },
        text: {
          primary:   '#d1d5db',
          secondary: '#9ca3af',
          muted:     '#6b7280',
          faint:     '#4b5563',
          ghost:     '#374151',
        },
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 4: CSS 기반 변수 + Tailwind directives**

`frontend/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  *, *::before, *::after { box-sizing: border-box; }
  html { font-size: 14px; }
  body {
    background-color: #060810;
    color: #d1d5db;
    font-family: -apple-system, 'Pretendard', 'Segoe UI', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  input, select, textarea, button { font-family: inherit; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #0b0f1a; }
  ::-webkit-scrollbar-thumb { background: #1a2035; border-radius: 3px; }
}

@layer utilities {
  .scrollbar-thin { scrollbar-width: thin; scrollbar-color: #1a2035 #0b0f1a; }
  .text-balance { text-wrap: balance; }
}
```

- [ ] **Step 5: 유틸리티 함수 작성**

`frontend/src/lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatKRW(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.abs(amount))
}

export function formatKRWCompact(amount: number): string {
  const abs = Math.abs(amount)
  if (abs >= 100_000_000) return `${(abs / 100_000_000).toFixed(1)}억`
  if (abs >= 10_000) return `${Math.round(abs / 10_000)}만`
  return formatKRW(abs)
}

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—'
  return `${value.toFixed(decimals)}%`
}

export function formatDate(dateStr: string): string {
  return dateStr.slice(5).replace('-', '.')
}

export function formatYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function monthRange(start: string, end: string): string[] {
  const result: string[] = []
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    if (m === 12) { y++; m = 1 } else { m++ }
  }
  return result
}
```

- [ ] **Step 6: utils 단위 테스트 작성 후 실행**

`frontend/src/test/lib/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatKRW, formatKRWCompact, formatPct, formatDate, monthRange } from '../../lib/utils'

describe('formatKRW', () => {
  it('formats positive numbers with comma', () => {
    expect(formatKRW(1234567)).toBe('1,234,567')
  })
  it('formats negative numbers without sign', () => {
    expect(formatKRW(-6500)).toBe('6,500')
  })
})

describe('formatKRWCompact', () => {
  it('formats numbers >= 10000 as 만', () => {
    expect(formatKRWCompact(42500000)).toBe('4250만')
  })
  it('formats numbers >= 100M as 억', () => {
    expect(formatKRWCompact(150000000)).toBe('1.5억')
  })
})

describe('formatPct', () => {
  it('formats number as percentage', () => {
    expect(formatPct(61.6)).toBe('61.6%')
  })
  it('returns dash for null', () => {
    expect(formatPct(null)).toBe('—')
  })
})

describe('monthRange', () => {
  it('returns months between start and end inclusive', () => {
    expect(monthRange('2026-01', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03'])
  })
  it('returns single month when start equals end', () => {
    expect(monthRange('2026-03', '2026-03')).toEqual(['2026-03'])
  })
})
```

```bash
cd frontend && npx vitest run src/test/lib/utils.test.ts
```

Expected: `4 tests passed`

- [ ] **Step 7: TanStack Query 클라이언트 + API 클라이언트**

`frontend/src/lib/queryClient.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,       // 2분
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

`frontend/src/lib/apiClient.ts`:

```typescript
const API_BASE = '/api/v1'

function getApiKey(): string | undefined {
  // runtime-config.js (nginx inject) or build-time env
  return (window as unknown as { __RUNTIME_CONFIG__?: { API_KEY?: string } })
    .__RUNTIME_CONFIG__?.API_KEY ?? import.meta.env.VITE_API_KEY
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = getApiKey()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (apiKey) headers['X-API-Key'] = apiKey

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function hasWriteAccess(): boolean {
  const key = (window as unknown as { __RUNTIME_CONFIG__?: { API_KEY?: string } })
    .__RUNTIME_CONFIG__?.API_KEY ?? import.meta.env.VITE_API_KEY
  return !!key && key.length > 0
}
```

- [ ] **Step 8: vitest 설정 파일**

`frontend/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

`frontend/vite.config.ts`에 test 설정 추가:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
```

- [ ] **Step 9: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 브랜치 초기화: Tailwind 토큰, utils, API 클라이언트"
```

---

## Task 2: TypeScript 타입 + API 함수

**Files:**
- Create: `frontend/src/types/transaction.ts`
- Create: `frontend/src/types/asset.ts`
- Create: `frontend/src/types/analytics.ts`
- Create: `frontend/src/types/upload.ts`
- Create: `frontend/src/api/transactions.ts`
- Create: `frontend/src/api/assets.ts`
- Create: `frontend/src/api/analytics.ts`
- Create: `frontend/src/api/upload.ts`

- [ ] **Step 1: 거래 타입 정의**

`frontend/src/types/transaction.ts`:

```typescript
export interface TransactionResponse {
  id: number
  date: string         // "YYYY-MM-DD"
  time: string         // "HH:MM:SS"
  type: string
  category_major: string
  category_minor: string | null
  category_major_user: string | null
  category_minor_user: string | null
  effective_category_major: string
  effective_category_minor: string | null
  description: string
  merchant: string
  amount: number
  currency: string
  payment_method: string | null
  cost_kind: 'fixed' | 'variable' | null
  fixed_cost_necessity: 'essential' | 'discretionary' | null
  memo: string | null
  is_deleted: boolean
  merged_into_id: number | null
  is_edited: boolean
  source: string
  created_at: string
  updated_at: string
}

export interface TransactionListResponse {
  total: number
  page: number
  per_page: number
  items: TransactionResponse[]
}

export interface TransactionFilterOptionsResponse {
  category_options: string[]
  payment_method_options: string[]
}

export interface TransactionListParams {
  page?: number
  per_page?: number
  type?: string
  source?: string
  category_major?: string
  payment_method?: string
  start_date?: string
  end_date?: string
  include_deleted?: boolean
  is_edited?: boolean
  search?: string
  start_month?: string
  end_month?: string
  include_income?: boolean
}

export interface TransactionUpdateRequest {
  merchant?: string | null
  category_major_user?: string | null
  category_minor_user?: string | null
  cost_kind?: 'fixed' | 'variable' | null
  fixed_cost_necessity?: 'essential' | 'discretionary' | null
  memo?: string | null
}

export interface TransactionBulkUpdateRequest {
  ids: number[]
  merchant?: string | null
  category_major_user?: string | null
  category_minor_user?: string | null
  cost_kind?: 'fixed' | 'variable' | null
  fixed_cost_necessity?: 'essential' | 'discretionary' | null
  memo?: string | null
}

export interface CategoryTimelineItem {
  period: string
  category: string
  amount: number
}

export interface CategoryBreakdownItem {
  category: string
  amount: number
}

export interface MonthlySummaryItem {
  period: string
  amount: number
}
```

- [ ] **Step 2: 자산/애널리틱스/업로드 타입 정의**

`frontend/src/types/asset.ts`:

```typescript
export interface AssetSnapshotTotals {
  snapshot_date: string
  asset_total: string    // Decimal as string
  liability_total: string
  net_worth: string
}

export interface NetWorthPoint {
  snapshot_date: string
  net_worth: string
}

export interface NetWorthHistoryResponse {
  items: NetWorthPoint[]
}

export interface InvestmentItem {
  product_type: string | null
  broker: string
  product_name: string
  cost_basis: string | null
  market_value: string | null
  return_rate: string | null
}

export interface InvestmentSummaryResponse {
  snapshot_date: string | null
  items: InvestmentItem[]
  totals: { cost_basis: string; market_value: string }
}

export interface LoanItem {
  loan_type: string | null
  lender: string
  product_name: string
  principal: string | null
  balance: string | null
  interest_rate: string | null
  start_date: string | null
  maturity_date: string | null
}

export interface LoanSummaryResponse {
  snapshot_date: string | null
  items: LoanItem[]
  totals: { principal: string; balance: string }
}
```

`frontend/src/types/analytics.ts`:

```typescript
export interface MonthlyCashflowItem {
  period: string
  income: number
  expense: number
  transfer: number
  net_cashflow: number
  savings_rate: number | null
}

export interface MonthlyCashflowResponse {
  items: MonthlyCashflowItem[]
}

export interface CategoryMoMItem {
  period: string
  previous_period: string
  category: string
  current_amount: number
  previous_amount: number
  delta_amount: number
  delta_pct: number | null
}

export interface CategoryMoMResponse {
  items: CategoryMoMItem[]
}

export interface FixedCostSummaryResponse {
  expense_total: number
  fixed_total: number
  variable_total: number
  fixed_ratio: number | null
  essential_fixed_total: number
  discretionary_fixed_total: number
  unclassified_total: number
  unclassified_count: number
}

export interface MerchantSpendItem {
  merchant: string
  amount: number
  count: number
  avg_amount: number
  last_seen_at: string
}

export interface MerchantSpendResponse {
  items: MerchantSpendItem[]
}

export interface IncomeStabilityResponse {
  items: Array<{ period: string; income: number }>
  avg: number
  stdev: number | null
  coefficient_of_variation: number | null
  assumptions: string
}

export interface RecurringPaymentItem {
  merchant: string
  category: string
  avg_amount: number
  interval_type: string
  avg_interval_days: number
  occurrences: number
  confidence: number
  last_date: string
}

export interface RecurringPaymentsResponse {
  total: number
  page: number
  per_page: number
  items: RecurringPaymentItem[]
  assumptions: string
}

export interface SpendingAnomalyItem {
  period: string
  category: string
  amount: number
  baseline_avg: number
  delta_pct: number | null
  anomaly_score: number
  reason: string
}

export interface SpendingAnomaliesResponse {
  total: number
  page: number
  per_page: number
  items: SpendingAnomalyItem[]
  assumptions: string
}
```

`frontend/src/types/upload.ts`:

```typescript
export interface UploadResponse {
  status: string
  upload_id: number
  transactions: { total: number; new: number; skipped: number }
  snapshots: { asset_snapshots: number; investments: number; loans: number }
  error_message: string | null
}

export interface UploadLogResponse {
  id: number
  uploaded_at: string
  filename: string | null
  snapshot_date: string | null
  tx_total: number | null
  tx_new: number | null
  tx_skipped: number | null
  status: string | null
  error_message: string | null
}

export interface UploadLogListResponse {
  items: UploadLogResponse[]
}

export type DataResetScope = 'transactions_only' | 'transactions_and_snapshots'

export interface DataResetResponse {
  scope: DataResetScope
  deleted: { transactions: number; asset_snapshots: number; investments: number; loans: number }
  upload_logs_retained: boolean
}
```

- [ ] **Step 3: 거래 API 함수**

`frontend/src/api/transactions.ts`:

```typescript
import { apiFetch } from '../lib/apiClient'
import type {
  TransactionListResponse,
  TransactionListParams,
  TransactionFilterOptionsResponse,
  TransactionUpdateRequest,
  TransactionBulkUpdateRequest,
  CategoryTimelineItem,
  CategoryBreakdownItem,
} from '../types/transaction'

function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const transactionApi = {
  list: (params: TransactionListParams = {}) =>
    apiFetch<TransactionListResponse>(`/transactions${buildQuery(params as Record<string, unknown>)}`),

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
    apiFetch<{ items: CategoryTimelineItem[] }>(`/transactions/category-timeline${buildQuery(params)}`),

  categoryBreakdown: (params: { start_month?: string; end_month?: string; include_income?: boolean } = {}) =>
    apiFetch<{ items: CategoryBreakdownItem[] }>(`/transactions/by-category${buildQuery(params as Record<string, unknown>)}`),

  dailySpend: (params: { month: string; include_income?: boolean }) =>
    apiFetch<{ items: Array<{ date: string; amount: number }> }>(`/transactions/daily-spend${buildQuery(params as Record<string, unknown>)}`),
}
```

- [ ] **Step 4: 자산/애널리틱스/업로드 API 함수**

`frontend/src/api/assets.ts`:

```typescript
import { apiFetch } from '../lib/apiClient'
import type { NetWorthHistoryResponse, InvestmentSummaryResponse, LoanSummaryResponse, AssetSnapshotTotals } from '../types/asset'

export const assetApi = {
  snapshots: () => apiFetch<{ items: AssetSnapshotTotals[] }>('/assets/snapshots'),
  netWorthHistory: () => apiFetch<NetWorthHistoryResponse>('/assets/net-worth-history'),
  investments: () => apiFetch<InvestmentSummaryResponse>('/investments/summary'),
  loans: () => apiFetch<LoanSummaryResponse>('/loans/summary'),
}
```

`frontend/src/api/analytics.ts`:

```typescript
import { apiFetch } from '../lib/apiClient'
import type {
  MonthlyCashflowResponse, CategoryMoMResponse, FixedCostSummaryResponse,
  MerchantSpendResponse, IncomeStabilityResponse, RecurringPaymentsResponse,
  SpendingAnomaliesResponse,
} from '../types/analytics'

function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const analyticsApi = {
  monthlyCashflow: (params: { months?: number } = {}) =>
    apiFetch<MonthlyCashflowResponse>(`/analytics/monthly-cashflow${buildQuery(params)}`),

  categoryMoM: (params: { months?: number } = {}) =>
    apiFetch<CategoryMoMResponse>(`/analytics/category-mom${buildQuery(params)}`),

  fixedCostSummary: (params: { start_month?: string; end_month?: string } = {}) =>
    apiFetch<FixedCostSummaryResponse>(`/analytics/fixed-cost-summary${buildQuery(params)}`),

  merchantSpend: (params: { months?: number; limit?: number } = {}) =>
    apiFetch<MerchantSpendResponse>(`/analytics/merchant-spend${buildQuery(params)}`),

  incomeStability: () =>
    apiFetch<IncomeStabilityResponse>('/analytics/income-stability'),

  recurringPayments: (params: { page?: number; per_page?: number } = {}) =>
    apiFetch<RecurringPaymentsResponse>(`/analytics/recurring-payments${buildQuery(params)}`),

  spendingAnomalies: (params: { page?: number; per_page?: number } = {}) =>
    apiFetch<SpendingAnomaliesResponse>(`/analytics/spending-anomalies${buildQuery(params)}`),
}
```

`frontend/src/api/upload.ts`:

```typescript
import { apiFetch } from '../lib/apiClient'
import type { UploadResponse, UploadLogListResponse, DataResetScope, DataResetResponse } from '../types/upload'

export const uploadApi = {
  upload: (file: File, snapshotDate: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('snapshot_date', snapshotDate)
    return apiFetch<UploadResponse>('/upload', { method: 'POST', body: form })
  },

  logs: (limit = 10) =>
    apiFetch<UploadLogListResponse>(`/upload/logs?limit=${limit}`),

  reset: (scope: DataResetScope) =>
    apiFetch<DataResetResponse>('/data/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope }),
    }),
}
```

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 타입 정의 + API 함수 레이어"
```

---

## Task 3: React Query 훅 + useWriteAccess

**Files:**
- Create: `frontend/src/hooks/useWriteAccess.ts`
- Create: `frontend/src/hooks/useTransactions.ts`
- Create: `frontend/src/hooks/useAssets.ts`
- Create: `frontend/src/hooks/useAnalytics.ts`
- Create: `frontend/src/hooks/useUpload.ts`
- Create: `frontend/src/test/hooks/useWriteAccess.test.ts`

- [ ] **Step 1: 테스트 먼저 — useWriteAccess**

`frontend/src/test/hooks/useWriteAccess.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWriteAccess } from '../../hooks/useWriteAccess'

describe('useWriteAccess', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_KEY', '')
  })

  it('returns false when no API key', () => {
    const { result } = renderHook(() => useWriteAccess())
    expect(result.current).toBe(false)
  })

  it('returns true when VITE_API_KEY is set', () => {
    vi.stubEnv('VITE_API_KEY', 'test-key')
    const { result } = renderHook(() => useWriteAccess())
    expect(result.current).toBe(true)
  })
})
```

```bash
cd frontend && npx vitest run src/test/hooks/useWriteAccess.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 2: useWriteAccess 구현**

`frontend/src/hooks/useWriteAccess.ts`:

```typescript
import { hasWriteAccess } from '../lib/apiClient'

export function useWriteAccess(): boolean {
  return hasWriteAccess()
}
```

```bash
npx vitest run src/test/hooks/useWriteAccess.test.ts
```

Expected: `2 tests passed`

- [ ] **Step 3: 거래 훅**

`frontend/src/hooks/useTransactions.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionApi } from '../api/transactions'
import type { TransactionListParams, TransactionUpdateRequest, TransactionBulkUpdateRequest } from '../types/transaction'

export const txKeys = {
  list: (params: TransactionListParams) => ['transactions', 'list', params] as const,
  filterOptions: () => ['transactions', 'filterOptions'] as const,
  categoryTimeline: (params: object) => ['transactions', 'categoryTimeline', params] as const,
  categoryBreakdown: (params: object) => ['transactions', 'categoryBreakdown', params] as const,
  dailySpend: (params: object) => ['transactions', 'dailySpend', params] as const,
}

export function useTransactionList(params: TransactionListParams = {}) {
  return useQuery({
    queryKey: txKeys.list(params),
    queryFn: () => transactionApi.list(params),
  })
}

export function useTransactionFilterOptions() {
  return useQuery({
    queryKey: txKeys.filterOptions(),
    queryFn: transactionApi.filterOptions,
    staleTime: Infinity,
  })
}

export function useCategoryTimeline(params: { start_month?: string; end_month?: string } = {}) {
  return useQuery({
    queryKey: txKeys.categoryTimeline(params),
    queryFn: () => transactionApi.categoryTimeline(params),
  })
}

export function useCategoryBreakdown(params: { start_month?: string; end_month?: string; include_income?: boolean } = {}) {
  return useQuery({
    queryKey: txKeys.categoryBreakdown(params),
    queryFn: () => transactionApi.categoryBreakdown(params),
  })
}

export function useDailySpend(params: { month: string; include_income?: boolean } | null) {
  return useQuery({
    queryKey: txKeys.dailySpend(params ?? {}),
    queryFn: () => transactionApi.dailySpend(params!),
    enabled: !!params,
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TransactionUpdateRequest }) =>
      transactionApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => transactionApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useRestoreTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => transactionApi.restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useBulkUpdateTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TransactionBulkUpdateRequest) => transactionApi.bulkUpdate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}
```

- [ ] **Step 4: 자산/애널리틱스/업로드 훅**

`frontend/src/hooks/useAssets.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { assetApi } from '../api/assets'

export function useAssetSnapshots() {
  return useQuery({ queryKey: ['assets', 'snapshots'], queryFn: assetApi.snapshots })
}

export function useNetWorthHistory() {
  return useQuery({ queryKey: ['assets', 'netWorthHistory'], queryFn: assetApi.netWorthHistory })
}

export function useInvestmentSummary() {
  return useQuery({ queryKey: ['assets', 'investments'], queryFn: assetApi.investments })
}

export function useLoanSummary() {
  return useQuery({ queryKey: ['assets', 'loans'], queryFn: assetApi.loans })
}
```

`frontend/src/hooks/useAnalytics.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics'

export function useMonthlyCashflow(months = 6) {
  return useQuery({
    queryKey: ['analytics', 'cashflow', months],
    queryFn: () => analyticsApi.monthlyCashflow({ months }),
  })
}

export function useCategoryMoM(months = 2) {
  return useQuery({
    queryKey: ['analytics', 'categoryMoM', months],
    queryFn: () => analyticsApi.categoryMoM({ months }),
  })
}

export function useFixedCostSummary(params: { start_month?: string; end_month?: string } = {}) {
  return useQuery({
    queryKey: ['analytics', 'fixedCost', params],
    queryFn: () => analyticsApi.fixedCostSummary(params),
  })
}

export function useMerchantSpend(params: { months?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['analytics', 'merchantSpend', params],
    queryFn: () => analyticsApi.merchantSpend(params),
  })
}

export function useIncomeStability() {
  return useQuery({
    queryKey: ['analytics', 'incomeStability'],
    queryFn: analyticsApi.incomeStability,
  })
}

export function useRecurringPayments(page = 1, perPage = 10) {
  return useQuery({
    queryKey: ['analytics', 'recurringPayments', page, perPage],
    queryFn: () => analyticsApi.recurringPayments({ page, per_page: perPage }),
  })
}

export function useSpendingAnomalies(page = 1, perPage = 10) {
  return useQuery({
    queryKey: ['analytics', 'spendingAnomalies', page, perPage],
    queryFn: () => analyticsApi.spendingAnomalies({ page, per_page: perPage }),
  })
}
```

`frontend/src/hooks/useUpload.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadApi } from '../api/upload'
import type { DataResetScope } from '../types/upload'

export function useUploadLogs(limit = 10) {
  return useQuery({
    queryKey: ['upload', 'logs', limit],
    queryFn: () => uploadApi.logs(limit),
  })
}

export function useUploadFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, snapshotDate }: { file: File; snapshotDate: string }) =>
      uploadApi.upload(file, snapshotDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upload'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}

export function useResetData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scope: DataResetScope) => uploadApi.reset(scope),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['assets'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
    },
  })
}
```

- [ ] **Step 5: TypeScript 타입체크**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 React Query 훅 레이어"
```

---

## Task 4: 공통 UI 컴포넌트

**Files:**
- Create: `frontend/src/components/ui/KpiCard.tsx`
- Create: `frontend/src/components/ui/SectionCard.tsx`
- Create: `frontend/src/components/ui/Pagination.tsx`
- Create: `frontend/src/components/ui/EmptyState.tsx`
- Create: `frontend/src/components/ui/LoadingState.tsx`
- Create: `frontend/src/components/ui/ErrorState.tsx`
- Create: `frontend/src/components/ui/StatusBadge.tsx`
- Create: `frontend/src/components/ui/NecessityBadge.tsx`
- Create: `frontend/src/components/ui/SegmentedBar.tsx`
- Create: `frontend/src/components/ui/AlertBanner.tsx`
- Create: `frontend/src/test/components/ui/KpiCard.test.tsx`
- Create: `frontend/src/test/components/ui/Pagination.test.tsx`

- [ ] **Step 1: KpiCard 테스트 작성**

`frontend/src/test/components/ui/KpiCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiCard } from '../../../components/ui/KpiCard'

describe('KpiCard', () => {
  it('renders label and value', () => {
    render(<KpiCard label="순자산" value="₩42,500,000" />)
    expect(screen.getByText('순자산')).toBeInTheDocument()
    expect(screen.getByText('₩42,500,000')).toBeInTheDocument()
  })

  it('renders sub text when provided', () => {
    render(<KpiCard label="저축률" value="61.6%" sub="목표 초과" />)
    expect(screen.getByText('목표 초과')).toBeInTheDocument()
  })

  it('does not render sub when not provided', () => {
    const { container } = render(<KpiCard label="label" value="value" />)
    expect(container.querySelector('[data-testid="kpi-sub"]')).toBeNull()
  })
})
```

```bash
cd frontend && npx vitest run src/test/components/ui/KpiCard.test.tsx
```

Expected: FAIL

- [ ] **Step 2: KpiCard 구현**

`frontend/src/components/ui/KpiCard.tsx`:

```tsx
import { cn } from '../../lib/utils'

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  subVariant?: 'up' | 'down' | 'neutral'
  className?: string
}

export function KpiCard({ label, value, sub, subVariant = 'neutral', className }: KpiCardProps) {
  const subColor = {
    up: 'text-accent',
    down: 'text-danger',
    neutral: 'text-text-ghost',
  }[subVariant]

  return (
    <div className={cn('bg-surface-card border border-border rounded-card px-4 py-3.5', className)}>
      <div className="text-[10px] text-text-faint tracking-wide mb-2">{label}</div>
      <div className="text-[18px] font-bold leading-tight tracking-tight mb-1">{value}</div>
      {sub && (
        <div data-testid="kpi-sub" className={cn('text-[10px]', subColor)}>
          {sub}
        </div>
      )}
    </div>
  )
}
```

```bash
npx vitest run src/test/components/ui/KpiCard.test.tsx
```

Expected: `3 tests passed`

- [ ] **Step 3: Pagination 테스트 + 구현**

`frontend/src/test/components/ui/Pagination.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Pagination } from '../../../components/ui/Pagination'

describe('Pagination', () => {
  it('shows current page info', () => {
    render(<Pagination page={1} perPage={20} total={347} onPageChange={vi.fn()} />)
    expect(screen.getByText(/1–20 \/ 347건/)).toBeInTheDocument()
  })

  it('calls onPageChange when next button clicked', () => {
    const onChange = vi.fn()
    render(<Pagination page={1} perPage={20} total={347} onPageChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '›' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('disables prev on first page', () => {
    render(<Pagination page={1} perPage={20} total={40} onPageChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '‹' })).toBeDisabled()
  })
})
```

`frontend/src/components/ui/Pagination.tsx`:

```tsx
import { cn } from '../../lib/utils'

interface PaginationProps {
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({ page, perPage, total, onPageChange, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const start = Math.min((page - 1) * perPage + 1, total)
  const end = Math.min(page * perPage, total)

  const btnClass = (active = false, disabled = false) =>
    cn(
      'text-[9px] px-2 py-1 rounded border',
      active
        ? 'border-accent text-accent bg-accent-dim'
        : 'border-border-strong text-text-ghost bg-transparent',
      disabled && 'opacity-30 cursor-not-allowed pointer-events-none',
    )

  const pages = buildPages(page, totalPages)

  return (
    <div className={cn('flex items-center justify-between px-2.5 py-2.5 border-t border-border-subtle', className)}>
      <span className="text-[10px] text-text-faint">
        {start}–{end} / {total}건
      </span>
      <div className="flex gap-1 items-center">
        <button className={btnClass(false, page === 1)} onClick={() => onPageChange(page - 1)} aria-label="‹">‹</button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={i} className="text-[10px] text-text-ghost px-1">…</span>
          ) : (
            <button key={p} className={btnClass(p === page)} onClick={() => onPageChange(p as number)}>
              {p}
            </button>
          )
        )}
        <button className={btnClass(false, page === totalPages)} onClick={() => onPageChange(page + 1)} aria-label="›">›</button>
      </div>
    </div>
  )
}

function buildPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total]
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}
```

```bash
npx vitest run src/test/components/ui/Pagination.test.tsx
```

Expected: `3 tests passed`

- [ ] **Step 4: 나머지 UI 컴포넌트 구현**

`frontend/src/components/ui/SectionCard.tsx`:

```tsx
import { cn } from '../../lib/utils'

interface SectionCardProps {
  title: string
  badge?: string
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

export function SectionCard({ title, badge, children, className, bodyClassName }: SectionCardProps) {
  return (
    <div className={cn('bg-surface-card border border-border rounded-card', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="text-[11px] font-semibold text-text-secondary tracking-wide">{title}</span>
        {badge && (
          <span className="text-[9px] text-text-faint bg-surface-bar border border-border-strong px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </div>
  )
}
```

`frontend/src/components/ui/EmptyState.tsx`:

```tsx
import { cn } from '../../lib/utils'

interface EmptyStateProps {
  message?: string
  className?: string
}

export function EmptyState({ message = '데이터가 없습니다', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-10 gap-2', className)}>
      <div className="text-[24px] opacity-30">○</div>
      <p className="text-[11px] text-text-ghost">{message}</p>
    </div>
  )
}
```

`frontend/src/components/ui/LoadingState.tsx`:

```tsx
import { cn } from '../../lib/utils'

interface LoadingStateProps {
  className?: string
}

export function LoadingState({ className }: LoadingStateProps) {
  return (
    <div className={cn('flex items-center justify-center py-10', className)}>
      <div className="w-5 h-5 border-2 border-border-strong border-t-accent rounded-full animate-spin" />
    </div>
  )
}
```

`frontend/src/components/ui/ErrorState.tsx`:

```tsx
import { cn } from '../../lib/utils'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ message = '불러오는 중 오류가 발생했습니다', onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-10 gap-3', className)}>
      <p className="text-[11px] text-danger">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-[10px] px-3 py-1.5 border border-border-strong rounded-md text-text-ghost hover:text-text-secondary"
        >
          다시 시도
        </button>
      )}
    </div>
  )
}
```

`frontend/src/components/ui/StatusBadge.tsx`:

```tsx
import { cn } from '../../lib/utils'

type Status = 'original' | 'edited' | 'deleted'

const styles: Record<Status, string> = {
  original: 'bg-border-subtle text-text-ghost',
  edited:   'bg-accent-dim text-accent border border-accent-muted',
  deleted:  'bg-danger-dim text-danger border border-danger-muted',
}

const labels: Record<Status, string> = {
  original: '원본',
  edited:   '수정됨',
  deleted:  '삭제됨',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn('inline-block text-[8px] px-1.5 py-0.5 rounded', styles[status])}>
      {labels[status]}
    </span>
  )
}
```

`frontend/src/components/ui/NecessityBadge.tsx`:

```tsx
import { cn } from '../../lib/utils'

type Necessity = 'essential' | 'discretionary' | null

export function NecessityBadge({ value }: { value: Necessity }) {
  if (!value) return <span className="text-[9px] text-text-ghost">—</span>
  const isEssential = value === 'essential'
  return (
    <span className={cn(
      'inline-block text-[8px] px-1.5 py-0.5 rounded border',
      isEssential
        ? 'bg-[#062818] text-[#34d399] border-[#0d3b22]'
        : 'bg-warn-dim text-warn border-warn-muted',
    )}>
      {isEssential ? '필수' : '비필수'}
    </span>
  )
}
```

`frontend/src/components/ui/SegmentedBar.tsx`:

```tsx
interface Segment {
  label: string
  value: number      // 0–100
  color: string      // tailwind bg class or hex
}

interface SegmentedBarProps {
  segments: Segment[]
  height?: number
}

export function SegmentedBar({ segments, height = 20 }: SegmentedBarProps) {
  return (
    <div className="flex rounded overflow-hidden" style={{ height }}>
      {segments.map((seg) => (
        <div
          key={seg.label}
          className="flex items-center justify-center text-[9px] font-semibold text-white/80"
          style={{ width: `${seg.value}%`, background: seg.color }}
        >
          {seg.value >= 12 ? `${Math.round(seg.value)}%` : ''}
        </div>
      ))}
    </div>
  )
}
```

`frontend/src/components/ui/AlertBanner.tsx`:

```tsx
import { cn } from '../../lib/utils'

type AlertVariant = 'success' | 'error' | 'warn'

const styles: Record<AlertVariant, string> = {
  success: 'bg-accent-dim border border-accent-muted text-accent',
  error:   'bg-danger-dim border border-danger-muted text-danger',
  warn:    'bg-warn-dim border border-warn-muted text-warn',
}

interface AlertBannerProps {
  variant: AlertVariant
  title: string
  description?: string
  timestamp?: string
  onDismiss?: () => void
}

export function AlertBanner({ variant, title, description, timestamp, onDismiss }: AlertBannerProps) {
  return (
    <div className={cn('flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-[11px]', styles[variant])}>
      <span className="font-semibold shrink-0">{title}</span>
      {description && <span className="text-[10px] opacity-80">{description}</span>}
      {timestamp && <span className="text-[9px] opacity-50 ml-auto shrink-0">{timestamp}</span>}
      {onDismiss && (
        <button onClick={onDismiss} className="ml-2 opacity-50 hover:opacity-80 text-[12px]">✕</button>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 전체 테스트 실행**

```bash
cd frontend && npx vitest run src/test/components/
```

Expected: `6 tests passed`

- [ ] **Step 6: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 공통 UI 컴포넌트 (KpiCard, SectionCard, Pagination, 상태 컴포넌트, 배지)"
```

---

## Task 5: 앱 셸 (Layout, Sidebar, Topbar, Router)

**Files:**
- Create: `frontend/src/components/layout/AppSidebar.tsx`
- Create: `frontend/src/components/layout/MobileDrawer.tsx`
- Create: `frontend/src/components/layout/AppTopbar.tsx`
- Create: `frontend/src/components/layout/AppLayout.tsx`
- Create: `frontend/src/router.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/test/components/layout/AppSidebar.test.tsx`

- [ ] **Step 1: AppSidebar 테스트 작성**

`frontend/src/test/components/layout/AppSidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppSidebar } from '../../../components/layout/AppSidebar'

const wrap = (ui: React.ReactNode, path = '/') =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)

describe('AppSidebar', () => {
  it('renders all nav items', () => {
    wrap(<AppSidebar onMobileOpen={vi.fn()} />)
    expect(screen.getByTitle('개요')).toBeInTheDocument()
    expect(screen.getByTitle('지출 분석')).toBeInTheDocument()
    expect(screen.getByTitle('자산 현황')).toBeInTheDocument()
    expect(screen.getByTitle('인사이트')).toBeInTheDocument()
    expect(screen.getByTitle('거래 작업대')).toBeInTheDocument()
  })

  it('marks overview as active on root path', () => {
    wrap(<AppSidebar onMobileOpen={vi.fn()} />, '/')
    const link = screen.getByTitle('개요').closest('a')
    expect(link?.className).toContain('bg-accent-dim')
  })
})
```

```bash
npx vitest run src/test/components/layout/AppSidebar.test.tsx
```

Expected: FAIL

- [ ] **Step 2: AppSidebar 구현**

`frontend/src/components/layout/AppSidebar.tsx`:

```tsx
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  HomeIcon, ChartBarIcon, CurrencyDollarIcon,
  LightBulbIcon, CogIcon, Bars3Icon,
} from '@heroicons/react/24/outline'

const NAV_ITEMS = [
  { to: '/', label: '개요', Icon: HomeIcon, exact: true },
] as const

const ANALYSIS_ITEMS = [
  { to: '/analysis/spending', label: '지출 분석', Icon: ChartBarIcon },
  { to: '/analysis/assets', label: '자산 현황', Icon: CurrencyDollarIcon },
  { to: '/analysis/insights', label: '인사이트', Icon: LightBulbIcon },
] as const

const OPS_ITEMS = [
  { to: '/operations/workbench', label: '거래 작업대', Icon: CogIcon },
] as const

function NavBtn({ to, label, Icon, exact = false }: { to: string; label: string; Icon: React.ComponentType<{ className?: string }>; exact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact}
      title={label}
      className={({ isActive }) =>
        cn(
          'w-10 h-10 flex items-center justify-center rounded-lg mx-auto transition-colors',
          isActive
            ? 'bg-accent-dim text-accent'
            : 'text-text-ghost hover:bg-border-subtle hover:text-text-secondary',
        )
      }
    >
      <Icon className="w-[18px] h-[18px]" />
    </NavLink>
  )
}

interface AppSidebarProps {
  onMobileOpen: () => void
  className?: string
}

export function AppSidebar({ onMobileOpen, className }: AppSidebarProps) {
  return (
    <nav
      className={cn(
        'hidden md:flex flex-col items-center w-14 shrink-0 bg-surface-bar border-r border-border h-screen sticky top-0',
        className,
      )}
    >
      {/* Logo */}
      <div className="w-8 h-8 mt-4 mb-6 rounded-lg bg-gradient-to-br from-accent to-[#059669] flex items-center justify-center text-white font-extrabold text-sm shrink-0">
        M
      </div>

      <div className="flex flex-col gap-0.5 w-full px-1">
        {NAV_ITEMS.map((item) => <NavBtn key={item.to} {...item} />)}
      </div>

      <div className="w-6 h-px bg-border my-2" />

      <div className="flex flex-col gap-0.5 w-full px-1">
        {ANALYSIS_ITEMS.map((item) => <NavBtn key={item.to} {...item} />)}
      </div>

      <div className="w-6 h-px bg-border my-2" />

      <div className="flex flex-col gap-0.5 w-full px-1">
        {OPS_ITEMS.map((item) => <NavBtn key={item.to} {...item} />)}
      </div>
    </nav>
  )
}
```

> **Note:** `@heroicons/react` 패키지 설치 필요:
> ```bash
> cd frontend && npm install @heroicons/react
> ```

```bash
npx vitest run src/test/components/layout/AppSidebar.test.tsx
```

Expected: `2 tests passed`

- [ ] **Step 3: MobileDrawer 구현**

`frontend/src/components/layout/MobileDrawer.tsx`:

```tsx
import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  HomeIcon, ChartBarIcon, CurrencyDollarIcon,
  LightBulbIcon, CogIcon, XMarkIcon,
} from '@heroicons/react/24/outline'

const ALL_ITEMS = [
  { to: '/', label: '개요', Icon: HomeIcon, exact: true, section: null },
  { to: '/analysis/spending', label: '지출 분석', Icon: ChartBarIcon, exact: false, section: '분석' },
  { to: '/analysis/assets', label: '자산 현황', Icon: CurrencyDollarIcon, exact: false, section: null },
  { to: '/analysis/insights', label: '인사이트', Icon: LightBulbIcon, exact: false, section: null },
  { to: '/operations/workbench', label: '거래 작업대', Icon: CogIcon, exact: false, section: '운영' },
]

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const location = useLocation()
  useEffect(() => { onClose() }, [location.pathname])  // 페이지 이동 시 닫기

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-56 bg-surface-bar border-r border-border z-50 flex flex-col md:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-[#059669] flex items-center justify-center text-white font-extrabold text-xs">M</div>
            <span className="text-[13px] font-semibold text-text-primary">MyLedge</span>
          </div>
          <button onClick={onClose} className="text-text-ghost hover:text-text-secondary">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {ALL_ITEMS.map((item) => (
            <div key={item.to}>
              {item.section && (
                <div className="text-[9px] text-text-ghost uppercase tracking-widest px-2 py-1 mt-2">
                  {item.section}
                </div>
              )}
              <NavLink
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[11px] font-medium transition-colors',
                    isActive
                      ? 'bg-accent-dim text-accent'
                      : 'text-text-ghost hover:bg-border-subtle hover:text-text-secondary',
                  )
                }
              >
                <item.Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </NavLink>
            </div>
          ))}
        </nav>
      </div>
    </>
  )
}
```

- [ ] **Step 4: AppTopbar + AppLayout**

`frontend/src/components/layout/AppTopbar.tsx`:

```tsx
import { useLocation } from 'react-router-dom'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'

const PAGE_META: Record<string, { breadcrumb: string; title: string }> = {
  '/': { breadcrumb: 'MyLedge', title: '개요' },
  '/analysis/spending': { breadcrumb: '분석', title: '지출 분석' },
  '/analysis/assets': { breadcrumb: '분석', title: '자산 현황' },
  '/analysis/insights': { breadcrumb: '분석', title: '인사이트' },
  '/operations/workbench': { breadcrumb: '운영', title: '거래 작업대' },
}

interface AppTopbarProps {
  onMobileMenuOpen: () => void
  metaBadge?: React.ReactNode
  className?: string
}

export function AppTopbar({ onMobileMenuOpen, metaBadge, className }: AppTopbarProps) {
  const { pathname } = useLocation()
  const meta = PAGE_META[pathname] ?? { breadcrumb: 'MyLedge', title: pathname }

  return (
    <header className={cn('h-12 bg-surface-bar border-b border-border flex items-center px-5 gap-2 sticky top-0 z-30', className)}>
      <button
        className="md:hidden text-text-ghost hover:text-text-secondary mr-1"
        onClick={onMobileMenuOpen}
        aria-label="메뉴 열기"
      >
        <Bars3Icon className="w-5 h-5" />
      </button>
      <span className="text-[11px] text-text-ghost hidden md:block">{meta.breadcrumb}</span>
      <span className="text-[11px] text-text-ghost hidden md:block">›</span>
      <span className="text-[13px] font-semibold text-text-primary">{meta.title}</span>
      {metaBadge && <div className="ml-auto">{metaBadge}</div>}
    </header>
  )
}
```

`frontend/src/components/layout/AppLayout.tsx`:

```tsx
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { MobileDrawer } from './MobileDrawer'
import { AppTopbar } from './AppTopbar'

interface AppLayoutProps {
  metaBadge?: React.ReactNode
}

export function AppLayout({ metaBadge }: AppLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen bg-surface-panel overflow-hidden">
      <AppSidebar onMobileOpen={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <AppTopbar onMobileMenuOpen={() => setDrawerOpen(true)} metaBadge={metaBadge} />
        <main className="flex-1 p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Router + App + main**

`frontend/src/router.tsx`:

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { OverviewPage } from './pages/OverviewPage'
import { SpendingPage } from './pages/SpendingPage'
import { AssetsPage } from './pages/AssetsPage'
import { InsightsPage } from './pages/InsightsPage'
import { WorkbenchPage } from './pages/WorkbenchPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'analysis/spending', element: <SpendingPage /> },
      { path: 'analysis/assets', element: <AssetsPage /> },
      { path: 'analysis/insights', element: <InsightsPage /> },
      { path: 'operations/workbench', element: <WorkbenchPage /> },
    ],
  },
  // Legacy redirects
  { path: '/spending', element: <Navigate to="/analysis/spending" replace /> },
  { path: '/assets', element: <Navigate to="/analysis/assets" replace /> },
  { path: '/data', element: <Navigate to="/operations/workbench" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
```

`frontend/src/App.tsx`:

```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import { router } from './router'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
```

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

> **Note:** 각 페이지 파일을 placeholder로 생성 (빈 컴포넌트):
> ```bash
> for page in Overview Spending Assets Insights Workbench; do
>   echo "export function ${page}Page() { return <div>${page}</div> }" > frontend/src/pages/${page}Page.tsx
> done
> ```

- [ ] **Step 6: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: `built in` 메시지 (오류 없음)

- [ ] **Step 7: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 앱 셸: Sidebar, Topbar, Layout, Router"
```

---

## Task 6: 차트 컴포넌트

**Files:**
- Create: `frontend/src/components/charts/DualBarChart.tsx`
- Create: `frontend/src/components/charts/StackedBarChart.tsx`
- Create: `frontend/src/components/charts/LineAreaChart.tsx`
- Create: `frontend/src/components/charts/HorizontalBarList.tsx`
- Create: `frontend/src/components/charts/MoMBarList.tsx`

- [ ] **Step 1: DualBarChart (개요 현금흐름)**

`frontend/src/components/charts/DualBarChart.tsx`:

```tsx
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { MonthlyCashflowItem } from '../../types/analytics'
import { formatKRWCompact } from '../../lib/utils'

interface DualBarChartProps {
  data: MonthlyCashflowItem[]
  height?: number
}

export function DualBarChart({ data, height = 110 }: DualBarChartProps) {
  const chartData = data.map((d) => ({
    period: d.period.slice(5),
    income: d.income,
    expense: Math.abs(d.expense),
    isCurrent: d === data[data.length - 1],
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} barGap={2} barCategoryGap="30%">
        <XAxis
          dataKey="period"
          tick={{ fill: '#374151', fontSize: 9 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: '#0f1623', border: '1px solid #1a2035', borderRadius: 6, fontSize: 10 }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(value: number, name: string) => [
            `₩ ${formatKRWCompact(value)}`,
            name === 'income' ? '수입' : '지출',
          ]}
        />
        <Bar dataKey="income" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.isCurrent ? '#10b981' : '#1f3b2e'} />
          ))}
        </Bar>
        <Bar dataKey="expense" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.isCurrent ? '#f87171' : '#2d1a1a'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: StackedBarChart (월별 카테고리 추이)**

`frontend/src/components/charts/StackedBarChart.tsx`:

```tsx
import { BarChart, Bar, XAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import type { CategoryTimelineItem } from '../../types/transaction'
import { formatKRWCompact } from '../../lib/utils'

const CATEGORY_COLORS: Record<string, string> = {
  식비: '#2563a8', 교통: '#059669', 구독: '#7c3aed',
  쇼핑: '#dc2626', 주거: '#d97706', 의료: '#0891b2',
  보험: '#7c3aed', 기타: '#374151',
}

function getColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? '#4b5563'
}

interface StackedBarChartProps {
  items: CategoryTimelineItem[]
  height?: number
}

export function StackedBarChart({ items, height = 160 }: StackedBarChartProps) {
  // Pivot: period → { category: amount }
  const periods = [...new Set(items.map((i) => i.period))].sort()
  const categories = [...new Set(items.map((i) => i.category))]

  const data = periods.map((period) => {
    const row: Record<string, unknown> = { period: period.slice(5) }
    for (const cat of categories) {
      const found = items.find((i) => i.period === period && i.category === cat)
      row[cat] = found ? Math.abs(found.amount) : 0
    }
    return row
  })

  const latestPeriod = periods[periods.length - 1]?.slice(5)

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barCategoryGap="20%">
          <XAxis
            dataKey="period"
            tick={({ x, y, payload }) => (
              <text x={x} y={y + 10} textAnchor="middle" fontSize={9}
                fill={payload.value === latestPeriod ? '#6ee7b7' : '#374151'}>
                {payload.value}
              </text>
            )}
            axisLine={false} tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#0f1623', border: '1px solid #1a2035', borderRadius: 6, fontSize: 10 }}
            formatter={(value: number, name: string) => [`₩ ${formatKRWCompact(value)}`, name]}
          />
          {categories.map((cat) => (
            <Bar key={cat} dataKey={cat} stackId="a" fill={getColor(cat)} radius={cat === categories[categories.length - 1] ? [2, 2, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-2.5 mt-2">
        {categories.map((cat) => (
          <span key={cat} className="flex items-center gap-1 text-[9px] text-text-muted">
            <span className="w-2 h-2 rounded-sm" style={{ background: getColor(cat) }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: LineAreaChart (순자산 추이)**

`frontend/src/components/charts/LineAreaChart.tsx`:

```tsx
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import type { NetWorthPoint } from '../../types/asset'
import { formatKRWCompact } from '../../lib/utils'

interface LineAreaChartProps {
  data: NetWorthPoint[]
  height?: number
}

export function LineAreaChart({ data, height = 130 }: LineAreaChartProps) {
  if (data.length <= 1) {
    return (
      <div className="flex items-center justify-center h-[130px] text-[11px] text-text-ghost">
        시계열 데이터가 부족합니다 (2개 이상 스냅샷 필요)
      </div>
    )
  }

  const chartData = data.map((d) => ({
    date: d.snapshot_date.slice(5),
    value: parseFloat(d.net_worth),
  }))

  const last = chartData[chartData.length - 1]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 16, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: '#374151', fontSize: 9 }}
          axisLine={false} tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: '#0f1623', border: '1px solid #1a2035', borderRadius: 6, fontSize: 10 }}
          formatter={(value: number) => [`₩ ${formatKRWCompact(value)}`, '순자산']}
        />
        <Area
          type="monotone" dataKey="value"
          stroke="#10b981" strokeWidth={2}
          fill="url(#nwGrad)"
          dot={{ fill: '#0f1623', stroke: '#10b981', strokeWidth: 1.5, r: 3 }}
          activeDot={{ r: 5, fill: '#10b981' }}
        />
        <ReferenceDot x={last.date} y={last.value} r={5} fill="#10b981" stroke="none" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 4: HorizontalBarList + MoMBarList**

`frontend/src/components/charts/HorizontalBarList.tsx`:

```tsx
import { formatKRW } from '../../lib/utils'

interface BarItem {
  label: string
  amount: number
  color?: string
}

interface HorizontalBarListProps {
  items: BarItem[]
  maxAmount?: number
}

export function HorizontalBarList({ items, maxAmount }: HorizontalBarListProps) {
  const max = maxAmount ?? Math.max(...items.map((i) => Math.abs(i.amount)), 1)
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-[10px] text-text-secondary w-14 shrink-0 truncate">{item.label}</span>
          <div className="flex-1 h-[5px] bg-border-subtle rounded overflow-hidden">
            <div
              className="h-full rounded"
              style={{
                width: `${(Math.abs(item.amount) / max) * 100}%`,
                background: item.color ?? '#10b981',
              }}
            />
          </div>
          <span className="text-[10px] text-text-muted w-20 text-right shrink-0">
            ₩ {formatKRW(item.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}
```

`frontend/src/components/charts/MoMBarList.tsx`:

```tsx
import { formatKRW } from '../../lib/utils'
import type { CategoryMoMItem } from '../../types/analytics'

interface MoMBarListProps {
  items: CategoryMoMItem[]
}

export function MoMBarList({ items }: MoMBarListProps) {
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.delta_amount)), 1)

  return (
    <div className="flex flex-col">
      <div className="text-center text-[9px] text-text-ghost mb-2">← 감소 &nbsp;|&nbsp; 증가 →</div>
      {items.map((item) => {
        const pct = (Math.abs(item.delta_amount) / maxAbs) * 48
        const isUp = item.delta_amount > 0
        return (
          <div key={`${item.category}-${item.period}`} className="flex items-center gap-2.5 py-2 border-b border-border-subtle last:border-0">
            <span className="text-[10px] text-text-secondary w-14 shrink-0 truncate">{item.category}</span>
            <div className="flex-1 h-[6px] bg-border-subtle rounded relative">
              <div
                className={`absolute h-full rounded ${isUp ? 'left-1/2' : 'right-1/2'}`}
                style={{
                  width: `${pct}%`,
                  background: isUp ? '#f87171' : '#10b981',
                }}
              />
            </div>
            <span className={`text-[10px] font-semibold w-16 text-right shrink-0 ${isUp ? 'text-danger' : 'text-accent'}`}>
              {isUp ? '+' : '-'}₩{formatKRW(item.delta_amount)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: TypeScript 확인**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 차트 컴포넌트 (DualBar, StackedBar, LineArea, HorizontalBarList, MoMBarList)"
```

---

## Task 7: 개요 페이지

**Files:**
- Modify: `frontend/src/pages/OverviewPage.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx` (metaBadge prop 라우팅)
- Create: `frontend/src/test/pages/OverviewPage.test.tsx`

- [ ] **Step 1: 테스트 작성**

`frontend/src/test/pages/OverviewPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { OverviewPage } from '../../pages/OverviewPage'

vi.mock('../../hooks/useAnalytics', () => ({
  useMonthlyCashflow: () => ({ data: undefined, isLoading: true, error: null }),
  useIncomeStability: () => ({ data: undefined, isLoading: true, error: null }),
  useRecurringPayments: () => ({ data: undefined, isLoading: true, error: null }),
  useSpendingAnomalies: () => ({ data: undefined, isLoading: true, error: null }),
  useMerchantSpend: () => ({ data: undefined, isLoading: true, error: null }),
  useCategoryMoM: () => ({ data: undefined, isLoading: true, error: null }),
}))

vi.mock('../../hooks/useAssets', () => ({
  useAssetSnapshots: () => ({ data: undefined, isLoading: true }),
}))

vi.mock('../../hooks/useTransactions', () => ({
  useTransactionList: () => ({ data: undefined, isLoading: true }),
  useCategoryBreakdown: () => ({ data: undefined, isLoading: true }),
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('OverviewPage', () => {
  it('renders KPI section titles', () => {
    wrap(<OverviewPage />)
    expect(screen.getByText('순자산')).toBeInTheDocument()
    expect(screen.getByText('이번 달 지출')).toBeInTheDocument()
    expect(screen.getByText('이번 달 수입')).toBeInTheDocument()
    expect(screen.getByText('저축률')).toBeInTheDocument()
  })

  it('renders section cards', () => {
    wrap(<OverviewPage />)
    expect(screen.getByText('월간 현금흐름')).toBeInTheDocument()
    expect(screen.getByText('주의 신호')).toBeInTheDocument()
    expect(screen.getByText('카테고리 Top 5')).toBeInTheDocument()
    expect(screen.getByText('최근 거래')).toBeInTheDocument()
  })
})
```

```bash
npx vitest run src/test/pages/OverviewPage.test.tsx
```

Expected: FAIL

- [ ] **Step 2: OverviewPage 구현**

`frontend/src/pages/OverviewPage.tsx`:

```tsx
import { KpiCard } from '../components/ui/KpiCard'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { DualBarChart } from '../components/charts/DualBarChart'
import { HorizontalBarList } from '../components/charts/HorizontalBarList'
import { useMonthlyCashflow, useIncomeStability, useRecurringPayments, useSpendingAnomalies } from '../hooks/useAnalytics'
import { useAssetSnapshots } from '../hooks/useAssets'
import { useTransactionList, useCategoryBreakdown } from '../hooks/useTransactions'
import { formatKRW, formatKRWCompact, formatPct, formatDate } from '../lib/utils'

export function OverviewPage() {
  const cashflow = useMonthlyCashflow(6)
  const snapshots = useAssetSnapshots()
  const incomeStability = useIncomeStability()
  const recurringPayments = useRecurringPayments(1, 1)
  const spendingAnomalies = useSpendingAnomalies(1, 1)
  const recentTx = useTransactionList({ page: 1, per_page: 5, type: 'all' })
  const categoryBreakdown = useCategoryBreakdown()

  // 최신 스냅샷 기준
  const latestSnapshot = snapshots.data?.items?.[snapshots.data.items.length - 1]
  const snapshotDate = latestSnapshot?.snapshot_date

  // 현재 월 cashflow 집계
  const currentMonth = cashflow.data?.items?.[cashflow.data.items.length - 1]
  const netWorth = latestSnapshot ? parseFloat(latestSnapshot.net_worth) : null
  const monthExpense = currentMonth?.expense ?? null
  const monthIncome = currentMonth?.income ?? null
  const savingsRate = currentMonth?.savings_rate ?? null

  // 주의 신호 집계
  const anomalyCount = spendingAnomalies.data?.total ?? null
  const recurringCount = recurringPayments.data?.total ?? null
  const incomeCV = incomeStability.data?.coefficient_of_variation ?? null
  const incomeLabel = incomeCV == null ? '—' : incomeCV < 0.1 ? '안정' : incomeCV < 0.25 ? '보통' : '불안정'

  return (
    <div className="flex flex-col gap-4">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="순자산"
          value={netWorth != null ? `₩ ${formatKRWCompact(netWorth)}` : '—'}
          sub={snapshotDate ? `기준일 ${formatDate(snapshotDate)}` : ''}
          className="border-t-2 border-t-accent"
        />
        <KpiCard
          label="이번 달 지출"
          value={monthExpense != null ? `₩ ${formatKRWCompact(Math.abs(monthExpense))}` : '—'}
          subVariant="down"
        />
        <KpiCard
          label="이번 달 수입"
          value={monthIncome != null ? `₩ ${formatKRWCompact(monthIncome)}` : '—'}
        />
        <KpiCard
          label="저축률"
          value={formatPct(savingsRate != null ? savingsRate * 100 : null)}
          subVariant={savingsRate != null && savingsRate > 0.3 ? 'up' : 'neutral'}
          sub={savingsRate != null && savingsRate > 0.5 ? '목표 50% 초과' : ''}
          className="border-t-2 border-t-accent"
        />
      </div>

      {/* 현금흐름 + 주의 신호 */}
      <div className="grid md:grid-cols-[2fr_1fr] gap-4">
        <SectionCard title="월간 현금흐름" badge="최근 6개월">
          {cashflow.isLoading ? <LoadingState /> :
           cashflow.error ? <ErrorState onRetry={() => cashflow.refetch()} /> :
           cashflow.data && cashflow.data.items.length > 0 ? (
             <>
               <DualBarChart data={cashflow.data.items} />
               <div className="flex gap-3 mt-2">
                 <span className="flex items-center gap-1 text-[9px] text-text-muted"><span className="w-2 h-2 rounded-sm bg-accent" />수입</span>
                 <span className="flex items-center gap-1 text-[9px] text-text-muted"><span className="w-2 h-2 rounded-sm bg-danger" />지출</span>
               </div>
             </>
           ) : <EmptyState message="현금흐름 데이터가 없습니다" />}
        </SectionCard>

        <SectionCard title="주의 신호">
          <div className="flex flex-col gap-2">
            {[
              { label: '이상 지출 카테고리', value: anomalyCount, warn: (anomalyCount ?? 0) > 0 },
              { label: '반복 결제 감지', value: recurringCount, warn: false },
              { label: '수입 안정성', value: incomeLabel, warn: false },
            ].map((signal) => (
              <div key={signal.label} className="flex items-center justify-between px-3 py-2.5 bg-surface-bar border border-border rounded-lg">
                <span className="text-[11px] text-text-secondary">{signal.label}</span>
                <span className={`text-[12px] font-semibold ${signal.warn ? 'text-warn' : 'text-accent'}`}>
                  {signal.value == null ? '—' : typeof signal.value === 'number' ? `${signal.value}건` : signal.value}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* 카테고리 Top 5 + 최근 거래 */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="카테고리 Top 5" badge="이번 달">
          {categoryBreakdown.isLoading ? <LoadingState /> :
           categoryBreakdown.data && categoryBreakdown.data.items.length > 0 ? (
             <HorizontalBarList
               items={categoryBreakdown.data.items.slice(0, 5).map((i) => ({
                 label: i.category,
                 amount: i.amount,
               }))}
             />
           ) : <EmptyState message="카테고리 데이터가 없습니다" />}
        </SectionCard>

        <SectionCard title="최근 거래" badge="read-only">
          {recentTx.isLoading ? <LoadingState /> :
           recentTx.data && recentTx.data.items.length > 0 ? (
             <div className="flex flex-col divide-y divide-border-subtle">
               {recentTx.data.items.map((tx) => (
                 <div key={tx.id} className="flex items-center gap-3 py-2">
                   <div className="flex-1 min-w-0">
                     <div className="text-[11px] text-text-primary truncate">{tx.merchant}</div>
                     <div className="text-[10px] text-text-faint">{tx.effective_category_major}</div>
                   </div>
                   <div className="text-[9px] text-text-ghost shrink-0">{formatDate(tx.date)}</div>
                   <div className={`text-[11px] font-semibold shrink-0 ${tx.amount < 0 ? 'text-danger' : 'text-accent'}`}>
                     {tx.amount < 0 ? '-' : '+'}₩{formatKRW(tx.amount)}
                   </div>
                 </div>
               ))}
             </div>
           ) : <EmptyState message="거래 내역이 없습니다" />}
        </SectionCard>
      </div>
    </div>
  )
}
```

```bash
npx vitest run src/test/pages/OverviewPage.test.tsx
```

Expected: `2 tests passed`

- [ ] **Step 3: AppLayout에 metaBadge 연결**

각 페이지가 자체 topbar badge를 제공할 수 있도록 `AppLayout`에 Context 추가:

`frontend/src/components/layout/AppLayout.tsx` 수정:

```tsx
import { useState, createContext, useContext } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { MobileDrawer } from './MobileDrawer'
import { AppTopbar } from './AppTopbar'

interface ChromeContextValue {
  setMetaBadge: (badge: React.ReactNode) => void
}

export const ChromeContext = createContext<ChromeContextValue>({ setMetaBadge: () => {} })
export const useChromeContext = () => useContext(ChromeContext)

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [metaBadge, setMetaBadge] = useState<React.ReactNode>(null)

  return (
    <ChromeContext.Provider value={{ setMetaBadge }}>
      <div className="flex h-screen bg-surface-panel overflow-hidden">
        <AppSidebar onMobileOpen={() => setDrawerOpen(true)} />
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
          <AppTopbar onMobileMenuOpen={() => setDrawerOpen(true)} metaBadge={metaBadge} />
          <main className="flex-1 p-5">
            <Outlet />
          </main>
        </div>
      </div>
    </ChromeContext.Provider>
  )
}
```

`OverviewPage.tsx` 상단에 추가 (useEffect로 badge 설정):

```tsx
import { useEffect } from 'react'
import { useChromeContext } from '../components/layout/AppLayout'

// OverviewPage 내부 상단:
const { setMetaBadge } = useChromeContext()
useEffect(() => {
  if (snapshotDate) setMetaBadge(
    <span className="text-[10px] text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
      기준일 {snapshotDate}
    </span>
  )
}, [snapshotDate])
```

- [ ] **Step 4: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 개요 페이지"
```

---

## Task 8: 지출 분석 페이지

**Files:**
- Modify: `frontend/src/pages/SpendingPage.tsx`
- Create: `frontend/src/components/ui/RangeSlider.tsx`
- Create: `frontend/src/components/ui/DailyCalendar.tsx`

- [ ] **Step 1: RangeSlider 구현**

`frontend/src/components/ui/RangeSlider.tsx`:

```tsx
import { useState } from 'react'

interface RangeSliderProps {
  months: string[]           // ["2025-01", "2025-02", ...]
  value: [string, string]    // [startMonth, endMonth]
  onChange: (range: [string, string]) => void
}

export function RangeSlider({ months, value, onChange }: RangeSliderProps) {
  const [draft, setDraft] = useState(value)
  const startIdx = months.indexOf(draft[0])
  const endIdx = months.indexOf(draft[1])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-text-faint shrink-0">{months[0]}</span>
        <div className="relative flex-1 h-1 bg-border rounded">
          {/* filled track */}
          <div
            className="absolute h-full bg-accent/60 rounded"
            style={{
              left: `${(startIdx / (months.length - 1)) * 100}%`,
              right: `${100 - (endIdx / (months.length - 1)) * 100}%`,
            }}
          />
          {/* start thumb */}
          <input
            type="range" min={0} max={months.length - 1} value={startIdx}
            onChange={(e) => {
              const i = Number(e.target.value)
              if (i <= endIdx) setDraft([months[i], draft[1]])
            }}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            style={{ zIndex: 2 }}
          />
          {/* end thumb */}
          <input
            type="range" min={0} max={months.length - 1} value={endIdx}
            onChange={(e) => {
              const i = Number(e.target.value)
              if (i >= startIdx) setDraft([draft[0], months[i]])
            }}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            style={{ zIndex: 3 }}
          />
          {/* thumb indicators */}
          <div className="absolute w-3 h-3 bg-accent rounded-full -translate-y-1/2 top-1/2 pointer-events-none"
            style={{ left: `calc(${(startIdx / (months.length - 1)) * 100}% - 6px)` }} />
          <div className="absolute w-3 h-3 bg-accent rounded-full -translate-y-1/2 top-1/2 pointer-events-none"
            style={{ left: `calc(${(endIdx / (months.length - 1)) * 100}% - 6px)` }} />
        </div>
        <span className="text-[10px] text-text-faint shrink-0">{months[months.length - 1]}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-accent">{draft[0]}</span>
        <div className="flex gap-2">
          <button
            onClick={() => onChange(draft)}
            className="text-[10px] px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md"
          >
            적용
          </button>
          <button
            onClick={() => { const reset: [string, string] = [months[0], months[months.length - 1]]; setDraft(reset); onChange(reset) }}
            className="text-[10px] px-3 py-1.5 border border-border-strong text-text-ghost rounded-md"
          >
            초기화
          </button>
        </div>
        <span className="text-[10px] text-accent">{draft[1]}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: DailyCalendar 구현**

`frontend/src/components/ui/DailyCalendar.tsx`:

```tsx
import { formatKRW } from '../../lib/utils'

interface DayData {
  date: string   // "YYYY-MM-DD"
  amount: number
}

interface DailyCalendarProps {
  month: string      // "YYYY-MM"
  data: DayData[]
  includeIncome?: boolean
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export function DailyCalendar({ month, data, includeIncome = false }: DailyCalendarProps) {
  const [year, mon] = month.split('-').map(Number)
  const firstDay = new Date(year, mon - 1, 1).getDay()
  const daysInMonth = new Date(year, mon, 0).getDate()

  const dayMap = new Map(data.map((d) => [d.date.slice(-2), d.amount]))
  const total = data.reduce((sum, d) => sum + (includeIncome ? d.amount : Math.min(d.amount, 0)), 0)
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.amount)), 1)

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[8px] text-text-ghost pb-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {/* Empty cells */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {/* Day cells */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = String(i + 1).padStart(2, '0')
          const amount = dayMap.get(day)
          const intensity = amount ? Math.min(Math.abs(amount) / maxAbs, 1) : 0
          return (
            <div
              key={day}
              title={amount ? `${i + 1}일: ₩${formatKRW(amount)}` : undefined}
              className="aspect-square rounded flex flex-col items-center justify-center gap-0.5 bg-border-subtle"
              style={intensity > 0 ? { opacity: 0.4 + intensity * 0.6 } : undefined}
            >
              <span className="text-[7.5px] text-text-faint">{i + 1}</span>
              {amount !== undefined && (
                <span className="w-[3px] h-[3px] rounded-full" style={{ background: amount < 0 ? '#f87171' : '#10b981' }} />
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-right text-[10px] text-text-muted">
        합계 ₩{formatKRW(Math.abs(total))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: SpendingPage 구현**

`frontend/src/pages/SpendingPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Pagination } from '../components/ui/Pagination'
import { SegmentedBar } from '../components/ui/SegmentedBar'
import { RangeSlider } from '../components/ui/RangeSlider'
import { DailyCalendar } from '../components/ui/DailyCalendar'
import { StackedBarChart } from '../components/charts/StackedBarChart'
import { HorizontalBarList } from '../components/charts/HorizontalBarList'
import { useCategoryTimeline, useCategoryBreakdown, useTransactionList } from '../hooks/useTransactions'
import { useFixedCostSummary } from '../hooks/useAnalytics'
import { useDailySpend } from '../hooks/useTransactions'
import { useMerchantSpend } from '../hooks/useAnalytics'
import { useChromeContext } from '../components/layout/AppLayout'
import { monthRange, formatKRWCompact } from '../lib/utils'

const TREEMAP_COLORS = ['#1e3a5f', '#1a3b2e', '#2d1f4a', '#3b2020', '#2a2210', '#1f2a1a', '#2a1a2e']

export function SpendingPage() {
  // 전체 사용 가능한 월 범위 (임시: 최근 12개월)
  const now = new Date()
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const startOfRange = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const allMonths = monthRange(startOfRange, endMonth)

  // 시계열 범위 (슬라이더)
  const [timelineRange, setTimelineRange] = useState<[string, string]>([
    allMonths[Math.max(0, allMonths.length - 6)],
    endMonth,
  ])

  // 상세 범위 (필터)
  const [detailStart, setDetailStart] = useState(timelineRange[0])
  const [detailEnd, setDetailEnd] = useState(timelineRange[1])
  const [includeIncome, setIncludeIncome] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(endMonth)
  const [txPage, setTxPage] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [accordionOpen, setAccordionOpen] = useState(true)

  const { setMetaBadge } = useChromeContext()
  useEffect(() => {
    setMetaBadge(
      <span className="text-[10px] text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {detailStart} ~ {detailEnd}
      </span>
    )
  }, [detailStart, detailEnd])

  const timeline = useCategoryTimeline({ start_month: timelineRange[0], end_month: timelineRange[1] })
  const breakdown = useCategoryBreakdown({ start_month: detailStart, end_month: detailEnd, include_income: includeIncome })
  const subBreakdown = useCategoryBreakdown({ start_month: detailStart, end_month: detailEnd })
  const fixedCost = useFixedCostSummary({ start_month: detailStart, end_month: detailEnd })
  const merchants = useMerchantSpend({ months: 3, limit: 10 })
  const dailySpend = useDailySpend({ month: calendarMonth, include_income: includeIncome })
  const transactions = useTransactionList({
    page: txPage, per_page: 20,
    start_month: detailStart, end_month: detailEnd,
    type: includeIncome ? 'all' : '지출',
  })

  const categories = [...new Set((breakdown.data?.items ?? []).map((i) => i.category))]

  return (
    <div className="flex flex-col gap-4">

      {/* 1. 범위 슬라이더 */}
      <SectionCard title="조회 범위">
        <RangeSlider months={allMonths} value={timelineRange} onChange={setTimelineRange} />
      </SectionCard>

      {/* 2. 월별 카테고리 추이 */}
      <SectionCard title="월별 카테고리 추이" badge="상위 카테고리">
        {timeline.isLoading ? <LoadingState /> :
         timeline.error ? <ErrorState onRetry={() => timeline.refetch()} /> :
         timeline.data && timeline.data.items.length > 0 ? (
           <StackedBarChart items={timeline.data.items} height={180} />
         ) : <EmptyState />}
      </SectionCard>

      {/* 3. 상세 필터 */}
      <div className="bg-surface-card border border-border rounded-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-text-faint">상세 필터</span>
          <div className="w-px h-4 bg-border-strong" />
          <select
            value={detailStart}
            onChange={(e) => { setDetailStart(e.target.value); setTxPage(1) }}
            className="text-[10px] text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2.5 py-1.5"
          >
            {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="text-[10px] text-text-ghost">~</span>
          <select
            value={detailEnd}
            onChange={(e) => { setDetailEnd(e.target.value); setTxPage(1) }}
            className="text-[10px] text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2.5 py-1.5"
          >
            {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="w-px h-4 bg-border-strong" />
          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-text-faint">
            <input
              type="checkbox" checked={includeIncome}
              onChange={(e) => { setIncludeIncome(e.target.checked); setTxPage(1) }}
              className="w-3 h-3 accent-accent"
            />
            수입 포함
          </label>
        </div>
      </div>

      {/* 4. 카테고리 + 소분류 */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="카테고리별 지출" badge={`${detailStart} ~ ${detailEnd}`}>
          {breakdown.isLoading ? <LoadingState /> :
           breakdown.data && breakdown.data.items.length > 0 ? (
             <HorizontalBarList items={breakdown.data.items.map((i) => ({ label: i.category, amount: i.amount }))} />
           ) : <EmptyState />}
        </SectionCard>
        <SectionCard title="소분류별 지출">
          <div className="mb-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-[9px] text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2 py-1.5"
            >
              <option value="">대분류 선택</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {selectedCategory && subBreakdown.data ? (
            <HorizontalBarList
              items={subBreakdown.data.items
                .filter((i) => i.category === selectedCategory)
                .map((i) => ({ label: i.category, amount: i.amount }))}
            />
          ) : <EmptyState message="대분류를 선택하세요" />}
        </SectionCard>
      </div>

      {/* 5. 고정비/변동비 + 필수/비필수 */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="고정비 / 변동비 비율" badge={`${detailStart} ~ ${detailEnd}`}>
          {fixedCost.isLoading ? <LoadingState /> :
           fixedCost.data ? (
             fixedCost.data.unclassified_count > 0 && fixedCost.data.fixed_ratio == null ? (
               <EmptyState message="cost_kind 미분류 데이터입니다. 작업대에서 분류해주세요." />
             ) : (
               <>
                 <SegmentedBar
                   segments={[
                     { label: '고정비', value: (fixedCost.data.fixed_ratio ?? 0) * 100, color: '#1e40af' },
                     { label: '변동비', value: (1 - (fixedCost.data.fixed_ratio ?? 0)) * 100, color: '#059669' },
                   ]}
                 />
                 <div className="grid grid-cols-2 gap-3 mt-3">
                   {[
                     { label: '고정비', amount: fixedCost.data.fixed_total, color: 'text-blue-400' },
                     { label: '변동비', amount: fixedCost.data.variable_total, color: 'text-accent' },
                   ].map((s) => (
                     <div key={s.label} className="bg-surface-bar border border-border rounded-lg p-3">
                       <div className={`text-[10px] ${s.color} font-semibold mb-1`}>{s.label}</div>
                       <div className="text-[14px] font-bold text-text-primary">₩ {formatKRWCompact(s.amount)}</div>
                     </div>
                   ))}
                 </div>
               </>
             )
           ) : <EmptyState />}
        </SectionCard>

        <SectionCard title="고정비 — 필수 / 비필수" badge="고정비 기준">
          {fixedCost.isLoading ? <LoadingState /> :
           fixedCost.data && fixedCost.data.fixed_total > 0 ? (
             <>
               <SegmentedBar
                 segments={[
                   { label: '필수', value: fixedCost.data.fixed_total > 0 ? (fixedCost.data.essential_fixed_total / fixedCost.data.fixed_total) * 100 : 0, color: '#047857' },
                   { label: '비필수', value: fixedCost.data.fixed_total > 0 ? (fixedCost.data.discretionary_fixed_total / fixedCost.data.fixed_total) * 100 : 0, color: '#92400e' },
                 ]}
               />
               <div className="grid grid-cols-2 gap-3 mt-3">
                 {[
                   { label: '필수 고정비', amount: fixedCost.data.essential_fixed_total, color: 'text-[#6ee7b7]' },
                   { label: '비필수 고정비', amount: fixedCost.data.discretionary_fixed_total, color: 'text-warn' },
                 ].map((s) => (
                   <div key={s.label} className="bg-surface-bar border border-border rounded-lg p-3">
                     <div className={`text-[10px] ${s.color} font-semibold mb-1`}>{s.label}</div>
                     <div className="text-[14px] font-bold text-text-primary">₩ {formatKRWCompact(s.amount)}</div>
                   </div>
                 ))}
               </div>
             </>
           ) : <EmptyState message="고정비 분류 데이터가 없습니다" />}
        </SectionCard>
      </div>

      {/* 6. Treemap */}
      <SectionCard title="거래처별 지출 비중" badge="최근 3개월">
        {merchants.isLoading ? <LoadingState /> :
         merchants.data && merchants.data.items.length > 0 ? (
           <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', height: 110 }}>
             {merchants.data.items.slice(0, 8).map((m, i) => (
               <div
                 key={m.merchant}
                 className="rounded-md flex flex-col items-center justify-center text-center gap-0.5 p-1"
                 style={{ background: TREEMAP_COLORS[i % TREEMAP_COLORS.length] }}
               >
                 <span className="text-[9px] font-semibold text-white/80 truncate w-full text-center">{m.merchant}</span>
                 <span className="text-[8px] text-white/50">₩{formatKRWCompact(m.amount)}</span>
               </div>
             ))}
           </div>
         ) : <EmptyState />}
      </SectionCard>

      {/* 7. 달력 + 거래내역 */}
      <div className="grid md:grid-cols-[3fr_2fr] gap-4">
        <SectionCard title="일별 지출 달력">
          <div className="flex items-center gap-2 mb-3">
            <select
              value={calendarMonth}
              onChange={(e) => setCalendarMonth(e.target.value)}
              className="text-[9px] text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2 py-1.5"
            >
              {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {dailySpend.isLoading ? <LoadingState /> :
           dailySpend.data ? (
             <DailyCalendar month={calendarMonth} data={dailySpend.data.items} includeIncome={includeIncome} />
           ) : <EmptyState />}
        </SectionCard>

        <div className="flex flex-col">
          <div
            className="flex items-center justify-between px-4 py-3 bg-surface-card border border-border rounded-t-card cursor-pointer"
            onClick={() => setAccordionOpen((o) => !o)}
          >
            <div>
              <div className="text-[11px] font-semibold text-text-secondary">거래 내역</div>
              <div className="text-[10px] text-text-ghost mt-0.5">
                {txPage} / {Math.ceil((transactions.data?.total ?? 0) / 20)} 페이지 · 총 {transactions.data?.total ?? 0}건
              </div>
            </div>
            <span className="text-text-ghost text-[12px]">{accordionOpen ? '▲' : '▼'}</span>
          </div>
          {accordionOpen && (
            <div className="bg-surface-card border border-border border-t-0 rounded-b-card">
              {transactions.isLoading ? <LoadingState /> :
               transactions.data && transactions.data.items.length > 0 ? (
                 <>
                   <table className="w-full border-collapse text-[10px]">
                     <thead>
                       <tr>
                         {['날짜', '거래처', '카테고리', '금액'].map((h) => (
                           <th key={h} className="text-[9px] text-text-ghost px-3 py-2 text-left border-b border-border-subtle">{h}</th>
                         ))}
                       </tr>
                     </thead>
                     <tbody>
                       {transactions.data.items.map((tx) => (
                         <tr key={tx.id} className="border-b border-[#0d1117] last:border-0">
                           <td className="px-3 py-2 text-text-ghost">{tx.date.slice(5)}</td>
                           <td className="px-3 py-2 text-text-secondary truncate max-w-[80px]">{tx.merchant}</td>
                           <td className="px-3 py-2 text-text-faint">{tx.effective_category_major}</td>
                           <td className={`px-3 py-2 text-right font-semibold ${tx.amount < 0 ? 'text-danger' : 'text-accent'}`}>
                             {tx.amount < 0 ? '-' : '+'}₩{Math.abs(tx.amount).toLocaleString()}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                   <Pagination
                     page={txPage} perPage={20}
                     total={transactions.data.total}
                     onPageChange={setTxPage}
                   />
                 </>
               ) : <EmptyState />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 지출 분석 페이지"
```

---

## Task 9: 자산 현황 페이지

**Files:**
- Modify: `frontend/src/pages/AssetsPage.tsx`

- [ ] **Step 1: AssetsPage 구현**

`frontend/src/pages/AssetsPage.tsx`:

```tsx
import { useEffect } from 'react'
import { KpiCard } from '../components/ui/KpiCard'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LineAreaChart } from '../components/charts/LineAreaChart'
import { HorizontalBarList } from '../components/charts/HorizontalBarList'
import { useAssetSnapshots, useNetWorthHistory, useInvestmentSummary, useLoanSummary } from '../hooks/useAssets'
import { useChromeContext } from '../components/layout/AppLayout'
import { formatKRWCompact, formatPct } from '../lib/utils'

export function AssetsPage() {
  const snapshots = useAssetSnapshots()
  const netWorthHistory = useNetWorthHistory()
  const investments = useInvestmentSummary()
  const loans = useLoanSummary()
  const { setMetaBadge } = useChromeContext()

  const latest = snapshots.data?.items?.[snapshots.data.items.length - 1]
  const snapshotDate = latest?.snapshot_date

  useEffect(() => {
    if (snapshotDate) setMetaBadge(
      <span className="text-[10px] text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        기준일 {snapshotDate}
      </span>
    )
  }, [snapshotDate])

  const netWorth = latest ? parseFloat(latest.net_worth) : null
  const assetTotal = latest ? parseFloat(latest.asset_total) : null
  const liabilityTotal = latest ? parseFloat(latest.liability_total) : null
  const investMarketValue = investments.data ? parseFloat(investments.data.totals.market_value) : null
  const investCostBasis = investments.data ? parseFloat(investments.data.totals.cost_basis) : null
  const investReturnPct = investMarketValue != null && investCostBasis != null && investCostBasis > 0
    ? ((investMarketValue - investCostBasis) / investCostBasis) * 100
    : null

  return (
    <div className="flex flex-col gap-4">

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="순자산" value={netWorth != null ? `₩ ${formatKRWCompact(netWorth)}` : '—'}
          className="border-t-2 border-t-accent" subVariant="up" />
        <KpiCard label="총자산" value={assetTotal != null ? `₩ ${formatKRWCompact(assetTotal)}` : '—'} />
        <KpiCard label="총부채" value={liabilityTotal != null ? `₩ ${formatKRWCompact(liabilityTotal)}` : '—'}
          className="border-t-2 border-t-danger" />
        <KpiCard label="투자 평가액" value={investMarketValue != null ? `₩ ${formatKRWCompact(investMarketValue)}` : '—'}
          sub={investReturnPct != null ? `원금 대비 ${investReturnPct > 0 ? '+' : ''}${formatPct(investReturnPct)}` : ''}
          subVariant={investReturnPct != null && investReturnPct > 0 ? 'up' : 'down'} />
      </div>

      {/* 순자산 추이 */}
      <SectionCard title="순자산 추이" badge="스냅샷 기준 시계열">
        {netWorthHistory.isLoading ? <LoadingState /> :
         netWorthHistory.error ? <ErrorState onRetry={() => netWorthHistory.refetch()} /> :
         netWorthHistory.data ? (
           <LineAreaChart data={netWorthHistory.data.items} />
         ) : <EmptyState />}
      </SectionCard>

      {/* 투자 + 대출 */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* 투자 요약 */}
        <SectionCard title="투자 요약" badge={investments.data?.snapshot_date ?? undefined}>
          {investments.isLoading ? <LoadingState /> :
           investments.error ? <ErrorState onRetry={() => investments.refetch()} /> :
           investments.data ? (
             <>
               <div className="grid grid-cols-3 gap-2.5 mb-4">
                 {[
                   { label: '총 원금', value: `₩ ${formatKRWCompact(investCostBasis ?? 0)}`, color: 'text-text-primary' },
                   { label: '평가액', value: `₩ ${formatKRWCompact(investMarketValue ?? 0)}`, color: 'text-[#a78bfa]' },
                   { label: '수익률', value: formatPct(investReturnPct), color: (investReturnPct ?? 0) > 0 ? 'text-accent' : 'text-danger' },
                 ].map((s) => (
                   <div key={s.label} className="bg-surface-bar border border-border rounded-lg p-2.5">
                     <div className="text-[9px] text-text-faint mb-1">{s.label}</div>
                     <div className={`text-[12px] font-bold ${s.color}`}>{s.value}</div>
                   </div>
                 ))}
               </div>
               <div className="text-[10px] text-text-faint mb-2">포트폴리오 비중</div>
               <HorizontalBarList
                 items={investments.data.items.map((item) => ({
                   label: item.broker,
                   amount: parseFloat(item.market_value ?? '0'),
                 }))}
                 maxAmount={investMarketValue ?? undefined}
               />
             </>
           ) : <EmptyState message="투자 데이터가 없습니다" />}
        </SectionCard>

        {/* 대출 요약 */}
        <SectionCard title="대출 요약" badge={loans.data?.snapshot_date ?? undefined}>
          {loans.isLoading ? <LoadingState /> :
           loans.error ? <ErrorState onRetry={() => loans.refetch()} /> :
           loans.data ? (
             <>
               <div className="grid grid-cols-2 gap-2.5 mb-4">
                 {[
                   { label: '총 대출 원금', value: `₩ ${formatKRWCompact(parseFloat(loans.data.totals.principal))}`, color: 'text-text-primary' },
                   { label: '총 잔액', value: `₩ ${formatKRWCompact(parseFloat(loans.data.totals.balance))}`, color: 'text-danger' },
                 ].map((s) => (
                   <div key={s.label} className="bg-surface-bar border border-border rounded-lg p-2.5">
                     <div className="text-[9px] text-text-faint mb-1">{s.label}</div>
                     <div className={`text-[13px] font-bold ${s.color}`}>{s.value}</div>
                   </div>
                 ))}
               </div>
               <table className="w-full text-[10px] border-collapse">
                 <thead>
                   <tr>
                     {['상품', '잔액', '금리'].map((h) => (
                       <th key={h} className="text-[9px] text-text-ghost pb-1.5 text-left border-b border-border-subtle">{h}</th>
                     ))}
                   </tr>
                 </thead>
                 <tbody>
                   {loans.data.items.slice(0, 4).map((loan, i) => (
                     <tr key={i} className="border-b border-[#0d1117] last:border-0">
                       <td className="py-2">
                         <div className="text-text-primary font-medium">{loan.product_name}</div>
                         <div className="text-[9px] text-text-faint">{loan.lender}</div>
                         {loan.loan_type && (
                           <span className="inline-block text-[8px] px-1.5 py-0.5 mt-0.5 bg-border-subtle text-text-ghost rounded">{loan.loan_type}</span>
                         )}
                       </td>
                       <td className="py-2 text-danger font-semibold text-right">
                         ₩ {formatKRWCompact(parseFloat(loan.balance ?? '0'))}
                       </td>
                       <td className="py-2 text-right">
                         {loan.interest_rate ? (
                           <span className="text-text-muted">{parseFloat(loan.interest_rate).toFixed(2)}%</span>
                         ) : '—'}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </>
           ) : <EmptyState message="대출 데이터가 없습니다" />}
        </SectionCard>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 자산 현황 페이지"
```

---

## Task 10: 인사이트 페이지

**Files:**
- Modify: `frontend/src/pages/InsightsPage.tsx`

- [ ] **Step 1: InsightsPage 구현**

`frontend/src/pages/InsightsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { KpiCard } from '../components/ui/KpiCard'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { MoMBarList } from '../components/charts/MoMBarList'
import {
  useMonthlyCashflow, useIncomeStability,
  useRecurringPayments, useSpendingAnomalies,
  useMerchantSpend, useCategoryMoM,
} from '../hooks/useAnalytics'
import { useChromeContext } from '../components/layout/AppLayout'
import { formatKRW, formatKRWCompact, formatPct } from '../lib/utils'

interface InsightItem {
  icon: string
  title: string
  description: string
  variant: 'ok' | 'warn' | 'danger'
}

const VARIANT_BADGE: Record<string, string> = {
  ok:     'bg-accent-dim text-accent border border-accent-muted',
  warn:   'bg-warn-dim text-warn border border-warn-muted',
  danger: 'bg-danger-dim text-danger border border-danger-muted',
}
const VARIANT_LABEL: Record<string, string> = {
  ok: '양호', warn: '주의', danger: '확인 필요',
}

export function InsightsPage() {
  const cashflow = useMonthlyCashflow(6)
  const incomeStability = useIncomeStability()
  const [recurringPage, setRecurringPage] = useState(1)
  const [anomalyPage, setAnomalyPage] = useState(1)
  const [showRecurringAssumption, setShowRecurringAssumption] = useState(false)
  const [showAnomalyAssumption, setShowAnomalyAssumption] = useState(false)
  const recurring = useRecurringPayments(recurringPage, 10)
  const anomalies = useSpendingAnomalies(anomalyPage, 10)
  const merchants = useMerchantSpend({ months: 3, limit: 5 })
  const categoryMoM = useCategoryMoM(2)
  const { setMetaBadge } = useChromeContext()

  // 요약 지표 계산
  const latestCashflow = cashflow.data?.items?.[cashflow.data.items.length - 1]
  const savingsRate = latestCashflow?.savings_rate != null ? latestCashflow.savings_rate * 100 : null
  const incomeCV = incomeStability.data?.coefficient_of_variation
  const incomeStabilityLabel = incomeCV == null ? '—' : incomeCV < 0.1 ? '낮음' : incomeCV < 0.25 ? '보통' : '높음'
  const anomalyCount = anomalies.data?.total ?? null

  // 핵심 인사이트 생성 (클라이언트 조합)
  const insights: InsightItem[] = []
  if (savingsRate != null) {
    if (savingsRate > 50) insights.push({ icon: '💰', title: `저축률 ${formatPct(savingsRate)} — 목표 초과 달성`, description: '지출이 수입 대비 잘 관리되고 있습니다.', variant: 'ok' })
    else if (savingsRate > 0) insights.push({ icon: '📊', title: `저축률 ${formatPct(savingsRate)}`, description: '저축률 50% 목표까지 여유가 있습니다.', variant: 'warn' })
  }
  if (anomalyCount != null && anomalyCount > 0) {
    insights.push({ icon: '⚠️', title: `이상 지출 ${anomalyCount}개 카테고리 감지`, description: '전월 대비 급증한 지출 카테고리가 있습니다. 이상 지출 탭을 확인해주세요.', variant: 'warn' })
  }
  if (recurring.data?.total != null && recurring.data.total > 0) {
    insights.push({ icon: '🔁', title: `반복 결제 ${recurring.data.total}건 감지`, description: '정기 결제 항목을 확인하고 불필요한 구독을 정리해보세요.', variant: 'warn' })
  }
  if (incomeStabilityLabel === '낮음') {
    insights.push({ icon: '✅', title: '수입 안정성이 높습니다', description: `최근 6개월 수입 변동계수 ${formatPct(incomeCV != null ? incomeCV * 100 : null)} — 안정적인 수입 흐름입니다.`, variant: 'ok' })
  }

  useEffect(() => {
    setMetaBadge(
      <span className="text-[10px] text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        핵심 인사이트 {insights.length}건
      </span>
    )
  }, [insights.length])

  return (
    <div className="flex flex-col gap-4">

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="저축률" value={formatPct(savingsRate)} subVariant={savingsRate != null && savingsRate > 50 ? 'up' : 'neutral'} />
        <KpiCard label="수입 변동성" value={incomeStabilityLabel} />
        <KpiCard label="이상 지출 카테고리" value={anomalyCount != null ? `${anomalyCount}개` : '—'} subVariant={anomalyCount ? 'down' : 'neutral'} />
      </div>

      {/* 핵심 인사이트 */}
      <SectionCard title="핵심 인사이트" badge={`${insights.length}건`}>
        {insights.length === 0 ? <EmptyState message="분석할 데이터가 부족합니다" /> : (
          <div className="flex flex-col gap-2">
            {insights.map((insight, i) => (
              <div key={i} className="flex gap-3 p-3 bg-surface-bar border border-border rounded-lg">
                <div className="w-7 h-7 rounded-md bg-border-subtle flex items-center justify-center text-[13px] shrink-0">{insight.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-text-primary mb-0.5">{insight.title}</div>
                  <div className="text-[10px] text-text-faint">{insight.description}</div>
                </div>
                <span className={`text-[8px] px-1.5 py-0.5 rounded self-start shrink-0 ${VARIANT_BADGE[insight.variant]}`}>
                  {VARIANT_LABEL[insight.variant]}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 반복 결제 + 이상 지출 */}
      <div className="grid md:grid-cols-2 gap-4">

        <SectionCard title="반복 결제"
          badge={<button onClick={() => setShowRecurringAssumption((v) => !v)} className="text-[9px] text-text-ghost border border-border-strong rounded px-1.5 py-0.5">진단 기준</button>}
        >
          {showRecurringAssumption && recurring.data && (
            <div className="text-[9px] text-text-faint bg-surface-bar border border-border rounded p-2 mb-3 leading-relaxed">
              {recurring.data.assumptions}
            </div>
          )}
          {recurring.isLoading ? <LoadingState /> :
           recurring.data && recurring.data.items.length > 0 ? (
             <>
               <table className="w-full border-collapse text-[10px]">
                 <thead>
                   <tr>{['거래처', '주기', '평균금액', '횟수'].map((h) => (
                     <th key={h} className="text-[9px] text-text-ghost pb-1.5 text-left border-b border-border-subtle">{h}</th>
                   ))}</tr>
                 </thead>
                 <tbody>
                   {recurring.data.items.map((item, i) => (
                     <tr key={i} className="border-b border-[#0d1117] last:border-0">
                       <td className="py-2 text-text-primary font-medium">{item.merchant}</td>
                       <td className="py-2"><span className="text-[8px] bg-accent-dim text-accent border border-accent-muted px-1.5 py-0.5 rounded">{item.interval_type}</span></td>
                       <td className="py-2 text-right font-semibold">₩ {formatKRW(item.avg_amount)}</td>
                       <td className="py-2 text-right text-text-muted">{item.occurrences}회</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               <Pagination page={recurringPage} perPage={10} total={recurring.data.total} onPageChange={setRecurringPage} />
             </>
           ) : <EmptyState />}
        </SectionCard>

        <SectionCard title="이상 지출"
          badge={<button onClick={() => setShowAnomalyAssumption((v) => !v)} className="text-[9px] text-text-ghost border border-border-strong rounded px-1.5 py-0.5">진단 기준</button>}
        >
          {showAnomalyAssumption && anomalies.data && (
            <div className="text-[9px] text-text-faint bg-surface-bar border border-border rounded p-2 mb-3 leading-relaxed">
              {anomalies.data.assumptions}
            </div>
          )}
          {anomalies.isLoading ? <LoadingState /> :
           anomalies.data && anomalies.data.items.length > 0 ? (
             <>
               <table className="w-full border-collapse text-[10px]">
                 <thead>
                   <tr>{['카테고리', '이번 달', '기준선', '증감'].map((h) => (
                     <th key={h} className="text-[9px] text-text-ghost pb-1.5 text-left border-b border-border-subtle">{h}</th>
                   ))}</tr>
                 </thead>
                 <tbody>
                   {anomalies.data.items.map((item, i) => (
                     <tr key={i} className="border-b border-[#0d1117] last:border-0">
                       <td className="py-2 text-text-primary font-medium">{item.category}</td>
                       <td className="py-2 text-right">₩ {formatKRWCompact(item.amount)}</td>
                       <td className="py-2 text-right text-text-faint">₩ {formatKRWCompact(item.baseline_avg)}</td>
                       <td className={`py-2 text-right font-semibold ${(item.delta_pct ?? 0) > 0 ? 'text-danger' : 'text-accent'}`}>
                         {item.delta_pct != null ? `+${formatPct(item.delta_pct)}` : '—'}
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               <Pagination page={anomalyPage} perPage={10} total={anomalies.data.total} onPageChange={setAnomalyPage} />
             </>
           ) : <EmptyState />}
        </SectionCard>

      </div>

      {/* 거래처 Top 5 + 카테고리 MoM */}
      <div className="grid md:grid-cols-2 gap-4">

        <SectionCard title="거래처 소비 Top 5" badge="최근 3개월">
          {merchants.isLoading ? <LoadingState /> :
           merchants.data && merchants.data.items.length > 0 ? (
             <div className="flex flex-col divide-y divide-border-subtle">
               {merchants.data.items.map((m, i) => (
                 <div key={m.merchant} className="flex items-center gap-2.5 py-2">
                   <span className="text-[10px] text-text-ghost w-4 shrink-0">#{i + 1}</span>
                   <span className="text-[10px] text-text-primary font-medium flex-1 truncate">{m.merchant}</span>
                   <span className="text-[10px] text-text-faint w-7 text-center">{m.count}건</span>
                   <span className="text-[10px] text-text-muted w-20 text-right">평균 ₩{formatKRWCompact(m.avg_amount)}</span>
                   <span className="text-[10px] text-danger font-semibold w-20 text-right">₩ {formatKRWCompact(m.amount)}</span>
                 </div>
               ))}
             </div>
           ) : <EmptyState />}
        </SectionCard>

        <SectionCard title="카테고리 전월 대비">
          {categoryMoM.isLoading ? <LoadingState /> :
           categoryMoM.data && categoryMoM.data.items.length > 0 ? (
             <MoMBarList items={categoryMoM.data.items} />
           ) : <EmptyState />}
        </SectionCard>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 인사이트 페이지"
```

---

## Task 11: 거래 작업대 — 테이블 + 인라인 편집

**Files:**
- Modify: `frontend/src/pages/WorkbenchPage.tsx`

- [ ] **Step 1: WorkbenchPage 구현 (테이블 + 필터 + 인라인 편집)**

`frontend/src/pages/WorkbenchPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { AlertBanner } from '../components/ui/AlertBanner'
import { Pagination } from '../components/ui/Pagination'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusBadge } from '../components/ui/StatusBadge'
import { NecessityBadge } from '../components/ui/NecessityBadge'
import {
  useTransactionList, useTransactionFilterOptions,
  useUpdateTransaction, useDeleteTransaction, useRestoreTransaction,
  useBulkUpdateTransactions,
} from '../hooks/useTransactions'
import { useUploadLogs, useUploadFile, useResetData } from '../hooks/useUpload'
import { useWriteAccess } from '../hooks/useWriteAccess'
import { useChromeContext } from '../components/layout/AppLayout'
import type { TransactionResponse } from '../types/transaction'
import type { DataResetScope } from '../types/upload'
import { formatKRW } from '../lib/utils'

interface FilterState {
  search: string
  type: string
  source: string
  category_major: string
  payment_method: string
  start_date: string
  end_date: string
  include_deleted: boolean
  is_edited: boolean | undefined
}

const DEFAULT_FILTER: FilterState = {
  search: '', type: '', source: '', category_major: '',
  payment_method: '', start_date: '', end_date: '',
  include_deleted: false, is_edited: undefined,
}

interface EditDraft {
  merchant?: string
  category_major_user?: string
  category_minor_user?: string
  cost_kind?: 'fixed' | 'variable' | ''
  fixed_cost_necessity?: 'essential' | 'discretionary' | ''
  memo?: string
}

export function WorkbenchPage() {
  const hasWrite = useWriteAccess()
  const { setMetaBadge } = useChromeContext()

  // Filter
  const [filterDraft, setFilterDraft] = useState<FilterState>(DEFAULT_FILTER)
  const [appliedFilter, setAppliedFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [page, setPage] = useState(1)

  // Selection + Editing
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({})

  // Bulk edit draft
  const [bulkDraft, setBulkDraft] = useState<EditDraft>({})

  // Accordions
  const [uploadOpen, setUploadOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dangerOpen, setDangerOpen] = useState(false)

  // Upload form
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [snapshotDate, setSnapshotDate] = useState('')

  // Reset
  const [resetScope, setResetScope] = useState<DataResetScope>('transactions_only')
  const [resetConfirm, setResetConfirm] = useState('')

  // Alert
  const [alert, setAlert] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)

  // Queries
  const filterParams = {
    page, per_page: 20,
    search: appliedFilter.search || undefined,
    type: appliedFilter.type || undefined,
    source: appliedFilter.source || undefined,
    category_major: appliedFilter.category_major || undefined,
    payment_method: appliedFilter.payment_method || undefined,
    start_date: appliedFilter.start_date || undefined,
    end_date: appliedFilter.end_date || undefined,
    include_deleted: appliedFilter.include_deleted || undefined,
    is_edited: appliedFilter.is_edited,
  }

  const txList = useTransactionList(filterParams)
  const filterOptions = useTransactionFilterOptions()
  const uploadLogs = useUploadLogs(10)

  const updateMutation = useUpdateTransaction()
  const deleteMutation = useDeleteTransaction()
  const restoreMutation = useRestoreTransaction()
  const bulkMutation = useBulkUpdateTransactions()
  const uploadMutation = useUploadFile()
  const resetMutation = useResetData()

  useEffect(() => {
    const total = txList.data?.total ?? 0
    const showing = txList.data?.items?.length ?? 0
    setMetaBadge(
      <span className="text-[10px] text-text-muted bg-surface-bar border border-border px-2.5 py-0.5 rounded-full">
        {showing} / {total}건
      </span>
    )
  }, [txList.data])

  function applyFilter() { setAppliedFilter(filterDraft); setPage(1); setSelectedIds(new Set()) }
  function resetFilter() { setFilterDraft(DEFAULT_FILTER); setAppliedFilter(DEFAULT_FILTER); setPage(1); setSelectedIds(new Set()) }

  function toggleSelect(tx: TransactionResponse) {
    if (tx.is_deleted) return
    if (editingId !== null) return  // 편집 중이면 선택 불가
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(tx.id)) next.delete(tx.id) else next.add(tx.id)
      return next
    })
  }

  function startEdit(tx: TransactionResponse) {
    setSelectedIds(new Set())  // bulk 해제
    setEditingId(tx.id)
    setEditDraft({
      merchant: tx.merchant,
      category_major_user: tx.category_major_user ?? tx.effective_category_major,
      category_minor_user: tx.category_minor_user ?? '',
      cost_kind: tx.cost_kind ?? '',
      fixed_cost_necessity: tx.fixed_cost_necessity ?? '',
      memo: tx.memo ?? '',
    })
  }

  async function saveEdit(id: number) {
    try {
      await updateMutation.mutateAsync({
        id,
        data: {
          merchant: editDraft.merchant || null,
          category_major_user: editDraft.category_major_user || null,
          category_minor_user: editDraft.category_minor_user || null,
          cost_kind: (editDraft.cost_kind as 'fixed' | 'variable') || null,
          fixed_cost_necessity: (editDraft.fixed_cost_necessity as 'essential' | 'discretionary') || null,
          memo: editDraft.memo || null,
        },
      })
      setEditingId(null)
      setAlert({ variant: 'success', title: '수정 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '수정 실패', description: String(e) })
    }
  }

  async function deleteRow(id: number) {
    try {
      await deleteMutation.mutateAsync(id)
      setAlert({ variant: 'success', title: '삭제 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '삭제 실패', description: String(e) })
    }
  }

  async function restoreRow(id: number) {
    try {
      await restoreMutation.mutateAsync(id)
      setAlert({ variant: 'success', title: '복원 완료' })
    } catch (e) {
      setAlert({ variant: 'error', title: '복원 실패', description: String(e) })
    }
  }

  async function applyBulk() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const result = await bulkMutation.mutateAsync({
        ids,
        merchant: bulkDraft.merchant || null,
        category_major_user: bulkDraft.category_major_user || null,
        category_minor_user: bulkDraft.category_minor_user || null,
        cost_kind: (bulkDraft.cost_kind as 'fixed' | 'variable') || null,
        fixed_cost_necessity: (bulkDraft.fixed_cost_necessity as 'essential' | 'discretionary') || null,
        memo: bulkDraft.memo || null,
      })
      setSelectedIds(new Set())
      setBulkDraft({})
      setAlert({ variant: 'success', title: `${result.updated}건 일괄 수정 완료` })
    } catch (e) {
      setAlert({ variant: 'error', title: '일괄 수정 실패', description: String(e) })
    }
  }

  async function handleUpload() {
    if (!uploadFile || !snapshotDate) return
    try {
      const result = await uploadMutation.mutateAsync({ file: uploadFile, snapshotDate })
      setAlert({
        variant: result.status === 'failed' ? 'error' : 'success',
        title: result.status === 'failed' ? '업로드 실패' : '업로드 완료',
        description: result.status !== 'failed'
          ? `신규 ${result.transactions.new}건, 스킵 ${result.transactions.skipped}건 · ${uploadFile.name}`
          : result.error_message ?? undefined,
      })
      setUploadFile(null)
      setSnapshotDate('')
      setUploadOpen(false)
    } catch (e) {
      setAlert({ variant: 'error', title: '업로드 실패', description: String(e) })
    }
  }

  const RESET_LABEL: Record<DataResetScope, string> = {
    transactions_only: '거래만 초기화',
    transactions_and_snapshots: '거래 + 스냅샷 초기화',
  }

  async function handleReset() {
    if (resetConfirm !== RESET_LABEL[resetScope]) return
    try {
      await resetMutation.mutateAsync(resetScope)
      setAlert({ variant: 'success', title: '초기화 완료' })
      setResetConfirm('')
      setDangerOpen(false)
    } catch (e) {
      setAlert({ variant: 'error', title: '초기화 실패', description: String(e) })
    }
  }

  const inputCls = 'text-[10px] text-text-secondary bg-surface-bar border border-border-strong rounded-md px-2.5 py-1.5'
  const editInputCls = 'text-[10px] text-text-primary bg-border-subtle border border-border-strong rounded px-1.5 py-1 w-full'

  return (
    <div className="flex flex-col gap-3">

      {/* Alert */}
      {alert && (
        <AlertBanner
          variant={alert.variant}
          title={alert.title}
          description={alert.description}
          onDismiss={() => setAlert(null)}
        />
      )}

      {/* Read-only warning */}
      {!hasWrite && (
        <AlertBanner
          variant="warn"
          title="읽기 전용 모드"
          description="API 키가 없어 업로드·수정·삭제·초기화가 비활성화됩니다."
        />
      )}

      {/* 필터 바 */}
      <div className="bg-surface-card border border-border rounded-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} w-36`}
            placeholder="🔍  거래처·설명 검색"
            value={filterDraft.search}
            onChange={(e) => setFilterDraft((f) => ({ ...f, search: e.target.value }))}
          />
          <select className={inputCls} value={filterDraft.type} onChange={(e) => setFilterDraft((f) => ({ ...f, type: e.target.value }))}>
            <option value="">거래 유형 전체</option>
            <option>지출</option><option>수입</option><option>이체</option>
          </select>
          <select className={inputCls} value={filterDraft.source} onChange={(e) => setFilterDraft((f) => ({ ...f, source: e.target.value }))}>
            <option value="">입력 출처 전체</option>
            <option value="import">import</option><option value="manual">manual</option>
          </select>
          <select className={inputCls} value={filterDraft.category_major} onChange={(e) => setFilterDraft((f) => ({ ...f, category_major: e.target.value }))}>
            <option value="">대분류 전체</option>
            {filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={inputCls} value={filterDraft.payment_method} onChange={(e) => setFilterDraft((f) => ({ ...f, payment_method: e.target.value }))}>
            <option value="">결제수단 전체</option>
            {filterOptions.data?.payment_method_options.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="w-px h-5 bg-border-strong" />
          <input type="date" className={inputCls} value={filterDraft.start_date} onChange={(e) => setFilterDraft((f) => ({ ...f, start_date: e.target.value }))} />
          <input type="date" className={inputCls} value={filterDraft.end_date} onChange={(e) => setFilterDraft((f) => ({ ...f, end_date: e.target.value }))} />
          <div className="w-px h-5 bg-border-strong" />
          <label className="flex items-center gap-1.5 text-[10px] text-text-faint cursor-pointer">
            <input type="checkbox" checked={filterDraft.include_deleted} onChange={(e) => setFilterDraft((f) => ({ ...f, include_deleted: e.target.checked }))} className="w-3 h-3 accent-accent" />
            삭제 포함
          </label>
          <label className="flex items-center gap-1.5 text-[10px] cursor-pointer text-accent">
            <input type="checkbox" checked={!!filterDraft.is_edited} onChange={(e) => setFilterDraft((f) => ({ ...f, is_edited: e.target.checked ? true : undefined }))} className="w-3 h-3 accent-accent" />
            수정만
          </label>
          <div className="w-px h-5 bg-border-strong" />
          <button onClick={applyFilter} className="text-[10px] px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md">적용</button>
          <button onClick={resetFilter} className="text-[10px] px-3 py-1.5 border border-border-strong text-text-ghost rounded-md">초기화</button>
        </div>
      </div>

      {/* Bulk edit panel */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-[#0a1520] border border-[#1e3a5f] rounded-lg">
          <span className="text-[10px] text-blue-400 font-semibold shrink-0">{selectedIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-border-strong" />
          {(['거래처', '대분류', '소분류', '고정/변동', '필수여부', '메모'] as const).map((label) => {
            const key: keyof EditDraft = label === '거래처' ? 'merchant' : label === '대분류' ? 'category_major_user' : label === '소분류' ? 'category_minor_user' : label === '고정/변동' ? 'cost_kind' : label === '필수여부' ? 'fixed_cost_necessity' : 'memo'
            if (label === '고정/변동') return (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[10px] text-text-faint">{label}</span>
                <select className={`${inputCls} py-1`} value={bulkDraft.cost_kind ?? ''} onChange={(e) => setBulkDraft((b) => ({ ...b, cost_kind: e.target.value as '' | 'fixed' | 'variable' }))}>
                  <option value="">— 선택 —</option><option value="fixed">고정비</option><option value="variable">변동비</option>
                </select>
              </div>
            )
            if (label === '필수여부') return (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[10px] text-text-faint">{label}</span>
                <select className={`${inputCls} py-1`} value={bulkDraft.fixed_cost_necessity ?? ''} onChange={(e) => setBulkDraft((b) => ({ ...b, fixed_cost_necessity: e.target.value as '' | 'essential' | 'discretionary' }))}>
                  <option value="">— 선택 —</option><option value="essential">필수</option><option value="discretionary">비필수</option>
                </select>
              </div>
            )
            return (
              <div key={label} className="flex items-center gap-1.5">
                <span className="text-[10px] text-text-faint">{label}</span>
                <input className={`${inputCls} w-20 py-1`} value={(bulkDraft[key] as string) ?? ''} onChange={(e) => setBulkDraft((b) => ({ ...b, [key]: e.target.value }))} />
              </div>
            )
          })}
          <div className="ml-auto flex gap-2">
            <button onClick={applyBulk} disabled={!hasWrite} className="text-[10px] px-3 py-1.5 bg-accent-dim border border-accent text-accent rounded-md disabled:opacity-40">일괄 적용</button>
            <button onClick={() => { setSelectedIds(new Set()); setBulkDraft({}) }} className="text-[10px] px-3 py-1.5 border border-border-strong text-text-ghost rounded-md">선택 해제</button>
          </div>
        </div>
      )}

      {/* 거래 테이블 */}
      <div className="bg-surface-card border border-border rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="text-[11px] font-semibold text-text-secondary">거래 목록</span>
          <span className="text-[9px] text-text-faint bg-surface-bar border border-border-strong px-2 py-0.5 rounded-full">
            {page} / {Math.ceil((txList.data?.total ?? 0) / 20)} 페이지 · {txList.data?.total ?? 0}건
          </span>
        </div>

        {txList.isLoading ? <LoadingState /> :
         txList.data && txList.data.items.length > 0 ? (
           <div className="overflow-x-auto">
             <table className="w-full border-collapse text-[10px]" style={{ tableLayout: 'fixed' }}>
               <colgroup>
                 <col style={{ width: 28 }} /><col style={{ width: 52 }} />
                 <col style={{ width: 150 }} /><col style={{ width: 100 }} />
                 <col style={{ width: 88 }} /><col style={{ width: 56 }} />
                 <col style={{ width: 58 }} /><col style={{ width: 72 }} />
                 <col style={{ width: 60 }} /><col style={{ width: 80 }} />
                 <col style={{ width: 60 }} />
               </colgroup>
               <thead>
                 <tr>
                   {['', '날짜', '설명', '거래처', '카테고리', '고정/변동', '필수여부', '메모', '상태', '금액', '동작'].map((h, i) => (
                     <th key={i} className="text-[9px] text-text-ghost px-2 py-2 text-left border-b border-border-subtle font-medium">{h}</th>
                   ))}
                 </tr>
               </thead>
               <tbody>
                 {txList.data.items.map((tx) => {
                   const isEditing = editingId === tx.id
                   const isSelected = selectedIds.has(tx.id)
                   const rowClass = tx.is_deleted
                     ? 'opacity-40 line-through'
                     : isSelected ? 'bg-[#0a1a2a]'
                     : isEditing ? 'bg-[#08180e]'
                     : tx.is_edited ? 'bg-[#08180e]'
                     : ''
                   return (
                     <tr key={tx.id} className={`border-b border-[#0d1117] last:border-0 ${rowClass}`}>
                       <td className="px-2 py-2">
                         {!tx.is_deleted && !isEditing && (
                           <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(tx)} className="w-3 h-3 accent-accent" />
                         )}
                       </td>
                       <td className="px-2 py-2 text-text-ghost">{tx.date.slice(5)}</td>
                       {/* 설명: read-only, muted italic */}
                       <td className="px-2 py-2 text-[9.5px] text-text-ghost italic overflow-hidden text-ellipsis whitespace-nowrap">{tx.description}</td>
                       {/* 거래처: same size, editable */}
                       <td className="px-2 py-2">
                         {isEditing
                           ? <input className={editInputCls} value={editDraft.merchant ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, merchant: e.target.value }))} />
                           : <span className="text-text-secondary overflow-hidden text-ellipsis whitespace-nowrap block">{tx.merchant}</span>
                         }
                       </td>
                       <td className="px-2 py-2">
                         {isEditing
                           ? <select className={editInputCls} value={editDraft.category_major_user ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, category_major_user: e.target.value }))}>
                               {filterOptions.data?.category_options.map((c) => <option key={c} value={c}>{c}</option>)}
                             </select>
                           : <span className="text-text-faint">{tx.effective_category_major}</span>
                         }
                       </td>
                       <td className="px-2 py-2">
                         {isEditing
                           ? <select className={editInputCls} value={editDraft.cost_kind ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, cost_kind: e.target.value as '' | 'fixed' | 'variable' }))}>
                               <option value="">—</option><option value="fixed">고정비</option><option value="variable">변동비</option>
                             </select>
                           : <span className="text-[9px] text-text-ghost">{tx.cost_kind === 'fixed' ? '고정비' : tx.cost_kind === 'variable' ? '변동비' : '—'}</span>
                         }
                       </td>
                       <td className="px-2 py-2">
                         {isEditing
                           ? <select className={editInputCls} value={editDraft.fixed_cost_necessity ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, fixed_cost_necessity: e.target.value as '' | 'essential' | 'discretionary' }))}>
                               <option value="">—</option><option value="essential">필수</option><option value="discretionary">비필수</option>
                             </select>
                           : <NecessityBadge value={tx.fixed_cost_necessity} />
                         }
                       </td>
                       <td className="px-2 py-2">
                         {isEditing
                           ? <input className={editInputCls} value={editDraft.memo ?? ''} onChange={(e) => setEditDraft((d) => ({ ...d, memo: e.target.value }))} placeholder="메모" />
                           : <span className="text-text-ghost truncate block">{tx.memo ?? '—'}</span>
                         }
                       </td>
                       <td className="px-2 py-2">
                         <StatusBadge status={tx.is_deleted ? 'deleted' : tx.is_edited ? 'edited' : 'original'} />
                       </td>
                       <td className={`px-2 py-2 text-right font-semibold ${tx.amount < 0 ? 'text-danger' : 'text-accent'}`}>
                         {tx.amount < 0 ? '-' : '+'}₩{formatKRW(tx.amount)}
                       </td>
                       <td className="px-2 py-2 text-center">
                         {tx.is_deleted ? (
                           <button onClick={() => restoreRow(tx.id)} disabled={!hasWrite}
                             className="text-[8px] px-1.5 py-0.5 border border-border-strong text-text-ghost rounded disabled:opacity-40">복원</button>
                         ) : isEditing ? (
                           <div className="flex gap-0.5">
                             <button onClick={() => saveEdit(tx.id)} className="w-5 h-5 rounded border border-accent-muted text-accent text-[10px] flex items-center justify-center">✓</button>
                             <button onClick={() => setEditingId(null)} className="w-5 h-5 rounded border border-border-strong text-text-ghost text-[10px] flex items-center justify-center">✕</button>
                           </div>
                         ) : (
                           <div className="flex gap-0.5">
                             <button onClick={() => startEdit(tx)} disabled={!hasWrite || selectedIds.size > 0}
                               className="w-5 h-5 rounded border border-border-strong text-text-ghost text-[10px] flex items-center justify-center disabled:opacity-30">✎</button>
                             <button onClick={() => deleteRow(tx.id)} disabled={!hasWrite}
                               className="w-5 h-5 rounded border border-danger-muted text-danger-dim text-[10px] flex items-center justify-center disabled:opacity-30">🗑</button>
                           </div>
                         )}
                       </td>
                     </tr>
                   )
                 })}
               </tbody>
             </table>
             <Pagination page={page} perPage={20} total={txList.data.total} onPageChange={setPage} />
           </div>
         ) : <EmptyState message="조건에 맞는 거래가 없습니다" />}
      </div>

      {/* 업로드 아코디언 */}
      <div className="border border-border rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-surface-card cursor-pointer hover:bg-border-subtle"
          onClick={() => setUploadOpen((o) => !o)}>
          <div>
            <div className="text-[11px] font-semibold text-text-secondary">업로드</div>
            <div className="text-[10px] text-text-ghost mt-0.5">BankSalad 엑셀 파일 업로드</div>
          </div>
          <span className="text-text-ghost">{uploadOpen ? '▲' : '▼'}</span>
        </div>
        {uploadOpen && (
          <div className="bg-[#0c1320] border-t border-border p-4 flex flex-col gap-3">
            <label className="flex flex-col items-center justify-center border border-dashed border-border-strong rounded-lg py-5 cursor-pointer hover:bg-border-subtle text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f) }}>
              <span className="text-[11px] text-text-muted mb-1">{uploadFile ? uploadFile.name : '파일을 드래그하거나 클릭해서 선택'}</span>
              <span className="text-[9px] text-text-ghost">.xlsx · 최대 20MB</span>
              <input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && setUploadFile(e.target.files[0])} />
            </label>
            <div className="flex items-end gap-3">
              <div>
                <div className="text-[9px] text-text-faint mb-1">스냅샷 기준일</div>
                <input type="date" className={`${inputCls}`} value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
              </div>
              <button
                onClick={handleUpload}
                disabled={!hasWrite || !uploadFile || !snapshotDate || uploadMutation.isPending}
                className="text-[10px] px-4 py-1.5 bg-accent-dim border border-accent text-accent rounded-md disabled:opacity-40"
              >
                {uploadMutation.isPending ? '업로드 중...' : '업로드 실행'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 업로드 이력 아코디언 */}
      <div className="border border-border rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-surface-card cursor-pointer hover:bg-border-subtle"
          onClick={() => setHistoryOpen((o) => !o)}>
          <div>
            <div className="text-[11px] font-semibold text-text-secondary">최근 업로드 이력</div>
            <div className="text-[10px] text-text-ghost mt-0.5">최근 10건</div>
          </div>
          <span className="text-text-ghost">{historyOpen ? '▲' : '▼'}</span>
        </div>
        {historyOpen && (
          <div className="bg-[#0c1320] border-t border-border overflow-x-auto">
            {uploadLogs.isLoading ? <LoadingState /> :
             uploadLogs.data && uploadLogs.data.items.length > 0 ? (
               <table className="w-full border-collapse text-[10px]">
                 <thead>
                   <tr>{['파일명', '상태', '신규', '스킵', '기준일', '업로드 시각'].map((h) => (
                     <th key={h} className="text-[9px] text-text-ghost px-4 py-2 text-left border-b border-border">{h}</th>
                   ))}</tr>
                 </thead>
                 <tbody>
                   {uploadLogs.data.items.map((log) => (
                     <tr key={log.id} className="border-b border-[#0d1117] last:border-0">
                       <td className="px-4 py-2 text-text-primary">{log.filename ?? '—'}</td>
                       <td className="px-4 py-2">
                         <span className={`text-[8px] px-1.5 py-0.5 rounded ${log.status === 'success' || log.status === 'partial' ? 'bg-accent-dim text-accent' : 'bg-danger-dim text-danger'}`}>
                           {log.status}
                         </span>
                       </td>
                       <td className="px-4 py-2 text-accent">+{log.tx_new ?? 0}</td>
                       <td className="px-4 py-2 text-text-faint">{log.tx_skipped ?? 0}</td>
                       <td className="px-4 py-2 text-text-muted">{log.snapshot_date ?? '—'}</td>
                       <td className="px-4 py-2 text-text-ghost text-right">{log.uploaded_at.slice(0, 16).replace('T', ' ')}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             ) : <EmptyState message="업로드 이력이 없습니다" />}
          </div>
        )}
      </div>

      {/* Danger Zone 아코디언 */}
      <div className="border border-danger-muted rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#120a0a] cursor-pointer"
          onClick={() => setDangerOpen((o) => !o)}>
          <div>
            <div className="text-[11px] font-semibold text-danger">Danger Zone</div>
            <div className="text-[10px] text-[#3b2020] mt-0.5">데이터 초기화 — 되돌릴 수 없습니다</div>
          </div>
          <span className="text-[#3b2020]">{dangerOpen ? '▲' : '▼'}</span>
        </div>
        {dangerOpen && (
          <div className="bg-[#0c0808] border-t border-danger-muted p-4 flex flex-col gap-3">
            <div className="text-[10px] text-text-faint">초기화 범위를 선택하세요. 업로드 이력은 삭제되지 않습니다.</div>
            <div className="grid grid-cols-2 gap-2">
              {(['transactions_only', 'transactions_and_snapshots'] as DataResetScope[]).map((scope) => (
                <button
                  key={scope}
                  onClick={() => setResetScope(scope)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-[10px] ${resetScope === scope ? 'border-danger text-danger bg-[#1a0a0a]' : 'border-border-strong text-text-ghost'}`}
                >
                  <div className="font-semibold mb-0.5">{RESET_LABEL[scope]}</div>
                  <div className="text-[9px] opacity-70">
                    {scope === 'transactions_only' ? '거래 내역만 삭제, 자산 스냅샷 유지' : '모든 데이터 삭제'}
                  </div>
                </button>
              ))}
            </div>
            <div className="text-[9px] text-text-faint">
              "{RESET_LABEL[resetScope]}" 를 입력하여 확인
            </div>
            <input
              className="w-full bg-[#0a0d13] border border-border-strong rounded-lg px-3 py-2 text-[10px] text-text-secondary"
              placeholder="확인 문구를 입력하세요"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
            />
            <button
              onClick={handleReset}
              disabled={!hasWrite || resetConfirm !== RESET_LABEL[resetScope] || resetMutation.isPending}
              className="w-full py-2 bg-danger-dim border border-danger-muted text-danger rounded-lg text-[10px] font-semibold disabled:opacity-40"
            >
              {resetMutation.isPending ? '초기화 중...' : '초기화 실행'}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add -A && git commit -m "[frontend] v2 거래 작업대 페이지"
```

---

## Task 12: 최종 검증 + STATUS 업데이트

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: 전체 테스트 실행**

```bash
cd frontend && npx vitest run
```

Expected: 모든 테스트 통과

- [ ] **Step 2: Lint**

```bash
cd frontend && npm run lint
```

Expected: 경고 없음 (또는 허용 가능한 수준)

- [ ] **Step 3: TypeScript strict 전체 확인**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 4: 빌드**

```bash
cd frontend && npm run build
```

Expected: `built in` 메시지, 오류 없음

- [ ] **Step 5: @heroicons/react 미설치 확인 및 대체**

> Heroicons가 이미 설치되어 있지 않다면:
> ```bash
> cd frontend && npm install @heroicons/react
> ```
> 또는 lucide-react의 동등 아이콘으로 대체:
> ```tsx
> // @heroicons/react → lucide-react 대체 예시
> import { Home, BarChart2, DollarSign, Lightbulb, Settings, Menu, X } from 'lucide-react'
> ```

- [ ] **Step 6: 개발 서버 실행 + 실브라우저 확인**

```bash
cd frontend && npm run dev -- --host 0.0.0.0
```

브라우저에서 `http://100.69.156.40:5173` 접속 후 5개 페이지 확인:
- `/ ` — 개요
- `/analysis/spending` — 지출
- `/analysis/assets` — 자산
- `/analysis/insights` — 인사이트
- `/operations/workbench` — 작업대
- `/spending` → `/analysis/spending` redirect 확인

- [ ] **Step 7: STATUS.md 업데이트**

`docs/STATUS.md` In Progress 항목에 추가:
```
- [ ] feat/frontend-v2 브랜치 구현 진행 중
  - 설계 스펙: docs/superpowers/specs/2026-04-07-frontend-v2-design.md
  - 구현 계획: docs/superpowers/plans/2026-04-07-frontend-v2-implementation.md
  - 현재 지점: Task 1 시작 전
```

- [ ] **Step 8: 최종 커밋**

```bash
git add docs/STATUS.md
git commit -m "[frontend] v2 구현 완료 + 최종 검증"
```

---

## 자체 검토 체크리스트

**스펙 커버리지:**
- [x] Dark Pro 테마 + Tailwind 토큰 — Task 1
- [x] 56px 아이콘 사이드바 + 모바일 drawer — Task 5
- [x] Topbar breadcrumb + meta badge — Task 5
- [x] 5개 페이지 라우트 + legacy redirects — Task 5, 12
- [x] KpiCard / SectionCard / Pagination / 상태 컴포넌트 — Task 4
- [x] 개요 KPI 4개 + 현금흐름 + 신호 + 카테고리 + 최근 거래 — Task 7
- [x] 지출 슬라이더 + stacked bar + 필터 + 카테고리/소분류 + 고정비 카드 + treemap + 달력 + accordion — Task 8
- [x] 자산 KPI + 순자산 추이 + 투자/대출 — Task 9
- [x] 인사이트 KPI + 핵심인사이트 + 반복결제/이상지출 + 거래처 + MoM — Task 10
- [x] 작업대 필터 + 테이블 20건 + 인라인 편집 + bulk edit + 필수여부 + 업로드 + 이력 + Danger Zone — Task 11
- [x] `has_write_access` read-only 모드 — Task 3, 11
- [x] loading/error/empty 상태 독립 처리 — Task 4, 각 페이지

**타입 일관성:**
- `TransactionResponse.cost_kind` → `'fixed' | 'variable' | null` — 스키마 기반 ✓
- `TransactionResponse.fixed_cost_necessity` → `'essential' | 'discretionary' | null` ✓
- `NecessityBadge` props `value: 'essential' | 'discretionary' | null` ✓
- `useTransactionList` params → `TransactionListParams` ✓
