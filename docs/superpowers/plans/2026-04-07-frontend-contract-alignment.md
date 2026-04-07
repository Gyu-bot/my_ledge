# Frontend Contract Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align frontend runtime config, API query contracts, and legacy route handling with the current backend and deployment behavior without changing the visual design.

**Architecture:** Keep the fix frontend-local. Normalize runtime config reading in `apiClient`, add thin month-to-date adapters in the frontend API/hooks layer, replace the missing `daily-spend` endpoint with client-side aggregation over the existing transactions list API, and absorb stale links through router redirects instead of inventing new live pages.

**Tech Stack:** React, React Router, TanStack Query, Vitest, TypeScript, Vite runtime config

---

### Task 1: Lock Runtime Config Contract With Tests

**Files:**
- Create: `frontend/src/test/lib/apiClient.test.ts`
- Modify: `frontend/src/lib/apiClient.ts`
- Test: `frontend/src/test/lib/apiClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, hasWriteAccess } from '../../lib/apiClient'

describe('apiClient runtime config contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    delete (window as Window & { __MY_LEDGE_RUNTIME_CONFIG__?: unknown }).__MY_LEDGE_RUNTIME_CONFIG__
  })

  it('prefers __MY_LEDGE_RUNTIME_CONFIG__ apiKey and apiBaseUrl', async () => {
    ;(window as Window & {
      __MY_LEDGE_RUNTIME_CONFIG__?: { apiKey?: string; apiBaseUrl?: string }
    }).__MY_LEDGE_RUNTIME_CONFIG__ = {
      apiKey: 'runtime-key',
      apiBaseUrl: '/runtime-api',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/health')

    expect(fetchMock).toHaveBeenCalledWith(
      '/runtime-api/health',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )
    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('X-API-Key')).toBe('runtime-key')
    expect(hasWriteAccess()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/test/lib/apiClient.test.ts`
Expected: FAIL because `apiClient.ts` still reads `__RUNTIME_CONFIG__.API_KEY` and hardcodes `/api/v1`

- [ ] **Step 3: Write minimal implementation**

```ts
const runtimeConfig = (window as Window & {
  __MY_LEDGE_RUNTIME_CONFIG__?: { apiKey?: string; apiBaseUrl?: string }
}).__MY_LEDGE_RUNTIME_CONFIG__

const API_BASE = runtimeConfig?.apiBaseUrl ?? '/api/v1'

function getApiKey(): string | undefined {
  return runtimeConfig?.apiKey ?? import.meta.env.VITE_API_KEY
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/test/lib/apiClient.test.ts`
Expected: PASS

### Task 2: Lock Date-Range Query Contract With Tests

**Files:**
- Create: `frontend/src/test/api/contracts.test.ts`
- Modify: `frontend/src/api/transactions.ts`
- Modify: `frontend/src/api/analytics.ts`
- Modify: `frontend/src/hooks/useTransactions.ts`
- Modify: `frontend/src/hooks/useAnalytics.ts`
- Modify: `frontend/src/types/transaction.ts`
- Test: `frontend/src/test/api/contracts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyticsApi } from '../../api/analytics'
import { transactionApi } from '../../api/transactions'

describe('frontend query contract adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps month-based analytics queries to backend start_date/end_date', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await analyticsApi.monthlyCashflow({ months: 6 })
    await analyticsApi.fixedCostSummary({ start_month: '2026-01', end_month: '2026-03' })
    await analyticsApi.merchantSpend({ months: 3, limit: 5 })

    expect(fetchMock.mock.calls[0][0]).toContain('/analytics/monthly-cashflow?')
    expect(fetchMock.mock.calls[0][0]).toContain('start_date=')
    expect(fetchMock.mock.calls[0][0]).toContain('end_date=')
    expect(fetchMock.mock.calls[1][0]).toContain('start_date=2026-01-01')
    expect(fetchMock.mock.calls[1][0]).toContain('end_date=2026-03-31')
    expect(fetchMock.mock.calls[2][0]).toContain('limit=5')
    expect(fetchMock.mock.calls[2][0]).not.toContain('months=')
  })

  it('replaces missing daily-spend endpoint with transactions list query', async () => {
    const payload = {
      total: 2,
      page: 1,
      per_page: 200,
      items: [
        { id: 1, date: '2026-03-05', amount: -1000 },
        { id: 2, date: '2026-03-05', amount: 300 },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await transactionApi.dailySpend({ month: '2026-03', include_income: true })

    expect(fetchMock.mock.calls[0][0]).toContain('/transactions?')
    expect(fetchMock.mock.calls[0][0]).toContain('start_date=2026-03-01')
    expect(fetchMock.mock.calls[0][0]).toContain('end_date=2026-03-31')
    expect(result.items).toEqual([{ date: '2026-03-05', amount: -700 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/test/api/contracts.test.ts`
Expected: FAIL because current API layer still sends `months`, `start_month`, `end_month`, and `/transactions/daily-spend`

- [ ] **Step 3: Write minimal implementation**

```ts
function monthToDateRange(month: string) {
  const start = `${month}-01`
  const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  return {
    start_date: start,
    end_date: `${month}-${String(end.getDate()).padStart(2, '0')}`,
  }
}
```

```ts
dailySpend: async ({ month, include_income }) => {
  const range = monthToDateRange(month)
  const response = await apiFetch<TransactionListResponse>(`/transactions${buildQuery({
    ...range,
    type: include_income ? 'all' : '지출',
    page: 1,
    per_page: 200,
  })}`)
  return aggregateDailySpend(response.items)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/test/api/contracts.test.ts`
Expected: PASS

### Task 3: Lock Legacy Route Fallback With Tests

**Files:**
- Create: `frontend/src/test/router.test.tsx`
- Modify: `frontend/src/router.tsx`
- Modify: `docs/frontend/page-wireframes.md`
- Modify: `docs/frontend-reimplementation-wireframe-functional-requirements.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-07/codex.md`
- Test: `frontend/src/test/router.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { router } from '../../router'

describe('legacy route fallbacks', () => {
  it('redirects legacy income and transfers routes to overview', async () => {
    const memoryRouter = createMemoryRouter(router.routes, {
      initialEntries: ['/income'],
    })

    render(<RouterProvider router={memoryRouter} />)

    await screen.findByText('순자산')
    expect(memoryRouter.state.location.pathname).toBe('/')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/test/router.test.tsx`
Expected: FAIL because `/income` currently falls through `*` rather than being explicit, and `/transfers` is undocumented drift

- [ ] **Step 3: Write minimal implementation**

```tsx
{ path: '/income', element: <Navigate to="/" replace /> },
{ path: '/transfers', element: <Navigate to="/" replace /> },
```

Update docs to state clearly that these routes are not live pages and are intentionally redirected to overview.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/test/router.test.tsx`
Expected: PASS

### Task 4: Full Verification

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-07/codex.md`

- [ ] **Step 1: Run focused frontend tests**

Run: `cd frontend && npm test -- src/test/lib/apiClient.test.ts src/test/api/contracts.test.ts src/test/router.test.tsx src/test/hooks/useWriteAccess.test.ts src/test/pages/OverviewPage.test.tsx`
Expected: PASS

- [ ] **Step 2: Run full frontend verification**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Update status and daily log**

Document:
- runtime config contract aligned
- month/date query contract aligned
- `daily-spend` replaced with client aggregation over existing transactions API
- `/income`, `/transfers` fallback policy documented and implemented
