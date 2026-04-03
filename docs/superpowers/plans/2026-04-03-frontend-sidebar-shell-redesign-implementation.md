# Frontend Sidebar Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current top-navigation app shell with a wide `dashboard-01`-style sidebar shell that preserves the existing IA, adds desktop collapse and mobile drawer behavior, and updates shared frontend chrome/documentation consistently.

**Architecture:** The implementation keeps existing page data hooks and route map intact while replacing the navigation shell around them. A single navigation config becomes the source of truth for sidebar rendering, breadcrumbs, active state, and page titles. Shared shell components (`AppSidebar`, `AppTopbar`, `ContentFrame`) own UI state such as sidebar expansion and mobile drawer visibility, while page components become slimmer and rely on shell-provided chrome.

**Tech Stack:** React, React Router, TypeScript, Tailwind CSS, shadcn-style UI primitives, Vitest, Testing Library.

---

## File Structure

### Create

- `frontend/src/app/navigation.ts`
  - Shell navigation config and helpers for breadcrumbs/page titles
- `frontend/src/components/layout/AppSidebar.tsx`
  - Desktop sidebar and collapsed flyout behavior
- `frontend/src/components/layout/AppTopbar.tsx`
  - Thin header with breadcrumb/title/mobile trigger
- `frontend/src/components/layout/MobileSidebarDrawer.tsx`
  - Mobile drawer surface and close/focus behavior
- `frontend/src/components/layout/PageBreadcrumb.tsx`
  - Breadcrumb renderer from navigation config
- `frontend/src/components/layout/ContentFrame.tsx`
  - Wide content width wrapper
- `frontend/src/components/layout/AppShellState.tsx`
  - Shared shell state/context for sidebar expansion and drawer open state
- `frontend/src/components/layout/__tests__/AppSidebar.test.tsx`
- `frontend/src/components/layout/__tests__/AppTopbar.test.tsx`
- `frontend/src/components/layout/__tests__/MobileSidebarDrawer.test.tsx`
- `docs/superpowers/plans/2026-04-03-frontend-sidebar-shell-redesign-implementation.md`
  - This plan document

### Modify

- `frontend/src/app/AppLayout.tsx`
  - Replace top nav shell with sidebar shell
- `frontend/src/app/router.tsx`
  - Keep route map but ensure redirect assumptions still match shell title/breadcrumb rules
- `frontend/src/app/AppLayout.test.tsx`
  - Update shell assertions from top-nav layout to sidebar layout
- `frontend/src/app/router.test.tsx`
  - Update route-level shell assumptions
- `frontend/src/components/layout/PageHeader.tsx`
  - Either slim down or deprecate in favor of shell topbar rules
- `frontend/src/components/layout/PrimarySectionNav.tsx`
- `frontend/src/components/layout/SectionTabNav.tsx`
  - Remove after shell cutover or mark intentionally unused only if a transitional import needs to survive temporarily
- `frontend/src/pages/OverviewPage.tsx`
- `frontend/src/pages/SpendingPage.tsx`
- `frontend/src/pages/AssetsPage.tsx`
- `frontend/src/pages/InsightsPage.tsx`
- `frontend/src/pages/OperationsWorkbenchPage.tsx`
  - Remove duplicated page-level hero/title surfaces and rely on shell topbar
- `docs/frontend/components-and-design-token-inventory.md`
  - Reflect new shell/shared component hierarchy
- `docs/frontend/page-wireframes.md`
  - Reflect sidebar/drawer IA and thin header
- `docs/frontend-design-tokens.md`
  - Add sidebar/topbar/content-frame usage rules if needed
- `docs/STATUS.md`
- `docs/daily/2026-04-03/codex.md`

### Keep Unchanged

- Data hooks:
  - `frontend/src/hooks/useOverview.ts`
  - `frontend/src/hooks/useSpending.ts`
  - `frontend/src/hooks/useInsights.ts`
  - `frontend/src/hooks/useAssets.ts`
  - `frontend/src/hooks/useDataManagement.ts`
- Chart primitives and data APIs
- Canonical route URLs and legacy redirects

---

### Task 1: Lock Navigation Config and Shell State

**Files:**
- Create: `frontend/src/app/navigation.ts`
- Create: `frontend/src/components/layout/AppShellState.tsx`
- Test: `frontend/src/app/router.test.tsx`

