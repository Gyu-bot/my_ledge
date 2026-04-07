# Frontend UI/IA Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved frontend UI/IA decisions to the live frontend by unifying shell metadata, stabilizing `SpendingPage` filter ownership and correctness, and enforcing shared interaction rules on the most fragile surfaces.

**Architecture:** Centralize route metadata in one manifest, make `SpendingPage` state ownership explicit, and standardize card/query-state interaction patterns before additional polish or analytics features. Keep backend contracts unchanged and reuse the existing React Query/API layer where possible.

**Tech Stack:** React 18, React Router, TanStack Query, TypeScript, Tailwind CSS, Vitest, Testing Library

---

## File Structure

- Modify: `frontend/src/router.tsx`
  - Router should consume route metadata from one source instead of hardcoding page definitions independently.
- Create: `frontend/src/navigation.ts`
  - Single source of truth for canonical routes, labels, breadcrumb/title metadata, and nav visibility.
- Modify: `frontend/src/components/layout/AppSidebar.tsx`
  - Replace icon-only rail with labeled standard sidebar consuming the route manifest.
- Modify: `frontend/src/components/layout/MobileDrawer.tsx`
  - Consume the same route manifest and preserve the same grouping vocabulary as desktop.
- Modify: `frontend/src/components/layout/AppTopbar.tsx`
  - Consume the route manifest and remain limited to breadcrumb/title/meta.
- Modify: `frontend/src/components/layout/chromeContext.ts`
  - Keep meta injection narrow and predictable.
- Modify: `frontend/src/components/ui/SectionCard.tsx`
  - Support consistent `title/meta/action/description/body` usage.
- Modify: `frontend/src/components/ui/RangeSlider.tsx`
  - Make it controlled and fix handle interaction.
- Modify: `frontend/src/pages/SpendingPage.tsx`
  - Split state ownership, fix subcategory behavior, sync treemap period, normalize section query-state rendering.
- Modify: `frontend/src/pages/InsightsPage.tsx`
  - Align card header/state handling with the shared interaction spec.
- Modify: `frontend/src/pages/WorkbenchPage.tsx`
  - Clarify filter/bulk/table/accordion boundaries and normalize query-state rendering.
- Modify: `frontend/src/test/router.test.tsx`
  - Verify route manifest-driven redirects and canonical routes.
- Create or modify: `frontend/src/test/components/layout/AppTopbar.test.tsx`
  - Verify manifest-driven title/breadcrumb behavior.
- Create or modify: `frontend/src/test/pages/SpendingPage.test.tsx`
  - Cover range ownership, timeline/detail separation, and treemap/detail sync.
- Create or modify: `frontend/src/test/pages/WorkbenchPage.test.tsx`
  - Cover read-only gating and bulk panel behavior.

## Task 1: Create the route manifest and move shell metadata to it

