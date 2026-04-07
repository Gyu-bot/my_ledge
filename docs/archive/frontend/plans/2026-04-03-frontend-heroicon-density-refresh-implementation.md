> Historical document. Do not use this file as the current frontend source of truth. See `docs/frontend-design-tokens.md` and related active frontend docs instead.

# Frontend Heroicon and Density Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local Heroicons-style navigation/title icons and make the dashboard shell/cards denser without changing routes or data behavior.

**Architecture:** A local icon module becomes the single source for shared outline SVGs. Navigation config references icon identifiers/components for sidebar and drawer rendering, while selected page/card titles reuse the same icon layer. Spacing changes happen in shared primitives first, then page-level outliers get small follow-up adjustments.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library, Playwright-based browser verification.

---

## File Structure

### Create

- `frontend/src/components/icons/HeroIcons.tsx`
  - Local Heroicons-style SVG components and shared icon props

### Modify

- `frontend/src/app/navigation.ts`
  - Add icon metadata to nav items
- `frontend/src/components/layout/AppSidebar.tsx`
- `frontend/src/components/layout/MobileSidebarDrawer.tsx`
  - Replace initials/text-only affordances with icon rendering and tighter row spacing
- `frontend/src/components/ui/card.tsx`
- `frontend/src/components/common/StatusCard.tsx`
- `frontend/src/components/layout/ContentFrame.tsx`
  - Reduce shared padding defaults
- `frontend/src/pages/OverviewPage.tsx`
- `frontend/src/pages/SpendingPage.tsx`
- `frontend/src/pages/AssetsPage.tsx`
- `frontend/src/pages/InsightsPage.tsx`
- `frontend/src/pages/OperationsWorkbenchPage.tsx`
  - Add icons to major section/card titles and trim outlier padding
- `docs/STATUS.md`
- `docs/daily/2026-04-03/codex.md`

### Task 1: Add Local Icon Layer

**Files:**
- Create: `frontend/src/components/icons/HeroIcons.tsx`
- Modify: `frontend/src/app/navigation.ts`

- [ ] Write local outline SVG components for all required menu/title icons.
- [ ] Add typed icon metadata to navigation config.
- [ ] Wire icon rendering helpers without adding external packages.

### Task 2: Refresh Sidebar and Drawer

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx`
- Modify: `frontend/src/components/layout/MobileSidebarDrawer.tsx`

- [ ] Replace initials with icons in expanded/collapsed states.
- [ ] Keep active, flyout, and drawer interactions intact.
- [ ] Reduce menu row height and surrounding padding by one density step.

### Task 3: Refresh Titles and Shared Density

**Files:**
- Modify: `frontend/src/components/ui/card.tsx`
- Modify: `frontend/src/components/common/StatusCard.tsx`
- Modify: `frontend/src/components/layout/ContentFrame.tsx`
- Modify: page files listed above

- [ ] Reduce shared card/content padding centrally.
- [ ] Add title icon pattern to major section/card titles only.
- [ ] Adjust page-level outliers where reduced spacing causes visual imbalance.

### Task 4: Verify and Document

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-03/codex.md`

- [ ] Run `cd frontend && npm test`.
- [ ] Run `cd frontend && npm run lint`.
- [ ] Run `cd frontend && npm run typecheck`.
- [ ] Review desktop/mobile layouts in the browser and fix issues found.
- [ ] Update STATUS and daily log with outcome and next step.