- [ ] **Step 1: Write the failing tests for title/breadcrumb derivation**

Add tests that assert:
- `/` resolves to breadcrumb `개요` and title `개요`
- `/analysis/spending` resolves to `분석 / 지출` and title `지출`
- `/analysis/assets` resolves to `분석 / 자산` and title `자산`
- `/analysis/insights` resolves to `분석 / 인사이트` and title `인사이트`
- `/operations/workbench` resolves to `운영 / 거래 작업대` and title `거래 작업대`
- desktop sidebar expansion state restores from localStorage on a fresh provider mount

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- src/app/router.test.tsx`

Expected:
- Failure because navigation config helpers do not exist yet or current shell output does not match new expectations

- [ ] **Step 3: Implement `navigation.ts` and shell state helpers**

Implement:
- typed navigation config for direct and grouped items
- helpers:
  - `getPageTitle(pathname)`
  - `getBreadcrumb(pathname)`
  - `getActiveGroup(pathname)`
- shell UI state context:
  - `sidebarExpanded`
  - `setSidebarExpanded`
  - `mobileSidebarOpen`
  - `setMobileSidebarOpen`
- localStorage persistence for desktop sidebar expansion only, including initial restore on first mount and write-through when toggled

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- src/app/router.test.tsx`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/navigation.ts frontend/src/components/layout/AppShellState.tsx frontend/src/app/router.test.tsx
git commit -m "[frontend] sidebar shell navigation config 추가 (codex)"
```

### Task 2: Build Sidebar and Mobile Drawer Components

**Files:**
- Create: `frontend/src/components/layout/AppSidebar.tsx`
- Create: `frontend/src/components/layout/MobileSidebarDrawer.tsx`
- Create: `frontend/src/components/layout/__tests__/AppSidebar.test.tsx`
- Create: `frontend/src/components/layout/__tests__/MobileSidebarDrawer.test.tsx`

- [ ] **Step 1: Write failing tests for sidebar interactions**

Cover:
- desktop expanded sidebar shows grouped navigation children
- collapsed grouped item opens flyout submenu
- direct route item uses `aria-current="page"`
- mobile drawer opens, closes on item selection, closes on `Escape`
- mobile drawer restores focus to trigger on close

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `cd frontend && npm test -- src/components/layout/__tests__/AppSidebar.test.tsx src/components/layout/__tests__/MobileSidebarDrawer.test.tsx`

Expected:
- Failure because sidebar/drawer components are not implemented yet

- [ ] **Step 3: Implement minimal sidebar/drawer components**

Implement:
- desktop sidebar widths:
  - expanded about `w-64`
  - collapsed about `w-[72px]`
- grouped item behavior:
  - expanded: disclosure button + child links
  - collapsed: icon trigger + flyout child links
- mobile drawer behavior:
  - `role="dialog"`
  - `aria-modal="true"`
  - explicit close button
  - body scroll lock
  - close on route selection

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `cd frontend && npm test -- src/components/layout/__tests__/AppSidebar.test.tsx src/components/layout/__tests__/MobileSidebarDrawer.test.tsx`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppSidebar.tsx frontend/src/components/layout/MobileSidebarDrawer.tsx frontend/src/components/layout/__tests__/AppSidebar.test.tsx frontend/src/components/layout/__tests__/MobileSidebarDrawer.test.tsx
git commit -m "[frontend] sidebar와 mobile drawer 구현 (codex)"
```

### Task 3: Build Thin Topbar and Content Frame

**Files:**
- Create: `frontend/src/components/layout/AppTopbar.tsx`
- Create: `frontend/src/components/layout/PageBreadcrumb.tsx`
- Create: `frontend/src/components/layout/ContentFrame.tsx`
- Create: `frontend/src/components/layout/__tests__/AppTopbar.test.tsx`

- [ ] **Step 1: Write failing tests for topbar chrome**

Cover:
- breadcrumb and title render from shell config
- mobile trigger is visible in drawer mode
- topbar does not render long page descriptions
- optional right-side meta slot can render compact text/badge content

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `cd frontend && npm test -- src/components/layout/__tests__/AppTopbar.test.tsx`

Expected:
- Failure because the new topbar does not exist yet

