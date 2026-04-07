# Frontend UI Polish Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shell hierarchy, chart hover/tooltip styling, Spending/Insights/Workbench polish, and Tailnet review fixes를 한 배치로 구현해 현재 frontend TODO를 정리한다.

**Architecture:** 공통 token과 shared UI contract를 먼저 정리한 뒤, chart primitives를 손봐 hover/tooltip 일관성을 만든다. 그 위에 Spending, Insights, Workbench page를 순서대로 cutover 하고 마지막에 Vite Tailnet host 허용과 테스트를 묶어 검증한다.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, Recharts, Vitest, Testing Library

---

## File map

- Modify: `frontend/src/index.css`
  - dark theme text/divider/chart tooltip token 조정
- Modify: `frontend/src/lib/chartTheme.ts`
  - chart hover/tooltip 공통 style 상수 정리
- Modify: `frontend/src/components/ui/SectionCard.tsx`
  - `title/meta/action/description/body` 구조로 확장
- Modify: `frontend/src/components/ui/Pagination.tsx`
  - dense font/padding 토큰화
- Modify: `frontend/src/components/ui/DailyCalendar.tsx`
  - hover/focus/tap popover 추가
- Modify: `frontend/src/components/layout/AppSidebar.tsx`
  - spacing/contrast polish
- Modify: `frontend/src/components/layout/AppTopbar.tsx`
  - title/meta badge baseline 정리
- Modify: `frontend/src/components/charts/StackedBarChart.tsx`
  - stacked area chart로 전환하거나 공통 area chart wrapper로 교체
- Create: `frontend/src/components/charts/StackedAreaChart.tsx`
  - Spending용 Top 5 + 기타 series area chart
- Create: `frontend/src/components/charts/NestedTreemapChart.tsx`
  - category > merchant depth treemap
- Modify: `frontend/src/pages/SpendingPage.tsx`
  - period picker, badge, subcategory meta, nested treemap, section hierarchy 반영
- Modify: `frontend/src/pages/InsightsPage.tsx`
  - merchant 기간 선택, category MoM 기준월 선택, 카드 action 정리
- Modify: `frontend/src/pages/WorkbenchPage.tsx`
  - filter/bulk/table/accordion hierarchy 정리
- Modify: `frontend/vite.config.ts`
  - Tailnet hostname allowlist
- Modify: `frontend/src/test/components/ui/Pagination.test.tsx`
  - dense token 회귀
- Create/Modify: `frontend/src/test/components/ui/SectionCard.test.tsx`
  - 확장 header contract 검증
- Modify: `frontend/src/test/pages/SpendingPage.test.tsx`
  - stacked area / period picker / treemap / badge / calendar interaction 회귀
- Create/Modify: `frontend/src/test/pages/InsightsPage.test.tsx`
  - period selector / base month selector / action button 회귀
- Create/Modify: `frontend/src/test/pages/WorkbenchPage.test.tsx`
  - read-only gating / bulk toolbar / mutation feedback 회귀
- Modify: `frontend/src/test/components/layout/AppTopbar.test.tsx`
  - topbar meta alignment / lifecycle contract 확인
- Modify: `docs/STATUS.md`
  - 구현 상태 반영

