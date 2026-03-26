# Phase 2 Dashboard Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 2 frontend dashboard core on top of the completed canonical backend APIs, starting with shared app structure and then delivering dashboard, assets, spending, and data-management pages in priority order.

**Architecture:** The frontend should move from a single placeholder page to a routed React application with a shared layout, typed API client layer, React Query hooks, and reusable chart/table/filter components. Read-heavy screens should consume the canonical backend surfaces first, while write-heavy flows in the data-management page should use the existing transaction edit/upload APIs. UI should follow the `ui-ux-pro-max` recommended “Data-Dense Dashboard” direction: bright finance dashboard, blue primary palette, amber highlights, Fira typography, and accessibility-first interactions.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, Recharts, Vitest, Testing Library

---

## File Structure

- Modify: `frontend/package.json` — add runtime dependencies for routing, query, and charts.
- Modify: `frontend/src/App.tsx` — replace placeholder-only mount with providers/router shell.
- Modify: `frontend/src/main.tsx` — keep top-level bootstrap but ensure provider composition is stable.
- Modify: `frontend/src/index.css` — define Phase 2 design tokens, layout utilities, and accessibility helpers.
- Create: `frontend/src/app/AppProviders.tsx` — query client provider and global wrappers.
- Create: `frontend/src/app/AppLayout.tsx` — shared shell, navigation, page container, skip link.
- Create: `frontend/src/app/router.tsx` — route definitions.
- Create: `frontend/src/api/client.ts` — base fetch helper and API error handling.
- Create: `frontend/src/api/dashboard.ts`
- Create: `frontend/src/api/assets.ts`
- Create: `frontend/src/api/transactions.ts`
- Create: `frontend/src/api/upload.ts`
- Create: `frontend/src/hooks/useDashboard.ts`
- Create: `frontend/src/hooks/useAssets.ts`
- Create: `frontend/src/hooks/useSpending.ts`
- Create: `frontend/src/hooks/useDataManagement.ts`
- Create: `frontend/src/types/dashboard.ts`
- Create: `frontend/src/types/assets.ts`
- Create: `frontend/src/types/transactions.ts`
- Create: `frontend/src/components/layout/PageHeader.tsx`
- Create: `frontend/src/components/common/StatusCard.tsx`
- Create: `frontend/src/components/common/EmptyState.tsx`
- Create: `frontend/src/components/common/LoadingState.tsx`
- Create: `frontend/src/components/common/ErrorState.tsx`
- Create: `frontend/src/components/charts/LineTrendChart.tsx`
- Create: `frontend/src/components/charts/CategoryDonutChart.tsx`
- Create: `frontend/src/components/charts/HorizontalBarChart.tsx`
- Create: `frontend/src/components/tables/TransactionsTable.tsx`
- Create: `frontend/src/components/filters/DateRangeFilter.tsx`
- Create: `frontend/src/components/filters/TransactionFilterBar.tsx`
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/pages/AssetsPage.tsx`
- Create: `frontend/src/pages/SpendingPage.tsx`
- Create: `frontend/src/pages/DataPage.tsx`
- Create: `frontend/src/pages/__tests__/DashboardPage.test.tsx`
- Create: `frontend/src/pages/__tests__/AssetsPage.test.tsx`
- Create: `frontend/src/pages/__tests__/SpendingPage.test.tsx`
- Create: `frontend/src/pages/__tests__/DataPage.test.tsx`
- Modify: `STATUS.md` — keep Phase 2 task progress and next-up aligned.

### Task 1: Build the Phase 2 App Shell and Data Foundation

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/app/AppProviders.tsx`
- Create: `frontend/src/app/AppLayout.tsx`
- Create: `frontend/src/app/router.tsx`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/types/dashboard.ts`
- Create: `frontend/src/types/assets.ts`
- Create: `frontend/src/types/transactions.ts`
- Test: `frontend/src/pages/PlaceholderApp.test.tsx`

- [ ] **Step 1: Write a failing routing shell test**

```tsx
it('renders the shared navigation and dashboard route by default', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /personal finance dashboard/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --runInBand src/pages/PlaceholderApp.test.tsx`
Expected: FAIL because the routed shell does not exist yet.

- [ ] **Step 3: Add runtime dependencies**

```json
{
  "dependencies": {
    "@tanstack/react-query": "...",
    "react-router-dom": "...",
    "recharts": "..."
  }
}
```

- [ ] **Step 4: Implement the shared app shell**

Implement:
- `AppProviders` with a stable `QueryClient`
- `AppLayout` with skip link, top navigation, and main content container
- `router.tsx` with routes for `/`, `/assets`, `/spending`, `/data`
- design tokens in `index.css` aligned to the chosen finance dashboard palette

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- --runInBand src/pages/PlaceholderApp.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run foundation checks**

Run: `cd frontend && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/src STATUS.md
git commit -m "[frontend] Phase 2 앱 셸과 데이터 기반 추가 (codex)"
```

### Task 2: Implement the Main Dashboard

**Files:**
- Create: `frontend/src/api/dashboard.ts`
- Create: `frontend/src/hooks/useDashboard.ts`
- Create: `frontend/src/components/layout/PageHeader.tsx`
- Create: `frontend/src/components/common/StatusCard.tsx`
- Create: `frontend/src/components/common/LoadingState.tsx`
- Create: `frontend/src/components/common/ErrorState.tsx`
- Create: `frontend/src/components/charts/LineTrendChart.tsx`
- Create: `frontend/src/components/charts/CategoryDonutChart.tsx`
- Create: `frontend/src/components/tables/TransactionsTable.tsx`
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/pages/__tests__/DashboardPage.test.tsx`

- [ ] **Step 1: Write a failing dashboard render test**

```tsx
it('renders summary cards, a monthly trend chart, and recent transactions', async () => {
  render(<DashboardPage />);
  expect(await screen.findByText(/net worth/i)).toBeInTheDocument();
  expect(screen.getByText(/recent transactions/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/DashboardPage.test.tsx`
Expected: FAIL because the page and dashboard hook do not exist yet.

- [ ] **Step 3: Implement the dashboard query + UI**

Use:
- assets endpoints for top-level net-worth summary
- transaction summary/category/payment method endpoints for charts
- recent transactions list from `/api/v1/transactions`

Follow design constraints:
- dense KPI card grid
- line/area chart for month trend
- donut for category composition
- explicit loading and empty states

- [ ] **Step 4: Run dashboard test**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/DashboardPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run lint/typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src STATUS.md
git commit -m "[frontend] 메인 대시보드 화면 구현 (codex)"
```

### Task 3: Implement the Assets Page

**Files:**
- Create: `frontend/src/api/assets.ts`
- Create: `frontend/src/hooks/useAssets.ts`
- Create: `frontend/src/components/charts/HorizontalBarChart.tsx`
- Create: `frontend/src/pages/AssetsPage.tsx`
- Create: `frontend/src/pages/__tests__/AssetsPage.test.tsx`

- [ ] **Step 1: Write a failing assets page test**

```tsx
it('renders net worth history, investment summary, and loan summary', async () => {
  render(<AssetsPage />);
  expect(await screen.findByText(/net worth history/i)).toBeInTheDocument();
  expect(screen.getByText(/investments/i)).toBeInTheDocument();
  expect(screen.getByText(/loans/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/AssetsPage.test.tsx`
Expected: FAIL because the assets page does not exist yet.

- [ ] **Step 3: Implement the assets page**

Use:
- `/api/v1/assets/net-worth-history`
- `/api/v1/investments/summary`
- `/api/v1/loans/summary`

UI sections:
- net worth line chart
- investment table/list
- loan balance + rate summary

- [ ] **Step 4: Run assets page test**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/AssetsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run lint/typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src STATUS.md
git commit -m "[frontend] 자산 현황 페이지 구현 (codex)"
```

### Task 4: Implement the Spending Page

**Files:**
- Create: `frontend/src/api/transactions.ts`
- Create: `frontend/src/hooks/useSpending.ts`
- Create: `frontend/src/components/filters/DateRangeFilter.tsx`
- Create: `frontend/src/components/filters/TransactionFilterBar.tsx`
- Create: `frontend/src/pages/SpendingPage.tsx`
- Create: `frontend/src/pages/__tests__/SpendingPage.test.tsx`

- [ ] **Step 1: Write a failing spending page test**

```tsx
it('renders spend filters, category chart, payment-method chart, and transactions table', async () => {
  render(<SpendingPage />);
  expect(await screen.findByLabelText(/start date/i)).toBeInTheDocument();
  expect(screen.getByText(/payment methods/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/SpendingPage.test.tsx`
Expected: FAIL because the spending page and filters do not exist yet.

- [ ] **Step 3: Implement spending page**

Use:
- `/api/v1/transactions/summary`
- `/api/v1/transactions/by-category`
- `/api/v1/transactions/payment-methods`
- `/api/v1/transactions`

Behavior:
- date range filter
- category/payment method filtering
- table fallback for mobile overflow
- no hover-only actions

- [ ] **Step 4: Run spending page test**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/SpendingPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run lint/typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src STATUS.md
git commit -m "[frontend] 지출 분석 페이지 구현 (codex)"
```

### Task 5: Implement the Data Management Page

**Files:**
- Create: `frontend/src/api/upload.ts`
- Create: `frontend/src/hooks/useDataManagement.ts`
- Create: `frontend/src/pages/DataPage.tsx`
- Create: `frontend/src/pages/__tests__/DataPage.test.tsx`
- Modify: `frontend/src/components/tables/TransactionsTable.tsx`

- [ ] **Step 1: Write a failing data page test**

```tsx
it('renders upload controls, editable transaction table, and upload history', async () => {
  render(<DataPage />);
  expect(await screen.findByRole('button', { name: /upload/i })).toBeInTheDocument();
  expect(screen.getByText(/upload history/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/DataPage.test.tsx`
Expected: FAIL because the data page does not exist yet.

- [ ] **Step 3: Implement data management page**

Use:
- upload API
- transactions list/update/delete/restore/bulk-update endpoints
- upload log results already returned by upload flow

UI behavior:
- drag-and-drop upload or file picker
- inline edit affordances with explicit save/cancel
- edited-row emphasis without relying only on color
- mobile-safe table wrapper

- [ ] **Step 4: Run data page test**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/DataPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run lint/typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src STATUS.md
git commit -m "[frontend] 데이터 관리 페이지 구현 (codex)"
```

### Task 6: Final Frontend Verification and Status Sync

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Run frontend tests**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 2: Run frontend lint and typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 4: Update STATUS.md with actual Phase 2 execution state**

Reflect:
- last completed task
- remaining Phase 2 pages
- blockers if any

- [ ] **Step 5: Commit**

```bash
git add frontend STATUS.md
git commit -m "[docs] Phase 2 dashboard core 진행 상태 갱신 (codex)"
```

## Notes for the Implementer

- Use `@ui-ux-pro-max` at the start of each real UI design/build task, not just once at Phase 2 kickoff.
- Keep canonical backend surfaces as the default read path.
- Raw transaction tables remain available for audit/debug semantics, but the frontend should not treat raw rows as its primary analysis model.
- Recharts only. Do not add other chart libraries.
- Treat mobile table overflow as a first-class requirement from the first implementation pass.
