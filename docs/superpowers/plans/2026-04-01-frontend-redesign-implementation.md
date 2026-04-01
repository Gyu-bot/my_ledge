# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the frontend around the approved `개요 | 분석 | 운영` information architecture, apply the new finance-focused design tokens, and migrate existing dashboard/assets/spending/data functionality into the new route and component structure without regressing current read/write flows.

**Architecture:** Keep the existing React + React Query + typed API layering, but split the UI into a section-aware app shell, route-scoped pages, and a small set of new navigation/layout primitives. Reuse current API modules and data hooks where possible, introduce only the minimum new hooks needed for overview and insights, and migrate legacy routes with redirects instead of carrying two parallel UIs. Treat `docs/frontend-design-tokens.md` and `docs/superpowers/specs/2026-04-01-frontend-redesign-wireframe-design.md` as the only active frontend design references.

**Tech Stack:** React 18, TypeScript, Vite, React Router v6, TanStack Query, Tailwind CSS, shadcn-style primitives, Recharts, Vitest, Testing Library

---

## File Structure

**Create**
- `frontend/src/components/navigation/PrimarySectionNav.tsx` — top-level `개요 | 분석 | 운영` navigation
- `frontend/src/components/navigation/SectionTabNav.tsx` — per-section tab row / mobile scroll tabs
- `frontend/src/components/layout/AsidePanel.tsx` — reusable right-side context panel wrapper
- `frontend/src/components/layout/MetricCardGrid.tsx` — summary card grid wrapper shared across overview/assets/insights
- `frontend/src/components/insights/InsightSummaryCards.tsx` — summary cards for analytics overview
- `frontend/src/components/insights/RecurringPaymentsTable.tsx` — recurring payments table
- `frontend/src/components/insights/SpendingAnomaliesTable.tsx` — anomalies table
- `frontend/src/components/operations/OperationsAccordions.tsx` — upload/history/danger zone accordion stack
- `frontend/src/components/operations/WorkbenchSidebar.tsx` — selection summary / quick actions sidebar
- `frontend/src/hooks/useOverview.ts` — overview page aggregate hook
- `frontend/src/hooks/useInsights.ts` — analytics page hook
- `frontend/src/pages/OverviewPage.tsx` — new home page
- `frontend/src/pages/InsightsPage.tsx` — new analytics insights page
- `frontend/src/pages/OperationsWorkbenchPage.tsx` — new operations landing page
- `frontend/src/pages/__tests__/OverviewPage.test.tsx`
- `frontend/src/pages/__tests__/InsightsPage.test.tsx`
- `frontend/src/pages/__tests__/OperationsWorkbenchPage.test.tsx`

**Modify**
- `frontend/src/index.css` — replace current root tokens with the active finance token set from `docs/frontend-design-tokens.md`
- `frontend/src/app/AppLayout.tsx` — replace flat page nav with section-aware shell
- `frontend/src/app/router.tsx` — add new routes, tab-aware page mapping, and legacy redirects
- `frontend/src/api/dashboard.ts` — repurpose as overview aggregate source or split helper exports cleanly
- `frontend/src/api/assets.ts` — reuse for assets page and overview snapshots
- `frontend/src/api/transactions.ts` — keep existing read/write endpoints, extend usage comments only if needed
- `frontend/src/hooks/useDashboard.ts` — migrate or rename to overview-compatible shaping logic
- `frontend/src/hooks/useAssets.ts` — adapt to new page composition, preserve null-safe normalization
- `frontend/src/hooks/useSpending.ts` — keep existing spending logic, expose only what the new page consumes
- `frontend/src/hooks/useDataManagement.ts` — support operations workbench composition with accordion-first layout
- `frontend/src/pages/DashboardPage.tsx` — convert into thin wrapper or retire in favor of `OverviewPage`
- `frontend/src/pages/AssetsPage.tsx` — restyle within analysis shell
- `frontend/src/pages/SpendingPage.tsx` — restyle within analysis shell
- `frontend/src/pages/DataPage.tsx` — convert into wrapper redirect or remove after route migration
- `frontend/src/app/AppLayout.test.tsx` — update navigation expectations
- `frontend/src/pages/__tests__/DashboardPage.test.tsx` — replace with overview coverage or retire
- `frontend/src/pages/__tests__/AssetsPage.test.tsx`
- `frontend/src/pages/__tests__/SpendingPage.test.tsx`
- `frontend/src/pages/__tests__/DataPage.test.tsx` — replace with operations workbench coverage or retire
- `docs/STATUS.md`
- `docs/daily/2026-04-01/codex.md`