- [ ] **Step 3: Implement minimal topbar and content frame**

Implement:
- `ContentFrame` with wide `max-w-[1520px]`-class equivalent and consistent horizontal padding
- `PageBreadcrumb` from navigation config
- `AppTopbar` with:
  - hamburger trigger on mobile
  - breadcrumb
  - page title
  - small right-side slot

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `cd frontend && npm test -- src/components/layout/__tests__/AppTopbar.test.tsx`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppTopbar.tsx frontend/src/components/layout/PageBreadcrumb.tsx frontend/src/components/layout/ContentFrame.tsx frontend/src/components/layout/__tests__/AppTopbar.test.tsx
git commit -m "[frontend] thin topbar와 content frame 추가 (codex)"
```

### Task 4: Replace `AppLayout` With Sidebar Shell

**Files:**
- Modify: `frontend/src/app/AppLayout.tsx`
- Modify: `frontend/src/app/AppLayout.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/router.test.tsx`

- [ ] **Step 1: Write failing shell integration tests**

Cover:
- top navigation components are no longer rendered
- sidebar shell is rendered instead
- canonical routes still mount under the new shell
- legacy redirects still land on canonical destinations

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `cd frontend && npm test -- src/app/AppLayout.test.tsx src/app/router.test.tsx`

Expected:
- Failure because `AppLayout` still renders the old top-nav shell

- [ ] **Step 3: Implement minimal shell swap**

Implement:
- remove `PrimarySectionNav` and `SectionTabNav` from `AppLayout`
- wrap content in shell state provider
- render:
  - `AppSidebar`
  - `AppTopbar`
  - `ContentFrame`
  - `Outlet`
- preserve or relocate existing skip-link behavior so keyboard users still have a direct path to main content
- keep existing route map/redirects in `router.tsx`

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `cd frontend && npm test -- src/app/AppLayout.test.tsx src/app/router.test.tsx`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/AppLayout.tsx frontend/src/app/AppLayout.test.tsx frontend/src/app/router.tsx frontend/src/app/router.test.tsx
git commit -m "[frontend] 앱 셸을 sidebar 구조로 교체 (codex)"
```

### Task 5: Migrate Pages Off Hero-Style `PageHeader`

**Files:**
- Modify: `frontend/src/components/layout/PageHeader.tsx`
- Modify: `frontend/src/pages/OverviewPage.tsx`
- Modify: `frontend/src/pages/SpendingPage.tsx`
- Modify: `frontend/src/pages/AssetsPage.tsx`
- Modify: `frontend/src/pages/InsightsPage.tsx`
- Modify: `frontend/src/pages/OperationsWorkbenchPage.tsx`
- Test: `frontend/src/pages/__tests__/OverviewPage.test.tsx`
- Test: `frontend/src/pages/__tests__/SpendingPage.test.tsx`
- Test: `frontend/src/pages/__tests__/AssetsPage.test.tsx`
- Test: `frontend/src/pages/__tests__/InsightsPage.test.tsx`
- Test: `frontend/src/pages/__tests__/OperationsWorkbenchPage.test.tsx`

- [ ] **Step 1: Write failing page tests for thin-header migration**

Add assertions that:
- page-level hero title block is removed or slimmed as specified
- critical descriptions move into first-card descriptions or helper text
- main content starts higher in the viewport structure

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `cd frontend && npm test -- src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/SpendingPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/OperationsWorkbenchPage.test.tsx`

Expected:
- Failure because current pages still render `PageHeader`

- [ ] **Step 3: Implement minimal page migration**

Implement:
- remove page-level title duplication where shell topbar now owns title
- preserve important descriptions by moving them to:
  - first card `CardDescription`
  - lightweight helper text directly above sections
