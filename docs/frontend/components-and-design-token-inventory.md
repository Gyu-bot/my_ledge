# Frontend Components And Token Inventory

**Status:** Active  
**Source files:** `frontend/src/components/**/*`, `frontend/src/pages/*`

## Scope

이 문서는 현재 프론트엔드 구현에 존재하는 컴포넌트와, 각 컴포넌트가 어떤 semantic token layer를 사용하는지 정리한다.
현재 문서에 없는 컴포넌트는 source of truth가 아니다.

## Layout Components

### `AppLayout`

- 책임:
  - shell frame 구성
  - mobile drawer open/close state 보유
  - topbar meta badge state 제공
- 의존:
  - `AppSidebar`
  - `MobileDrawer`
  - `AppTopbar`
  - `chromeContext`
- 주요 token:
  - `bg-surface-panel`

### `chromeContext`

- 책임:
  - page가 topbar 우측 meta badge를 주입할 수 있게 함
- 사용 페이지:
  - `OverviewPage`
  - `SpendingPage`
  - `AssetsPage`
  - `InsightsPage`
  - `WorkbenchPage`

### `AppSidebar`

- 책임:
  - desktop 1차 navigation
- 현재 nav:
  - `/`
  - `/analysis/spending`
  - `/analysis/assets`
  - `/analysis/insights`
  - `/operations/workbench`
- 주요 token:
  - `bg-surface-bar`
  - `border-border`
  - `bg-accent-dim`
  - `to-accent-strong`

### `MobileDrawer`

- 책임:
  - mobile nav drawer
  - route 변경 시 자동 close
- 주요 token:
  - `bg-surface-bar`
  - `bg-black/60`
  - `bg-accent-dim`
  - `to-accent-strong`

### `AppTopbar`

- 책임:
  - breadcrumb
  - page title
  - meta badge slot
- route metadata source:
  - component 내부 `PAGE_META`
- 주요 token:
  - `bg-surface-bar`
  - `border-border`
  - `text-text-ghost`
  - `text-text-primary`

## UI Components

### `SectionCard`

- 책임:
  - 페이지 공통 section wrapper
  - title / badge / body 구조 제공
- 주요 token:
  - `bg-surface-card`
  - `border-border`
  - `border-border-subtle`
  - `bg-surface-bar`

### `KpiCard`

- 책임:
  - KPI 숫자 카드
- 주요 token:
  - `bg-surface-card`
  - `border-border`
  - `text-kpi`
  - `text-accent`
  - `text-danger`

### `AlertBanner`

- variant:
  - `success`
  - `error`
  - `warn`
- 주요 token:
  - `bg-accent-dim`
  - `bg-danger-dim`
  - `bg-warn-dim`

### `LoadingState`

- 책임:
  - section/page loading 상태

### `EmptyState`

- 책임:
  - page 또는 section empty 상태

### `ErrorState`

- 책임:
  - retry 가능한 error 상태

### `Pagination`

- 책임:
  - current/prev/next 기반 pagination

### `StatusBadge`

- status:
  - `original`
  - `edited`
  - `deleted`
- 주요 token:
  - `bg-border-subtle`
  - `bg-accent-dim`
  - `bg-danger-dim`

### `NecessityBadge`

- responsibility:
  - `essential` / `discretionary` / empty 상태 badge 표현

### `RangeSlider`

- responsibility:
  - 월 범위 slider
- current usage:
  - `SpendingPage`

### `SegmentedBar`

- responsibility:
  - ratio bar
- current usage:
  - 지출 분석 고정/변동
  - 지출 분석 필수/비필수
- color source:
  - caller가 semantic CSS variable string 전달

### `DailyCalendar`

- responsibility:
  - 월간 daily spend heat/calendar
- token:
  - `bg-border-subtle`
  - `var(--chart-danger)`
  - `var(--chart-accent)`

## Chart Components

### `DualBarChart`

- usage:
  - Overview 월간 현금흐름
- token source:
  - `chartTheme.ts`

### `StackedBarChart`

- usage:
  - Spending 월별 카테고리 추이
- token source:
  - `chartTheme.ts`
  - category palette

### `LineAreaChart`

- usage:
  - Assets 순자산 추이
- token source:
  - `chartTheme.ts`

### `HorizontalBarList`

- usage:
  - category breakdown
  - investment portfolio ratio
- token source:
  - default `CHART_ACCENT`
  - caller override 가능

### `MoMBarList`

- usage:
  - Insights 카테고리 전월 대비
- token source:
  - `CHART_DANGER`
  - `CHART_ACCENT`

## Page Inventory

### `OverviewPage`

- blocks:
  - KPI 4개
  - 월간 현금흐름
  - 주의 신호
  - 카테고리 Top 5
  - 최근 거래
- topbar meta:
  - snapshot 기준일

### `SpendingPage`

- blocks:
  - timeline range slider
  - 월별 카테고리 추이
  - detail filter
  - 카테고리/소분류 지출
  - 고정비/변동비 ratio
  - 필수/비필수 ratio
  - merchant treemap
  - daily calendar
  - 거래내역 accordion + pagination
- topbar meta:
  - detail month range

### `AssetsPage`

- blocks:
  - KPI 4개
  - 순자산 추이
  - 투자 요약
  - 대출 요약
- topbar meta:
  - snapshot 기준일

### `InsightsPage`

- blocks:
  - KPI 3개
  - 핵심 인사이트 리스트
  - 반복 결제
  - 이상 지출
  - 거래처 소비 Top 5
  - 카테고리 전월 대비
- topbar meta:
  - 핵심 인사이트 건수

### `WorkbenchPage`

- blocks:
  - write access alert
  - filter bar
  - bulk edit panel
  - transaction table
  - upload accordion
  - upload history accordion
  - danger zone accordion
- topbar meta:
  - 현재 page item count / total count

## Token Coverage Summary

현재 구현은 아래 원칙을 따른다.

- class 기반 색상은 Tailwind semantic alias 사용
- chart/inline style는 `chartTheme.ts` 또는 `var(--token)` 사용
- raw hex는 `index.css` token definition 내부에만 존재

추가 컴포넌트가 생기면 이 문서를 먼저 갱신한다.