**Keep but Reuse**
- `frontend/src/components/common/*`
- `frontend/src/components/charts/*`
- `frontend/src/components/data/EditableTransactionsTable.tsx`
- `frontend/src/components/filters/*`
- `frontend/src/components/ui/*`

## Task 1: Apply the New Design Tokens and Shared Shell Foundation

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/app/AppLayout.tsx`
- Create: `frontend/src/components/navigation/PrimarySectionNav.tsx`
- Create: `frontend/src/components/navigation/SectionTabNav.tsx`
- Create: `frontend/src/components/layout/AsidePanel.tsx`
- Modify: `frontend/src/app/AppLayout.test.tsx`

- [ ] **Step 1: Write the failing shell navigation test**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../AppLayout';

it('renders section navigation and section tab navigation in the shared shell', () => {
  render(
    <MemoryRouter initialEntries={['/analysis/spending']}>
      <AppLayout />
    </MemoryRouter>,
  );

  expect(screen.getByRole('navigation', { name: /sections/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '개요' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '분석' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '운영' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: /section tabs/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '지출' })).toHaveAttribute('aria-current', 'page');
});
```

- [ ] **Step 2: Run the shell test to verify it fails**

Run: `cd frontend && npm test -- --runInBand src/app/AppLayout.test.tsx`  
Expected: FAIL because the current layout only renders the flat `대시보드 / 자산 / 지출 / 데이터` navigation.

- [ ] **Step 3: Replace root CSS tokens with the approved finance token baseline**

```css
:root {
  color-scheme: light;
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  --color-canvas: #f8fafc;
  --color-surface: #ffffff;
  --color-surface-raised: #ffffff;
  --color-surface-muted: #f1f5f9;
  --color-border: #e2e8f0;
  --color-border-strong: #cbd5e1;

  --color-primary: #2563eb;
  --color-primary-strong: #1d4ed8;
  --color-primary-soft: #dbeafe;
  --color-accent: #0f766e;
  --color-accent-strong: #115e59;
  --color-accent-soft: #ccfbf1;

  --color-text: #0f172a;
  --color-text-muted: #475569;
  --color-text-subtle: #64748b;
  --color-text-inverse: #ffffff;

  --color-positive: #16a34a;
  --color-positive-soft: #dcfce7;
  --color-warning: #d97706;
  --color-warning-soft: #fef3c7;
  --color-danger: #dc2626;
  --color-danger-soft: #fee2e2;
  --color-info: #2563eb;
  --color-info-soft: #dbeafe;

  --color-ring: #2563eb;
  --color-selection: rgba(37, 99, 235, 0.18);

  --shadow-soft: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-medium: 0 4px 10px rgba(15, 23, 42, 0.08);
  --shadow-large: 0 12px 24px rgba(15, 23, 42, 0.12);
  --shadow-overlay: 0 20px 40px rgba(15, 23, 42, 0.18);
}
```

- [ ] **Step 4: Create the new section navigation component**