- if `PageHeader` becomes unused, deprecate or simplify it without breaking imports mid-task

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `cd frontend && npm test -- src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/SpendingPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/OperationsWorkbenchPage.test.tsx`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/PageHeader.tsx frontend/src/pages/OverviewPage.tsx frontend/src/pages/SpendingPage.tsx frontend/src/pages/AssetsPage.tsx frontend/src/pages/InsightsPage.tsx frontend/src/pages/OperationsWorkbenchPage.tsx frontend/src/pages/__tests__/OverviewPage.test.tsx frontend/src/pages/__tests__/SpendingPage.test.tsx frontend/src/pages/__tests__/AssetsPage.test.tsx frontend/src/pages/__tests__/InsightsPage.test.tsx frontend/src/pages/__tests__/OperationsWorkbenchPage.test.tsx
git commit -m "[frontend] 페이지 헤더를 thin shell chrome에 맞게 정리 (codex)"
```

### Task 6: Add Interaction and Accessibility Regression Coverage

**Files:**
- Modify: `frontend/src/app/AppLayout.test.tsx`
- Modify: `frontend/src/components/layout/__tests__/AppSidebar.test.tsx`
- Modify: `frontend/src/components/layout/__tests__/MobileSidebarDrawer.test.tsx`

- [ ] **Step 1: Write failing accessibility/interaction tests**

Cover:
- collapsed flyout opens with `Enter` / `Space`
- `Escape` closes flyout
- mobile drawer traps focus while open
- overlay click closes mobile drawer
- body scroll lock toggles correctly

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `cd frontend && npm test -- src/app/AppLayout.test.tsx src/components/layout/__tests__/AppSidebar.test.tsx src/components/layout/__tests__/MobileSidebarDrawer.test.tsx`

Expected:
- Failure because the edge interactions are not fully covered/implemented yet

- [ ] **Step 3: Implement minimal interaction fixes**

Implement only what is needed to satisfy the tests:
- keyboard handlers
- focus restoration
- drawer cleanup behavior
- scroll lock cleanup

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `cd frontend && npm test -- src/app/AppLayout.test.tsx src/components/layout/__tests__/AppSidebar.test.tsx src/components/layout/__tests__/MobileSidebarDrawer.test.tsx`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/AppLayout.test.tsx frontend/src/components/layout/__tests__/AppSidebar.test.tsx frontend/src/components/layout/__tests__/MobileSidebarDrawer.test.tsx
git commit -m "[frontend] sidebar 상호작용 접근성 보강 (codex)"
```

### Task 7: Update Frontend Documentation

**Files:**
- Modify: `docs/frontend/components-and-design-token-inventory.md`
- Modify: `docs/frontend/page-wireframes.md`
- Modify: `docs/frontend-design-tokens.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-03/codex.md`

- [ ] **Step 1: Write the documentation deltas**

Document:
- new shell hierarchy
- sidebar/drawer behavior
- deprecation of old top-nav shell components
- topbar/page chrome changes
- any new shared component boundaries

- [ ] **Step 2: Verify documentation matches implementation**

Read and cross-check:
- `frontend/src/app/AppLayout.tsx`
- `frontend/src/app/navigation.ts`
- `frontend/src/components/layout/*`
- updated page files

Expected:
- docs describe actual implementation, not intended-but-missing behavior

- [ ] **Step 3: Commit**

```bash
git add docs/frontend/components-and-design-token-inventory.md docs/frontend/page-wireframes.md docs/frontend-design-tokens.md docs/STATUS.md docs/daily/2026-04-03/codex.md
git commit -m "[docs] sidebar shell 리디자인 문서 갱신 (codex)"
```

### Task 8: Final Verification and Review Server Check

**Files:**
- No new product files expected

- [ ] **Step 1: Run the full frontend verification suite**

Run:
- `cd frontend && npm test`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`

Expected:
- All pass

- [ ] **Step 2: Run manual shell smoke verification**

Check on desktop and mobile:
- canonical routes mount
- sidebar collapse/expand works
- collapsed group flyout works
- mobile drawer open/close works
- breadcrumb/title reflect current route
- content width is visibly wider than the old shell

- [ ] **Step 3: Re-check the review dev servers if they are still needed**

If backend/frontend dev servers are running:
- verify `http://100.69.156.40:4173`
- verify `/api/v1/health`

- [ ] **Step 4: Commit final polish if needed**

```bash
git add -A
git commit -m "[frontend] sidebar shell 리디자인 마무리 (codex)"
```

---

## Plan Review Checklist

Before implementation starts, confirm:

- grouped nav is implemented as button + child links, not route links
- breadcrumb/title are derived from one navigation config
- `PageHeader` is no longer the canonical page title surface
- mobile drawer accessibility is treated as blocking, not optional polish
- docs update is part of the implementation, not a follow-up
