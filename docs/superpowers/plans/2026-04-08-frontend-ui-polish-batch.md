# Frontend UI Polish Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** shell hierarchy, shared section/card contract, Spending/Insights/Workbench polish, chart hover styling, and Tailnet review stability를 한 배치로 정리한다.

**Architecture:** 공통 토큰과 공통 컴포넌트(`SectionCard`, `Pagination`, chart theme)부터 먼저 정리해 각 페이지가 같은 시각 규칙을 사용하게 만든다. 이후 `SpendingPage`, `InsightsPage`, `WorkbenchPage`를 개별 polish하고, 마지막에 Vite host allowlist와 테스트를 정리한다.

**Tech Stack:** React, TypeScript, Recharts, Vitest, Testing Library, Tailwind utility classes, Vite

---

### Task 1: Shared shell and section contract 정리

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx`
- Modify: `frontend/src/components/layout/AppTopbar.tsx`
- Modify: `frontend/src/components/ui/SectionCard.tsx`
- Modify: `frontend/src/components/ui/Pagination.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/test/components/layout/AppSidebar.test.tsx`
- Test: `frontend/src/test/components/layout/AppTopbar.test.tsx`
- Test: `frontend/src/test/components/ui/Pagination.test.tsx`

- [ ] `SectionCard`를 `title / meta / action / description / body` 구조로 확장하고, 기존 `badge` 사용처를 새 header contract로 수용한다.
- [ ] `AppTopbar`의 breadcrumb / title / meta badge spacing을 정리하고 모바일/데스크톱에서 같은 vertical rhythm을 갖게 조정한다.
- [ ] `AppSidebar`의 section label, active/hover tone, collapsed/expanded spacing을 다듬는다.
- [ ] `Pagination` 글꼴 크기와 control padding을 한 단계 축소하고 dense footer에서도 과하게 보이지 않도록 정리한다.
- [ ] 전역 토큰에서 `text-text-ghost`, `text-text-faint`, 내부 divider border tone을 상향/완화해 dark theme 대비를 개선한다.
- [ ] 관련 layout/pagination 테스트를 갱신해 새 header contract와 폰트/버튼 contract가 깨지지 않도록 고정한다.

### Task 2: Shared chart hover / tooltip contract 추가

**Files:**
- Modify: `frontend/src/lib/chartTheme.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/charts/HorizontalBarList.tsx`
- Modify: `frontend/src/components/charts/MoMBarList.tsx`
- Modify: `frontend/src/components/charts/DualBarChart.tsx`
- Modify: `frontend/src/components/charts/LineAreaChart.tsx`
- Modify: `frontend/src/components/charts/StackedBarChart.tsx` or create `frontend/src/components/charts/StackedAreaChart.tsx`
- Test: `frontend/src/test/lib/chartTheme.test.ts`

- [ ] chart tooltip 배경/테두리/폰트색 semantic token을 정리하고 tooltip text가 dark theme에서 읽히도록 만든다.
- [ ] hover active background가 각 chart 계열과 어울리는 tone을 쓰게 공통 contract를 추가한다.
- [ ] hardcoded tooltip text color나 active background가 남아 있는 chart component를 공통 theme helper로 치환한다.
- [ ] chart theme test를 보강해 tooltip style/semantic token contract를 검증한다.

### Task 3: Spending page 시각화와 interaction 재구성

**Files:**
- Modify: `frontend/src/pages/SpendingPage.tsx`
- Modify: `frontend/src/components/ui/DailyCalendar.tsx`
- Modify: `frontend/src/components/charts/StackedBarChart.tsx` or create `frontend/src/components/charts/StackedAreaChart.tsx`
- Modify: `frontend/src/lib/chartTheme.ts`
- Test: `frontend/src/test/pages/SpendingPage.test.tsx`
- Test: create `frontend/src/test/components/ui/DailyCalendar.test.tsx`

- [ ] `월별 카테고리 추이`를 stacked area chart로 바꾸고 Top 5 category + `기타` 집계 adapter를 페이지 또는 chart 경계에 추가한다.
- [ ] 기존 range slider를 제거하고 month picker 기반 `조회 기간` control로 바꾼다.
- [ ] `카테고리별 지출` / `소분류별 지출` card에 동일한 기준 기간 meta badge를 붙인다.
- [ ] `거래처별 지출 비중`을 nested treemap으로 바꿔 상위 depth는 category, 하위 depth는 merchant로 렌더링한다.
- [ ] `DailyCalendar`에 hover/focus/tap 기반 lightweight popover를 추가해 날짜/금액을 읽을 수 있게 한다.
- [ ] `조회 기간 → 상세 필터 → breakdown → calendar/table` 흐름으로 hierarchy를 재정렬한다.
- [ ] Spending test를 갱신해 period picker contract, merchant query period, Top 5 + 기타 집계, subcategory badge, nested treemap data contract를 검증한다.

### Task 4: Insights page control polish

**Files:**
- Modify: `frontend/src/pages/InsightsPage.tsx`
- Modify: `frontend/src/components/ui/SectionCard.tsx` (Task 1 결과 사용)
- Test: create `frontend/src/test/pages/InsightsPage.test.tsx`

- [ ] `거래처 소비 Top 5`에 `1개월 / 3개월 / 6개월 / 1년` 기간 선택 control을 추가한다.
- [ ] `카테고리 전월 대비`에 기준월 선택 UI를 추가하고 query 인자를 해당 선택과 연결한다.
- [ ] KPI row와 insight/list cards의 spacing, secondary text 대비, action button style을 공통 contract에 맞게 정리한다.
- [ ] 새 Insights page test를 추가해 기간 선택과 기준월 선택이 올바른 query parameter로 이어지는지 고정한다.

### Task 5: Workbench hierarchy / state polish

**Files:**
- Modify: `frontend/src/pages/WorkbenchPage.tsx`
- Modify: `frontend/src/components/ui/AlertBanner.tsx` (필요 시)
- Modify: `frontend/src/components/ui/SectionCard.tsx` (Task 1 결과 사용)
- Test: create `frontend/src/test/pages/WorkbenchPage.test.tsx`

- [ ] filter bar를 grouped toolbar처럼 읽히게 재배치하고, 적용/초기화 버튼 cluster를 정돈한다.
- [ ] bulk panel에서 selection count, editable controls, primary/dismiss action hierarchy를 더 분명하게 만든다.
- [ ] read-only mode에서 왜 수정이 막히는지 더 직접적으로 드러내는 상태 표현을 추가한다.
- [ ] 거래 목록과 secondary accordion(`업로드`, `최근 업로드 이력`, `Danger Zone`)의 강조 위계를 분리한다.
- [ ] loading / empty / mutation success-error feedback을 table/upload/reset flow에서 더 명시적으로 정리한다.
- [ ] Workbench test를 추가해 read-only gating, bulk toolbar visibility, mutation feedback rendering을 검증한다.

### Task 6: Tailnet review 안정화와 최종 검증

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-08/codex.md` (없으면 create)

- [ ] `moltbot.tailbe7385.ts.net` 같은 Tailnet hostname에서 Vite dev server가 403을 내지 않도록 host allowlist를 정리한다.
- [ ] Tailscale visual companion URL과 frontend dev server URL이 모두 열리는지 smoke 확인한다.
- [ ] `cd frontend && npm test`
- [ ] `cd frontend && npm run lint`
- [ ] `cd frontend && npm run typecheck`
- [ ] `docs/STATUS.md`와 daily log에 구현 범위, 검증 결과, 남은 리스크를 반영한다.