```tsx
import { NavLink } from 'react-router-dom';

const sections = [
  { label: '개요', to: '/' },
  { label: '분석', to: '/analysis/spending' },
  { label: '운영', to: '/operations/workbench' },
];

export function PrimarySectionNav() {
  return (
    <nav aria-label="Sections" className="flex items-center gap-2 overflow-x-auto">
      {sections.map((section) => (
        <NavLink
          key={section.label}
          to={section.to}
          end={section.to === '/'}
          className={({ isActive }) =>
            [
              'inline-flex h-10 items-center justify-center rounded-[var(--radius-full)] px-4 text-sm font-semibold transition',
              isActive
                ? 'bg-[color:var(--color-primary)] text-[color:var(--color-text-inverse)]'
                : 'border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-primary-soft)] hover:text-[color:var(--color-primary)]',
            ].join(' ')
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Create the per-section tab navigation component**

```tsx
import { NavLink } from 'react-router-dom';

export interface SectionTabItem {
  label: string;
  to: string;
}

export function SectionTabNav({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: SectionTabItem[];
}) {
  return (
    <nav aria-label={ariaLabel} className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <NavLink
          key={item.label}
          to={item.to}
          className={({ isActive }) =>
            [
              'inline-flex h-9 items-center justify-center rounded-[var(--radius-full)] px-4 text-sm font-medium whitespace-nowrap transition',
              isActive
                ? 'bg-[color:var(--color-primary-soft)] text-[color:var(--color-primary)]'
                : 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 6: Refactor `AppLayout` to use the new shell primitives**

```tsx
import { Outlet, useLocation } from 'react-router-dom';
import { PrimarySectionNav } from '../components/navigation/PrimarySectionNav';
import { SectionTabNav, type SectionTabItem } from '../components/navigation/SectionTabNav';

const analysisTabs: SectionTabItem[] = [
  { label: '지출', to: '/analysis/spending' },
  { label: '자산', to: '/analysis/assets' },
  { label: '인사이트', to: '/analysis/insights' },
];

const operationTabs: SectionTabItem[] = [
  { label: '거래 작업대', to: '/operations/workbench' },
];

export function AppLayout() {
  const location = useLocation();
  const sectionTabs =
    location.pathname.startsWith('/analysis')
      ? { ariaLabel: 'Section tabs', items: analysisTabs }
      : location.pathname.startsWith('/operations')
        ? { ariaLabel: 'Section tabs', items: operationTabs }
        : null;

  return (
    <div className="min-h-screen bg-[color:var(--color-canvas)] text-[color:var(--color-text)]">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-text-subtle)]">
                  my_ledge
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight">개인 재무 워크스페이스</h1>
              </div>
              <PrimarySectionNav />
            </div>
            {sectionTabs ? <SectionTabNav ariaLabel={sectionTabs.ariaLabel} items={sectionTabs.items} /> : null}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mt-6 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Re-run shell tests and baseline checks**

Run: `cd frontend && npm test -- --runInBand src/app/AppLayout.test.tsx`  
Expected: PASS

Run: `cd frontend && npm run lint && npm run typecheck`  
Expected: PASS

- [ ] **Step 8: Commit the foundation**

```bash
git add frontend/src/index.css frontend/src/app/AppLayout.tsx frontend/src/app/AppLayout.test.tsx frontend/src/components/navigation frontend/src/components/layout docs/STATUS.md docs/daily/2026-04-01/codex.md
git commit -m "[frontend] 재설계 셸과 디자인 토큰 기반 적용 (codex)"
```

## Task 2: Add the New Route Map and Legacy Redirect Layer

**Files:**
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/DataPage.tsx`
- Create: `frontend/src/pages/OverviewPage.tsx`
- Create: `frontend/src/pages/InsightsPage.tsx`
- Create: `frontend/src/pages/OperationsWorkbenchPage.tsx`
- Create: `frontend/src/pages/__tests__/OverviewPage.test.tsx`
- Create: `frontend/src/pages/__tests__/InsightsPage.test.tsx`
- Create: `frontend/src/pages/__tests__/OperationsWorkbenchPage.test.tsx`

- [ ] **Step 1: Write failing route coverage tests**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRouter } from '../../app/router';

it('routes /analysis/insights to the insights page', () => {
  render(
    <MemoryRouter initialEntries={['/analysis/insights']}>
      <AppRouter />
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: '인사이트' })).toBeInTheDocument();
});

it('redirects /data to /operations/workbench', async () => {
  render(
    <MemoryRouter initialEntries={['/data']}>
      <AppRouter />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: '거래 작업대' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run route tests to verify they fail**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/OperationsWorkbenchPage.test.tsx`  
Expected: FAIL because the routes and pages do not exist yet.

- [ ] **Step 3: Add the new route map**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { OverviewPage } from '../pages/OverviewPage';
import { SpendingPage } from '../pages/SpendingPage';
import { AssetsPage } from '../pages/AssetsPage';
import { InsightsPage } from '../pages/InsightsPage';
import { OperationsWorkbenchPage } from '../pages/OperationsWorkbenchPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/analysis/spending" element={<SpendingPage />} />
        <Route path="/analysis/assets" element={<AssetsPage />} />
        <Route path="/analysis/insights" element={<InsightsPage />} />
        <Route path="/operations/workbench" element={<OperationsWorkbenchPage />} />

        <Route path="/assets" element={<Navigate replace to="/analysis/assets" />} />
        <Route path="/spending" element={<Navigate replace to="/analysis/spending" />} />
        <Route path="/data" element={<Navigate replace to="/operations/workbench" />} />
        <Route path="/dashboard" element={<Navigate replace to="/" />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 4: Create minimal page shells with approved headings**

```tsx
// OverviewPage.tsx
import { PageHeader } from '../components/layout/PageHeader';

export function OverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="개요"
        title="개요"
        description="전체 재무 상태와 최근 변화, 주요 신호를 한 화면에서 확인합니다."
      />
    </div>
  );
}
```

```tsx
// InsightsPage.tsx
import { PageHeader } from '../components/layout/PageHeader';

export function InsightsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="분석"
        title="인사이트"
        description="현금흐름, 안정성, 반복지출, 이상탐지 진단을 모아서 봅니다."
      />
    </div>
  );
}
```

```tsx
// OperationsWorkbenchPage.tsx
import { PageHeader } from '../components/layout/PageHeader';