### Task 1: Shared tokens and shell contract

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/ui/SectionCard.tsx`
- Modify: `frontend/src/components/ui/Pagination.tsx`
- Modify: `frontend/src/components/layout/AppSidebar.tsx`
- Modify: `frontend/src/components/layout/AppTopbar.tsx`
- Test: `frontend/src/test/components/ui/Pagination.test.tsx`
- Test: `frontend/src/test/components/ui/SectionCard.test.tsx`
- Test: `frontend/src/test/components/layout/AppTopbar.test.tsx`

- [ ] **Step 1: Write failing shared UI tests**

  Add tests for:
  - `SectionCard`가 description/action/meta slot을 렌더하는지
  - `Pagination`이 dense class/token을 사용해 smaller control을 유지하는지
  - `AppTopbar` meta badge container가 stable하게 유지되는지

- [ ] **Step 2: Run targeted tests to confirm failures**

  Run:
  ```bash
  cd frontend && npm test -- --runInBand src/test/components/ui/Pagination.test.tsx src/test/components/layout/AppTopbar.test.tsx
  ```

- [ ] **Step 3: Implement shared token/shell changes**

  Update:
  - `index.css` text/divider/chart tooltip tokens
  - `SectionCard` prop surface
  - `Pagination` font/padding classes
  - `AppSidebar` / `AppTopbar` spacing and contrast

- [ ] **Step 4: Re-run shared UI tests**

  Run:
  ```bash
  cd frontend && npm test -- --runInBand src/test/components/ui/Pagination.test.tsx src/test/components/layout/AppTopbar.test.tsx
  ```

- [ ] **Step 5: Commit shared UI foundation**

  ```bash
  git add frontend/src/index.css frontend/src/components/ui/SectionCard.tsx frontend/src/components/ui/Pagination.tsx frontend/src/components/layout/AppSidebar.tsx frontend/src/components/layout/AppTopbar.tsx frontend/src/test/components/ui/Pagination.test.tsx frontend/src/test/components/ui/SectionCard.test.tsx frontend/src/test/components/layout/AppTopbar.test.tsx
  git commit -m "[frontend] lay shared ui polish foundation (codex)"
  ```

### Task 2: Chart hover/tooltip primitives

**Files:**
- Modify: `frontend/src/lib/chartTheme.ts`
- Modify: `frontend/src/components/charts/LineAreaChart.tsx`
- Modify: `frontend/src/components/charts/HorizontalBarList.tsx`
- Modify: `frontend/src/components/charts/StackedBarChart.tsx`
- Create: `frontend/src/components/charts/StackedAreaChart.tsx`
- Create: `frontend/src/components/charts/NestedTreemapChart.tsx`
- Test: `frontend/src/test/lib/chartTheme.test.tsx`

- [ ] **Step 1: Add failing chart theme tests**

  Cover:
  - tooltip style에 readable text token이 있는지
  - hover state helper가 hardcoded 색 대신 semantic token을 쓰는지

- [ ] **Step 2: Run chart theme tests and confirm failure**

  Run:
  ```bash
  cd frontend && npm test -- --runInBand src/test/lib/chartTheme.test.tsx
  ```

- [ ] **Step 3: Implement chart primitives**

  Update:
  - tooltip text token / active state token in `chartTheme.ts`
  - `StackedAreaChart.tsx` for Top 5 + 기타
  - `NestedTreemapChart.tsx` for category > merchant
  - existing chart components to use shared tooltip contract

- [ ] **Step 4: Re-run chart tests**

  Run:
  ```bash
  cd frontend && npm test -- --runInBand src/test/lib/chartTheme.test.tsx
  ```

- [ ] **Step 5: Commit chart primitive changes**

  ```bash
  git add frontend/src/lib/chartTheme.ts frontend/src/components/charts/LineAreaChart.tsx frontend/src/components/charts/HorizontalBarList.tsx frontend/src/components/charts/StackedBarChart.tsx frontend/src/components/charts/StackedAreaChart.tsx frontend/src/components/charts/NestedTreemapChart.tsx frontend/src/test/lib/chartTheme.test.tsx
  git commit -m "[frontend] unify chart hover and tooltip styling (codex)"
  ```

### Task 3: Spending page cutover

**Files:**
- Modify: `frontend/src/pages/SpendingPage.tsx`
- Modify: `frontend/src/components/ui/DailyCalendar.tsx`
- Test: `frontend/src/test/pages/SpendingPage.test.tsx`
- Test: `frontend/src/test/components/ui/RangeSlider.test.tsx`

- [ ] **Step 1: Extend Spending tests with failing cases**

  Cover:
  - area chart / Top 5 + 기타 data path
  - 조회기간 picker UI
  - subcategory badge
  - nested treemap data shape
  - calendar hover/focus popover

- [ ] **Step 2: Run Spending tests to confirm failures**

  Run:
  ```bash
  cd frontend && npm test -- --runInBand src/test/pages/SpendingPage.test.tsx src/test/components/ui/RangeSlider.test.tsx
  ```

- [ ] **Step 3: Implement Spending page changes**

  Update:
  - remove range slider usage
  - add month picker controls with `조회 기간` badge
  - replace stacked bar with stacked area
  - add subcategory period badge
  - swap merchant treemap to nested treemap
  - add calendar popover interaction

- [ ] **Step 4: Re-run Spending tests**

  Run:
  ```bash
  cd frontend && npm test -- --runInBand src/test/pages/SpendingPage.test.tsx src/test/components/ui/RangeSlider.test.tsx
  ```

- [ ] **Step 5: Commit Spending page cutover**

  ```bash
  git add frontend/src/pages/SpendingPage.tsx frontend/src/components/ui/DailyCalendar.tsx frontend/src/test/pages/SpendingPage.test.tsx frontend/src/test/components/ui/RangeSlider.test.tsx
  git commit -m "[frontend] polish spending analysis surfaces (codex)"
  ```

### Task 4: Insights and Workbench polish

**Files:**
- Modify: `frontend/src/pages/InsightsPage.tsx`
- Modify: `frontend/src/pages/WorkbenchPage.tsx`
- Test: `frontend/src/test/pages/InsightsPage.test.tsx`
- Test: `frontend/src/test/pages/WorkbenchPage.test.tsx`
- Test: `frontend/src/test/hooks/useWriteAccess.test.ts`

- [ ] **Step 1: Write failing page behavior tests**

  Cover:
  - Insights merchant 기간 selector
  - category MoM 기준월 selector
  - Workbench read-only / bulk toolbar / success-error feedback

- [ ] **Step 2: Run Insights and Workbench tests**

  Run:
  ```bash
  cd frontend && npm test -- --runInBand src/test/pages/InsightsPage.test.tsx src/test/pages/WorkbenchPage.test.tsx src/test/hooks/useWriteAccess.test.ts
  ```

- [ ] **Step 3: Implement page polish**

  Update:
  - Insights card action layout and local control state
  - Workbench filter action grouping, bulk panel hierarchy, secondary accordion emphasis
  - keep query contracts unchanged while improving state presentation

- [ ] **Step 4: Re-run targeted page tests**

  Run:
  ```bash
  cd frontend && npm test -- --runInBand src/test/pages/InsightsPage.test.tsx src/test/pages/WorkbenchPage.test.tsx src/test/hooks/useWriteAccess.test.ts
  ```

- [ ] **Step 5: Commit page polish changes**

  ```bash
  git add frontend/src/pages/InsightsPage.tsx frontend/src/pages/WorkbenchPage.tsx frontend/src/test/pages/InsightsPage.test.tsx frontend/src/test/pages/WorkbenchPage.test.tsx frontend/src/test/hooks/useWriteAccess.test.ts
  git commit -m "[frontend] polish insights and workbench flows (codex)"
  ```

### Task 5: Tailnet preview and full verification

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Add Tailnet host allowance and any needed tests**

  Update `vite.config.ts` to permit `moltbot.tailbe7385.ts.net` and similar Tailnet hostname review usage.

- [ ] **Step 2: Run full frontend verification**

  Run:
  ```bash
  cd frontend && npm test -- --runInBand
  cd frontend && npm run lint
  cd frontend && npm run typecheck
  curl -I -H 'Host: moltbot.tailbe7385.ts.net' http://127.0.0.1:4173
  ```

- [ ] **Step 3: Update STATUS**

  Record completed UI polish batch items, remaining follow-up, and latest verification state in `docs/STATUS.md`.

- [ ] **Step 4: Commit verification/docs changes**

  ```bash
  git add frontend/vite.config.ts docs/STATUS.md
  git commit -m "[frontend] stabilize tailnet review and verification (codex)"
  ```

## Self-review checklist

- Spec coverage:
  - shared shell/token, divider tone, chart hover/tooltip, Spending stacked area + picker + nested treemap, Insights selectors, Workbench hierarchy, Tailnet allowlist, tests 모두 task로 매핑됨
- Placeholder scan:
  - no TBD/TODO placeholders remain
- Type consistency:
  - `SectionCard`, chart components, page tests, `vite.config.ts`가 각 task에서 같은 이름으로 참조됨
