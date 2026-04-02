# Frontend Compact Header And Legacy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 페이지 상단 정보 밀도를 높이기 위해 카드형 제목 영역을 compact header로 전환하고, 새 IA로 완전히 대체된 legacy frontend 경로/페이지를 정리한다.

**Architecture:** 공통 shell의 hero card와 각 페이지의 `PageHeader` card를 제거하고, compact header primitives로 통합한다. 새 canonical route만 남기고 legacy `/data` wrapper 및 사용되지 않는 old page 컴포넌트를 정리하면서 spending/assets의 빈 상태 높이도 함께 줄인다.

**Tech Stack:** React 18, React Router, TypeScript, Tailwind CSS, Vitest, Testing Library

---

### Task 1: Compact Shell/Header 테스트와 구현

**Files:**
- Modify: `frontend/src/app/AppLayout.tsx`
- Modify: `frontend/src/app/AppLayout.test.tsx`
- Modify: `frontend/src/components/layout/PageHeader.tsx`
- Modify: `frontend/src/pages/__tests__/OverviewPage.test.tsx`
- Modify: `frontend/src/pages/__tests__/InsightsPage.test.tsx`
- Modify: `frontend/src/pages/__tests__/AssetsPage.test.tsx`
- Modify: `frontend/src/pages/__tests__/SpendingPage.test.tsx`

- [ ] **Step 1: compact header 기대값을 테스트에 먼저 반영**

- [ ] **Step 2: 관련 테스트를 실행해 red 상태를 확인**

Run: `cd frontend && npm test -- --runInBand src/app/AppLayout.test.tsx src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx src/pages/__tests__/SpendingPage.test.tsx`

Expected: 기존 card/header 구조 기대와 달라 실패

- [ ] **Step 3: AppLayout과 PageHeader를 compact layout으로 최소 구현**

- [ ] **Step 4: 같은 테스트를 다시 실행해 green 확인**

---

### Task 2: Legacy Route/Page 제거와 본문 밀도 조정

**Files:**
- Modify: `frontend/src/app/router.tsx`
- Delete: `frontend/src/pages/DataPage.tsx`
- Delete: `frontend/src/pages/DashboardPage.tsx`
- Delete: `frontend/src/pages/PlaceholderApp.tsx`
- Delete: `frontend/src/pages/__tests__/DataPage.test.tsx`
- Delete: `frontend/src/pages/__tests__/DashboardPage.test.tsx`
- Delete: `frontend/src/pages/PlaceholderApp.test.tsx`
- Modify: `frontend/src/pages/OperationsWorkbenchPage.tsx`
- Modify: `frontend/src/pages/AssetsPage.tsx`
- Modify: `frontend/src/pages/SpendingPage.tsx`
- Modify: `frontend/src/components/common/SectionPlaceholder.tsx`
- Modify: `frontend/src/components/charts/LineTrendChart.tsx`
- Modify: `frontend/src/pages/__tests__/OperationsWorkbenchPage.test.tsx`
- Modify: `frontend/src/pages/__tests__/AssetsPage.test.tsx`
- Modify: `frontend/src/pages/__tests__/SpendingPage.test.tsx`

- [ ] **Step 1: legacy 제거와 compact empty-state 기대를 테스트에 먼저 반영**

- [ ] **Step 2: 관련 테스트를 실행해 red 상태를 확인**

Run: `cd frontend && npm test -- --runInBand src/pages/__tests__/OperationsWorkbenchPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx src/pages/__tests__/SpendingPage.test.tsx`

Expected: legacy label/route, placeholder height, summary 표현 차이로 실패

- [ ] **Step 3: canonical route만 남기고 unused pages/tests 삭제, empty-state/summary 밀도 조정 구현**

- [ ] **Step 4: 관련 테스트를 다시 실행해 green 확인**

---

### Task 3: 전체 검증과 런타임 캡처 재수집

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-02/codex.md`

- [ ] **Step 1: 전체 frontend 검증 실행**

Run:
- `cd frontend && npm test`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`

Expected: 모두 통과

- [ ] **Step 2: 현재 dev server 기준으로 desktop/mobile 스크린샷 재수집**

Run: headless chrome fallback commands saving to `output/playwright/`

Expected: compact header 반영된 최신 캡처 생성

- [ ] **Step 3: STATUS와 daily log를 최종 상태로 갱신**