export function OperationsWorkbenchPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="운영"
        title="거래 작업대"
        description="거래 편집을 우선으로 두고, 보조 운영 작업은 아래 아코디언으로 정리합니다."
      />
    </div>
  );
}
```

- [ ] **Step 5: Re-run route tests**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/OperationsWorkbenchPage.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit route migration**

```bash
git add frontend/src/app/router.tsx frontend/src/pages docs/STATUS.md docs/daily/2026-04-01/codex.md
git commit -m "[frontend] 재설계 라우트와 legacy redirect 추가 (codex)"
```

## Task 3: Build the Overview Page from Current Dashboard + Analytics Signals

**Files:**
- Create: `frontend/src/hooks/useOverview.ts`
- Modify: `frontend/src/api/dashboard.ts`
- Modify: `frontend/src/components/common/StatusCard.tsx`
- Create: `frontend/src/components/layout/MetricCardGrid.tsx`
- Modify: `frontend/src/pages/OverviewPage.tsx`
- Create: `frontend/src/pages/__tests__/OverviewPage.test.tsx`

- [ ] **Step 1: Write a failing overview page test**

```tsx
it('renders overview metrics, monthly cashflow, signal cards, and recent transactions', async () => {
  render(<OverviewPage />);

  expect(await screen.findByText('순자산')).toBeInTheDocument();
  expect(screen.getByText('월간 현금흐름')).toBeInTheDocument();
  expect(screen.getByText('최근 거래')).toBeInTheDocument();
  expect(screen.getByText('주의 신호')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the overview test to verify it fails**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/OverviewPage.test.tsx`  
Expected: FAIL because the page shell does not render the required sections.

- [ ] **Step 3: Add an overview data hook that combines existing dashboard data with analytics summaries**

```tsx
import { useQuery } from '@tanstack/react-query';
import { getDashboardData } from '../api/dashboard';
import { getMonthlyCashflow, getIncomeStability, getRecurringPayments, getSpendingAnomalies } from '../api/analytics';

export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: async () => {
      const [dashboard, cashflow, incomeStability, recurring, anomalies] = await Promise.all([
        getDashboardData(),
        getMonthlyCashflow(),
        getIncomeStability(),
        getRecurringPayments(),
        getSpendingAnomalies(),
      ]);

      return {
        dashboard,
        cashflow,
        incomeStability,
        recurring,
        anomalies,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Add the analytics API helper module if it does not exist yet**

```ts
import { apiRequest } from './client';

export function getMonthlyCashflow() {
  return apiRequest('/analytics/monthly-cashflow');
}

export function getIncomeStability() {
  return apiRequest('/analytics/income-stability');
}

export function getRecurringPayments() {
  return apiRequest('/analytics/recurring-payments');
}

export function getSpendingAnomalies() {
  return apiRequest('/analytics/spending-anomalies');
}
```

- [ ] **Step 5: Implement the overview page composition**

```tsx
export function OverviewPage() {
  const overviewQuery = useOverview();

  if (overviewQuery.isPending) {
    return <LoadingState title="개요 불러오는 중" description="현금흐름과 주요 신호를 정리하고 있습니다." />;
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return <ErrorState title="개요 데이터를 불러올 수 없습니다" description="잠시 후 다시 시도해 주세요." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="개요" title="개요" description="전체 재무 상태와 최근 변화, 주요 신호를 한 화면에서 확인합니다." />
      <MetricCardGrid>
        {/* 순자산 / 이번 달 지출 / 이번 달 수입 / 최근 업로드 */}
      </MetricCardGrid>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        {/* 월간 현금흐름 차트 */}
        {/* 주의 신호 카드 */}
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        {/* 카테고리 Top 5 */}
        {/* 최근 거래 */}
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Re-run overview test and page-level checks**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/OverviewPage.test.tsx`  
Expected: PASS

Run: `cd frontend && npm run lint && npm run typecheck`  
Expected: PASS

- [ ] **Step 7: Commit the overview page**

```bash
git add frontend/src/api frontend/src/hooks/useOverview.ts frontend/src/pages/OverviewPage.tsx frontend/src/components docs/STATUS.md docs/daily/2026-04-01/codex.md
git commit -m "[frontend] 개요 화면과 현금흐름 신호 통합 (codex)"
```

## Task 4: Migrate the Spending and Assets Pages into the Analysis Section

**Files:**
- Modify: `frontend/src/pages/SpendingPage.tsx`
- Modify: `frontend/src/pages/AssetsPage.tsx`
- Modify: `frontend/src/hooks/useSpending.ts`
- Modify: `frontend/src/hooks/useAssets.ts`
- Modify: `frontend/src/pages/__tests__/SpendingPage.test.tsx`
- Modify: `frontend/src/pages/__tests__/AssetsPage.test.tsx`

- [ ] **Step 1: Write failing analysis-section page tests**

```tsx
it('renders spending page under the analysis section with category trend and diagnostics', async () => {
  render(<SpendingPage />);

  expect(await screen.findByText('월별 카테고리 추이')).toBeInTheDocument();
  expect(screen.getByText('결제수단 패턴')).toBeInTheDocument();
});

it('renders assets page under the analysis section with future analytics slots', async () => {
  render(<AssetsPage />);

  expect(await screen.findByText('순자산 추이')).toBeInTheDocument();
  expect(screen.getByText('투자 요약')).toBeInTheDocument();
  expect(screen.getByText('대출 요약')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the page tests to verify the new expectations fail**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/SpendingPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx`  
Expected: FAIL because the pages still carry the old page framing and missing diagnostics labels.

- [ ] **Step 3: Move the spending page into the new analysis framing**

```tsx
<PageHeader
  eyebrow="분석"
  title="지출"
  description="기간별 지출 흐름과 카테고리/결제수단 패턴을 깊게 분석합니다."
/>
```

```tsx
<section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
  {/* 월별 카테고리 추이 */}
  {/* category MoM + fixed cost summary */}
</section>
```

- [ ] **Step 4: Move the assets page into the new analysis framing**

```tsx
<PageHeader
  eyebrow="분석"
  title="자산"
  description="순자산 변화와 투자·대출 상태를 함께 확인합니다."
/>
```

```tsx
<Card>
  <CardHeader>
    <CardTitle>향후 건강도 분석 슬롯</CardTitle>
    <CardDescription>
      net worth breakdown, emergency fund, debt burden, investment performance를 위한 자리입니다.
    </CardDescription>
  </CardHeader>
</Card>
```

- [ ] **Step 5: Re-run analysis page tests**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/SpendingPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit the analysis pages**

```bash
git add frontend/src/pages/SpendingPage.tsx frontend/src/pages/AssetsPage.tsx frontend/src/hooks/useSpending.ts frontend/src/hooks/useAssets.ts frontend/src/pages/__tests__ docs/STATUS.md docs/daily/2026-04-01/codex.md
git commit -m "[frontend] 분석 섹션 지출 자산 화면 재구성 (codex)"
```

## Task 5: Implement the Insights Page Using the Advisor Analytics Endpoints

**Files:**
- Create: `frontend/src/api/analytics.ts`
- Create: `frontend/src/hooks/useInsights.ts`
- Create: `frontend/src/components/insights/InsightSummaryCards.tsx`
- Create: `frontend/src/components/insights/RecurringPaymentsTable.tsx`
- Create: `frontend/src/components/insights/SpendingAnomaliesTable.tsx`
- Modify: `frontend/src/pages/InsightsPage.tsx`
- Create: `frontend/src/pages/__tests__/InsightsPage.test.tsx`

- [ ] **Step 1: Write a failing insights page test**

```tsx
it('renders insight summaries, recurring payments, anomalies, and assumptions', async () => {
  render(<InsightsPage />);

  expect(await screen.findByText('저축률')).toBeInTheDocument();
  expect(screen.getByText('반복 결제')).toBeInTheDocument();
  expect(screen.getByText('이상 지출')).toBeInTheDocument();
  expect(screen.getByText(/assumptions/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the insights test to verify it fails**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/InsightsPage.test.tsx`  
Expected: FAIL because the current page is only a shell.

- [ ] **Step 3: Build the insights hook**

```tsx
import { useQuery } from '@tanstack/react-query';
import {
  getMonthlyCashflow,
  getCategoryMom,
  getFixedCostSummary,
  getMerchantSpend,
  getPaymentMethodPatterns,
  getIncomeStability,
  getRecurringPayments,
  getSpendingAnomalies,
} from '../api/analytics';

export function useInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn: async () => {
      const [cashflow, categoryMom, fixedCost, merchantSpend, paymentPatterns, incomeStability, recurring, anomalies] =
        await Promise.all([
          getMonthlyCashflow(),
          getCategoryMom(),
          getFixedCostSummary(),
          getMerchantSpend(),
          getPaymentMethodPatterns(),
          getIncomeStability(),
          getRecurringPayments(),
          getSpendingAnomalies(),
        ]);

      return { cashflow, categoryMom, fixedCost, merchantSpend, paymentPatterns, incomeStability, recurring, anomalies };
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Implement the insights page layout**

```tsx
<PageHeader
  eyebrow="분석"
  title="인사이트"
  description="현금흐름, 안정성, 반복지출, 이상탐지 진단을 모아서 봅니다."
/>
<MetricCardGrid>
  {/* 저축률 / 수입 변동성 / 이상 카테고리 수 */}
</MetricCardGrid>
<section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
  {/* 핵심 인사이트 리스트 */}
  {/* assumptions 패널 */}
</section>
<section className="grid gap-6 xl:grid-cols-2">
  {/* 반복 결제 표 */}
  {/* 이상 지출 표 */}
</section>
<section className="grid gap-6 xl:grid-cols-2">
  {/* 거래처 소비 Top N */}
  {/* category MoM */}
</section>
```

- [ ] **Step 5: Re-run the insights tests**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/InsightsPage.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit the insights page**

```bash
git add frontend/src/api/analytics.ts frontend/src/hooks/useInsights.ts frontend/src/components/insights frontend/src/pages/InsightsPage.tsx frontend/src/pages/__tests__/InsightsPage.test.tsx docs/STATUS.md docs/daily/2026-04-01/codex.md
git commit -m "[frontend] 인사이트 화면과 analytics endpoint 연결 (codex)"
```

## Task 6: Rebuild Data Management as the Operations Workbench

**Files:**
- Create: `frontend/src/components/operations/OperationsAccordions.tsx`
- Create: `frontend/src/components/operations/WorkbenchSidebar.tsx`
- Modify: `frontend/src/hooks/useDataManagement.ts`
- Modify: `frontend/src/pages/OperationsWorkbenchPage.tsx`
- Modify: `frontend/src/components/data/EditableTransactionsTable.tsx`
- Create: `frontend/src/pages/__tests__/OperationsWorkbenchPage.test.tsx`

- [ ] **Step 1: Write a failing operations workbench test**

```tsx
it('renders the editable transaction workbench first and keeps upload tools collapsed by default', async () => {
  render(<OperationsWorkbenchPage />);

  expect(await screen.findByRole('heading', { name: '거래 작업대' })).toBeInTheDocument();
  expect(screen.getByText('필터 바')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '업로드' })).toHaveAttribute('aria-expanded', 'false');
});
```

- [ ] **Step 2: Run the operations workbench test to verify it fails**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/OperationsWorkbenchPage.test.tsx`  
Expected: FAIL because the page does not yet compose the workbench + accordion layout.

- [ ] **Step 3: Implement the accordion stack component**

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

export function OperationsAccordions() {
  return (
    <Accordion type="multiple" className="space-y-3">
      <AccordionItem value="upload">
        <AccordionTrigger>업로드</AccordionTrigger>
        <AccordionContent>{/* upload form + latest result */}</AccordionContent>
      </AccordionItem>
      <AccordionItem value="history">
        <AccordionTrigger>최근 업로드 이력</AccordionTrigger>
        <AccordionContent>{/* upload logs */}</AccordionContent>
      </AccordionItem>
      <AccordionItem value="danger">
        <AccordionTrigger className="text-[color:var(--color-danger)]">Danger Zone</AccordionTrigger>
        <AccordionContent>{/* reset controls */}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
```

- [ ] **Step 4: Compose the operations workbench page around the existing data hook**

```tsx
export function OperationsWorkbenchPage() {
  const dataManagementQuery = useDataManagement();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="운영"
        title="거래 작업대"
        description="거래 편집을 우선으로 두고, 보조 운영 작업은 아래 아코디언으로 정리합니다."
      />
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <Card>{/* filter bar + bulk toolbar + editable table */}</Card>
        <WorkbenchSidebar />
      </section>
      <OperationsAccordions />
    </div>
  );
}
```

- [ ] **Step 5: Re-run operations tests and the existing data-management tests**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/OperationsWorkbenchPage.test.tsx src/hooks/__tests__/useDataManagement.test.tsx`  
Expected: PASS

- [ ] **Step 6: Commit the operations workbench**

```bash
git add frontend/src/components/operations frontend/src/hooks/useDataManagement.ts frontend/src/pages/OperationsWorkbenchPage.tsx frontend/src/components/data/EditableTransactionsTable.tsx frontend/src/pages/__tests__/OperationsWorkbenchPage.test.tsx docs/STATUS.md docs/daily/2026-04-01/codex.md
git commit -m "[frontend] 운영 거래 작업대와 보조 아코디언 재구성 (codex)"
```

## Task 7: Finalize Legacy Cleanup, Regression Coverage, and Documentation

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/DataPage.tsx`
- Modify: `frontend/src/pages/PlaceholderApp.tsx`
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-01/codex.md`
- Modify: `docs/frontend-design-tokens.md`
- Modify: `docs/superpowers/specs/2026-04-01-frontend-redesign-wireframe-design.md`

- [ ] **Step 1: Write a failing redirect/regression test bundle**

```tsx
it('redirects legacy routes to the new structure without losing page content', async () => {
  render(
    <MemoryRouter initialEntries={['/spending']}>
      <AppRouter />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: '지출' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the regression tests to verify they fail where expected**

Run: `cd frontend && npm test -- --runInBand src/app/AppLayout.test.tsx src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/OperationsWorkbenchPage.test.tsx src/pages/__tests__/SpendingPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx`  
Expected: Any remaining failures identify unhandled route or UI regressions.

- [ ] **Step 3: Remove or retire obsolete page shells**

```tsx
// DashboardPage.tsx
export { OverviewPage as DashboardPage } from './OverviewPage';

// DataPage.tsx
export { OperationsWorkbenchPage as DataPage } from './OperationsWorkbenchPage';
```

- [ ] **Step 4: Run the full frontend verification suite**

Run: `cd frontend && npm test -- --runInBand`  
Expected: PASS

Run: `cd frontend && npm run lint`  
Expected: PASS

Run: `cd frontend && npm run typecheck`  
Expected: PASS

Run: `cd frontend && npm run build`  
Expected: PASS with no new fatal errors; existing bundle warnings must be reviewed and noted if still present.

- [ ] **Step 5: Update implementation docs**

```md
- Mark the redesign plan as executed or partially executed in `docs/STATUS.md`
- Append the execution summary and verification commands to `docs/daily/YYYY-MM-DD/codex.md`
- If token values drifted during implementation, update `docs/frontend-design-tokens.md`
- If route strategy changed, update `docs/superpowers/specs/2026-04-01-frontend-redesign-wireframe-design.md`
```

- [ ] **Step 6: Commit the final migration batch**

```bash
git add frontend/src docs/STATUS.md docs/daily/2026-04-01/codex.md docs/frontend-design-tokens.md docs/superpowers/specs/2026-04-01-frontend-redesign-wireframe-design.md
git commit -m "[frontend] 재설계 구조 마이그레이션 마무리 (codex)"
```

## Self-Review

### Spec coverage

- `개요 | 분석 | 운영` 전역 구조: Task 1, Task 2
- `분석 > 지출 | 자산 | 인사이트`: Task 2, Task 4, Task 5
- `운영 > 거래 작업대` 우선 + 아코디언 보조 기능: Task 2, Task 6
- 새 디자인 토큰 문서 적용: Task 1, Task 7
- legacy route 유지/redirect: Task 2, Task 7
- analytics endpoint 공식 소비처 추가: Task 3, Task 5

### Placeholder scan

- No `TBD`, `TODO`, or “implement later” placeholders were left in the tasks.
- Every task names exact files and verification commands.
- Code-bearing steps include concrete code blocks or code skeletons.

### Type consistency

- New navigation primitives consistently use `PrimarySectionNav` and `SectionTabNav`.
- New pages consistently use `OverviewPage`, `InsightsPage`, and `OperationsWorkbenchPage`.
- New hooks consistently use `useOverview` and `useInsights`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-01-frontend-redesign-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