**Files:**
- Create: `frontend/src/navigation.ts`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/layout/AppSidebar.tsx`
- Modify: `frontend/src/components/layout/MobileDrawer.tsx`
- Modify: `frontend/src/components/layout/AppTopbar.tsx`
- Test: `frontend/src/test/router.test.tsx`
- Test: `frontend/src/test/components/layout/AppTopbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Write tests that assert:
- canonical route metadata comes from one manifest
- `/analysis/spending` shows the same label/title in sidebar, mobile drawer, and topbar
- `/income`, `/transfers`, `/data` legacy redirects still resolve correctly

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- src/test/router.test.tsx src/test/components/layout/AppTopbar.test.tsx`
Expected: FAIL because the new manifest contract and topbar test do not exist yet.

- [ ] **Step 3: Implement the route manifest**

Create `frontend/src/navigation.ts` with one exported manifest for all canonical routes and nav sections. Move breadcrumb/title/nav label data out of `AppTopbar.tsx`, and update router/sidebar/mobile drawer to consume it.

- [ ] **Step 4: Run the focused tests**

Run: `cd frontend && npm test -- src/test/router.test.tsx src/test/components/layout/AppTopbar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/navigation.ts frontend/src/router.tsx frontend/src/components/layout/AppSidebar.tsx frontend/src/components/layout/MobileDrawer.tsx frontend/src/components/layout/AppTopbar.tsx frontend/src/test/router.test.tsx frontend/src/test/components/layout/AppTopbar.test.tsx
git commit -m "[frontend] unify shell route manifest (codex)"
```

## Task 2: Stabilize `SpendingPage` state ownership and range interaction

**Files:**
- Modify: `frontend/src/components/ui/RangeSlider.tsx`
- Modify: `frontend/src/pages/SpendingPage.tsx`
- Test: `frontend/src/test/pages/SpendingPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Write tests that assert:
- the slider reflects parent-provided values and updates when the parent value changes
- changing `detail range` updates treemap/breakdown/table queries together
- changing `calendar month` does not alter other section queries

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- src/test/pages/SpendingPage.test.tsx`
Expected: FAIL because the current slider and page query ownership do not satisfy those behaviors.

- [ ] **Step 3: Implement the minimal state refactor**

Make `RangeSlider` controlled, remove stale internal draft ownership, and restructure `SpendingPage` so:
- timeline range is section-specific
- detail range and income toggle are page-global
- calendar month and category drill-down remain local

- [ ] **Step 4: Run the focused tests**

Run: `cd frontend && npm test -- src/test/pages/SpendingPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/RangeSlider.tsx frontend/src/pages/SpendingPage.tsx frontend/src/test/pages/SpendingPage.test.tsx
git commit -m "[frontend] stabilize spending filter ownership (codex)"
```

## Task 3: Fix `SpendingPage` correctness gaps and shared card state behavior

**Files:**
- Modify: `frontend/src/pages/SpendingPage.tsx`
- Modify: `frontend/src/components/ui/SectionCard.tsx`
- Test: `frontend/src/test/pages/SpendingPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Write tests that assert:
- `소분류별 지출` is driven by actual subcategory data, not a second major-category list
- treemap period badge reflects detail range instead of hardcoded recent-3-month copy
- section state rendering distinguishes `loading`, `error`, `empty`, and `ready`

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- src/test/pages/SpendingPage.test.tsx`
Expected: FAIL because the current page reuses major-category breakdown and does not normalize section state consistently.

- [ ] **Step 3: Implement the minimal code**

Adjust the page and any shared card helper needed so the card headers and state surfaces follow the approved interaction rules without changing backend APIs.

- [ ] **Step 4: Run the focused tests**

Run: `cd frontend && npm test -- src/test/pages/SpendingPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SpendingPage.tsx frontend/src/components/ui/SectionCard.tsx frontend/src/test/pages/SpendingPage.test.tsx
git commit -m "[frontend] fix spending correctness and card state flow (codex)"
```

## Task 4: Apply shared interaction rules to `WorkbenchPage` and `InsightsPage`

**Files:**
- Modify: `frontend/src/pages/WorkbenchPage.tsx`
- Modify: `frontend/src/pages/InsightsPage.tsx`
- Test: `frontend/src/test/pages/WorkbenchPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Write tests that assert:
- `WorkbenchPage` shows read-only gating predictably
- bulk panel appears only when rows are selected
- query-state blocks appear in card bodies, not as ad hoc page fragments

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- src/test/pages/WorkbenchPage.test.tsx`
Expected: FAIL because the page does not yet have dedicated behavioral coverage.

- [ ] **Step 3: Implement the minimal code**

Refactor only enough to make the task hierarchy explicit:
- filter bar
- bulk edit panel
- transaction surface
- secondary accordions

Normalize card header/action/state placement on `InsightsPage` where needed so the shared interaction rules apply to both read and write-heavy surfaces.

- [ ] **Step 4: Run the focused tests**

Run: `cd frontend && npm test -- src/test/pages/WorkbenchPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WorkbenchPage.tsx frontend/src/pages/InsightsPage.tsx frontend/src/test/pages/WorkbenchPage.test.tsx
git commit -m "[frontend] align workbench and insights interaction rules (codex)"
```

## Task 5: Run full verification and update project docs

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-07/codex.md`

- [ ] **Step 1: Run frontend verification**

Run:
- `cd frontend && npm test`
- `cd frontend && npm run lint`
- `cd frontend && npm run typecheck`

Expected:
- all tests pass
- lint exits 0
- typecheck exits 0

- [ ] **Step 2: Update status and daily log**

Record what shipped, the current frontend implementation point, and what remains after this rollout.

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md docs/daily/2026-04-07/codex.md
git commit -m "[docs] record frontend ui-ia rollout progress (codex)"
```

