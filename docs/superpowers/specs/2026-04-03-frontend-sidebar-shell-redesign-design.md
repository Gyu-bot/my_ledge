# Frontend Sidebar Shell Redesign Design

## Summary

현재 `my_ledge` 프론트엔드는 `상단 섹션 네비 + 섹션 내부 탭` 중심 IA로 구성되어 있다. 사용자는 shadcn `dashboard-01` 블록과 유사한 데스크톱 중심 대시보드 스타일을 원하며, 다음을 함께 요구했다.

- 데스크톱 레이아웃을 `collapsible sidebar` 중심으로 전환
- 모바일은 `sidebar drawer` 사용
- 콘텐츠 영역은 현재보다 더 넓은 `max-width` 사용
- 현재 IA는 유지
  - `개요`
  - `분석`
    - `지출`
    - `자산`
    - `인사이트`
  - `운영`
    - `거래 작업대`
- 상단은 설명형 hero 대신 `얇은 header`
- 컬러는 현재 디자인 토큰 유지
- shell과 page chrome을 계기로 공용 컴포넌트를 더 강화해 일관성을 높임
- frontend 관련 문서도 새 구조에 맞게 갱신

이 작업은 단순 spacing 조정이 아니라 앱 셸 구조 자체를 바꾸는 변경이다. 기존 `AppLayout`을 점진적으로 누적 수정하기보다 새 sidebar shell로 사실상 재작성하는 편이 구조적으로 더 안전하다.

## Goals

- 데스크톱에서 shadcn dashboard 계열의 `sidebar-first` 정보 구조를 제공한다.
- 모바일에서 navigation을 drawer로 통일한다.
- 현재 route/IA는 유지하되 표현 방식을 `top nav`에서 `sidebar nav`로 바꾼다.
- page-level header를 더 얇고 밀도 높은 형태로 바꾼다.
- 카드, 테이블, 페이지 헤더 조합을 공용 컴포넌트로 재조직한다.
- 기존 디자인 토큰(`index.css`, `docs/frontend-design-tokens.md`)은 유지한다.

## Non-Goals

- 분석 결과나 API contract를 바꾸지 않는다.
- 새로운 데이터 그리드/레이아웃 라이브러리를 도입하지 않는다.
- 차트 라이브러리를 Recharts에서 교체하지 않는다.
- 현재 route를 제거하거나 IA 자체를 재설계하지 않는다.
- 운영 로직이나 analytics endpoint의 의미를 바꾸지 않는다.

## Approved Direction

### Layout Direction

- 기준안: `Option B · Dense Workspace`
- 데스크톱:
  - lean collapsible sidebar
  - 넓은 max-width content frame
  - 얇은 top header
- 모바일:
  - hamburger + drawer sidebar
- IA:
  - 현재 route와 grouping 유지
- sidebar 내용:
  - navigation only
  - 최근 업로드, 기준일, 필터 상태 같은 보조 정보는 넣지 않음

### Why This Direction

- 사용자가 원한 변화는 카드/여백 미세 조정보다 navigation shell의 성격 전환에 가깝다.
- 현재 `PrimarySectionNav` / `SectionTabNav`를 유지한 채 sidebar를 덧붙이면 IA 표현이 중복되고, 코드 경계도 흐려진다.
- 새 shell로 바꾸면 navigation source, breadcrumb, mobile drawer, active state를 하나의 config로 묶을 수 있다.
- dense workspace 안은 이미 `compact` table variant, `CardPeriodBadgeGroup` 같은 공통화 흐름과 잘 맞는다.

## Information Architecture

sidebar는 아래 구조를 하나의 navigation config에서 렌더링한다.

```text
개요
분석
  지출
  자산
  인사이트
운영
  거래 작업대
```

### Route Mapping

- `/` → `개요`
- `/analysis/spending` → `분석 > 지출`
- `/analysis/assets` → `분석 > 자산`
- `/analysis/insights` → `분석 > 인사이트`
- `/operations/workbench` → `운영 > 거래 작업대`

legacy redirect는 유지한다.

- `/spending` → `/analysis/spending`
- `/assets` → `/analysis/assets`
- `/data` → `/operations/workbench`

## Layout Architecture

## App Shell

새 shell은 다음 구조를 기본으로 한다.

```text
AppLayout
  SidebarProvider-like state layer (local implementation)
  AppSidebar
  AppShell
    AppTopbar
    AppContentFrame
      Outlet
```

### Desktop

- expanded sidebar width: 대략 `248px ~ 264px`
- collapsed sidebar width: 대략 `72px`
- content frame: 대략 `max-width: 1520px`
- page body는 shell 내부 중앙 정렬
- 기존보다 좌우 여백을 줄여 데이터 면적을 늘림
- breakpoint:
  - `lg` 이상: desktop sidebar mode
  - `lg` 미만: mobile drawer mode

### Mobile

- sidebar는 off-canvas drawer
- topbar의 hamburger로 open
- route 선택 후 자동 close
- backdrop과 focus management 포함
- drawer open state는 reload 간 유지하지 않음

## Sidebar Behavior

- 기본값은 expanded
- collapse 시 icon + tooltip만 남김
- 현재 활성 route가 속한 group은 expanded 상태에서 열려 있음
- `sidebarExpanded`는 localStorage에 persist 한다
- lean 원칙:
  - navigation만 표시
  - summary card, upload status, contextual filter는 넣지 않음

### Grouped Navigation Rules

- 단일 route item:
  - `개요`
- grouped item:
  - `분석`
  - `운영`
- 역할 구분:
  - direct route item은 `link`
  - grouped item은 `button` trigger
  - 실제 route 이동은 child link에서만 수행
- expanded mode:
  - 그룹 라벨 + icon + 하위 항목 목록을 표시
  - 그룹 라벨 row는 disclosure button으로 동작한다
  - child item:
    - `분석 > 지출` → `/analysis/spending`
    - `분석 > 자산` → `/analysis/assets`
    - `분석 > 인사이트` → `/analysis/insights`
    - `운영 > 거래 작업대` → `/operations/workbench`
- collapsed mode:
  - 최상위 icon만 표시
  - hover/focus 시 tooltip으로 그룹명 표시
  - grouped item button은 click 또는 keyboard activation 시 flyout submenu를 연다
  - flyout 안에 child links를 그대로 노출한다
  - grouped icon 자체는 route로 직접 navigate 하지 않는다
  - 즉, collapsed mode에서도 `지출`, `자산`, `인사이트`, `거래 작업대`는 flyout child link로 직접 접근한다
- keyboard:
  - collapsed flyout submenu는 `Enter` / `Space`로 열 수 있어야 한다
  - `Escape`로 닫을 수 있어야 한다

### Accessibility Contract

- sidebar direct item:
  - semantic link 사용
  - active route는 `aria-current="page"`
- expanded sidebar group:
  - semantic button 사용
  - `aria-expanded` 제공
  - `aria-controls`로 child region 연결
  - child container는 label된 navigation subregion 또는 grouped list 역할
- collapsed flyout:
  - trigger는 semantic button
  - `aria-expanded`와 `aria-controls` 유지
  - flyout panel은 label된 popup region으로 child links를 포함
  - flyout은 focus trap을 강제하지 않음
  - outside click, blur escape path, `Escape`로 닫힘
- mobile drawer:
  - `role="dialog"`
  - `aria-modal="true"`
  - 명시적 close button 제공
  - open 시 focus trap 적용
  - close 시 hamburger trigger로 focus 복귀

## Topbar Behavior

기존 `PageHeader` 중심 구조는 shell-level topbar로 역할이 이동한다.

### Topbar Contents

- 좌측:
  - hamburger button (모바일)
  - breadcrumb
  - 현재 page title
- 우측:
  - 최소 meta/action slot
  - 필요 시 기준일, 간단한 상태 badge 정도만 배치 가능

### Topbar Rules

- 긴 설명 문장은 두지 않음
- hero형 description은 제거
- 페이지 목적 설명이 꼭 필요하면 첫 카드의 `CardDescription` 또는 보조 text에 내림

### Canonical Breadcrumb and Title Mapping

| Route | Breadcrumb | Title |
|---|---|---|
| `/` | `개요` | `개요` |
| `/analysis/spending` | `분석 / 지출` | `지출` |
| `/analysis/assets` | `분석 / 자산` | `자산` |
| `/analysis/insights` | `분석 / 인사이트` | `인사이트` |
| `/operations/workbench` | `운영 / 거래 작업대` | `거래 작업대` |

규칙:

- breadcrumb와 title의 source of truth는 shell navigation config에서 파생한다
- legacy redirect route는 shell에 직접 노출되지 않으며 canonical destination으로 즉시 이동한다
- 알 수 없는 route는 기존 router redirect 규칙에 따라 `/`로 보낸다

## Page-Level Changes

### Page Header Migration Rule

- canonical page에서는 기존 `PageHeader`를 제거한다
- 얇은 topbar가 page-level title surface의 source of truth가 된다
- 기존 `PageHeader` 안의 description과 meta는 아래 규칙으로 이동한다
  - 긴 description: 첫 번째 핵심 카드의 `CardDescription` 또는 section helper text
  - 기준일/기간 같은 compact meta: topbar 우측 slot 또는 기존 카드 헤더 badge
- 초기 구현 범위에서는 별도 `PageIntro`를 도입하지 않는다
- 추후 특정 페이지에 intro copy가 다시 필요하면 `PageIntro`를 새 컴포넌트로 추가하되, 이번 shell cutover에는 포함하지 않는다

### Overview

- KPI grid와 `월간 현금흐름` 카드가 더 빨리 보이게 상단 여백 축소
- `주의 신호`, `카테고리 요약 Top 5`, `최근 거래`는 dense card rhythm으로 재배치

### Spending

- shell 상단에서 navigation chrome을 줄이는 대신, `TimelineRangeSlider`와 상단 chart를 first fold에 더 붙여서 노출
- detail filter / chart / table 리듬을 dense workspace에 맞게 정렬

### Assets

- 요약 카드와 `순자산 추이`가 top fold에 더 가깝게 위치
- 투자/대출 카드의 padding, badge 위치, metric box rhythm 정리

### Insights

- summary card → 핵심 인사이트 → table cards 흐름 유지
- table cards는 dense header + compact table 밀도 유지

### Operations Workbench

- filter + dense table가 가능한 한 위로 올라오도록 유지
- sidebar 전환 후에도 `거래 작업대`는 full-width 업무 surface를 우선

## Component Strategy

이번 작업은 shell 재작성과 동시에 page chrome 공통화를 수행한다.

### New Shared Components

- `AppSidebar`
- `SidebarNavGroup`
- `SidebarNavItem`
- `MobileSidebarDrawer`
- `AppTopbar`
- `PageBreadcrumb`
- `PageTitleBar`
- `ContentFrame`

### Existing Components to Rework or Replace

- `AppLayout`
  - top-nav shell에서 sidebar shell로 재작성
- `PrimarySectionNav`
  - 제거 또는 deprecated
- `SectionTabNav`
  - 제거 또는 deprecated
- `PageHeader`
  - 얇은 topbar 체계에 맞춰 축소 또는 `PageIntro` 성격으로 역할 재정의

### Existing Components to Reuse

- `CardPeriodBadgeGroup`
- `StatusCard`
- `MetricCardGrid`
- `EmptyState`
- `ErrorState`
- `LoadingState`
- `SectionPlaceholder`
- `TransactionsTable`
- `EditableTransactionsTable`
- 인사이트/자산/지출 chart primitives

### Candidate Additional Shared Composites

sidebar 전환과 직접 연결되진 않지만, 이번 리패스에서 같이 추출하는 것이 유효한 조합들:

- `CardSectionHeader`
  - title + description + right-side meta/badges
- `CardPaginationBar`
  - 인사이트/거래 내역 pagination bar 통합
- `InlineStatusPanel`
  - 현재 `SpendingPage`의 `InlineSectionStatus` 승격

## Design Tokens and Visual Rules

색상 체계는 그대로 유지한다.

- `frontend/src/index.css` 토큰 유지
- `docs/frontend-design-tokens.md`의 의미 유지
- `chartTheme.ts` 색상 의미 유지

대신 아래를 새 shell 톤에 맞춘다.

- sidebar surface, width, border rhythm
- topbar height와 spacing
- content frame max-width
- card gap / section gap / padding
- dense table 기본 선택 영역 확대
- breadcrumb / title / badge 위치 규칙

## Data Flow and State Boundaries

### Navigation State

shell state는 route data와 별개로 app UI state로 관리한다.

- `sidebarExpanded`
- `mobileSidebarOpen`
- active route/group resolution

이 state는 shell 내부에만 두고, 각 page hook에 섞지 않는다.

### Persistence Rules

- `sidebarExpanded`
  - localStorage persist
  - 새 세션에서 마지막 desktop 선택 상태 복원
- `mobileSidebarOpen`
  - persist 하지 않음
  - route change 시 자동 close
  - viewport가 `lg` 이상으로 바뀌면 강제 close

### Page Data

기존 page hooks는 그대로 유지한다.

- `useOverview`
- `useSpending*`
- `useInsights*`
- `useAssets`
- `useDataManagement`

즉, 이번 변경은 data fetch 책임을 건드리지 않고 shell, layout, component composition을 바꾸는 작업이다.

## Documentation Updates

구현 이후 아래 문서를 모두 새 shell 기준으로 갱신한다.

- `docs/frontend/components-and-design-token-inventory.md`
- `docs/frontend/page-wireframes.md`
- 필요 시 `docs/frontend-design-tokens.md`
- `docs/STATUS.md`
- `docs/daily/2026-04-03/codex.md`

문서 반영 내용:

- sidebar shell 구조
- topbar / breadcrumb 체계
- deprecated 된 top nav 컴포넌트
- 새 공통 컴포넌트 계층
- page wireframe 변화

## Testing Strategy

### Shell Tests

- route별 breadcrumb / title 렌더링
- desktop sidebar expanded / collapsed state
- mobile drawer open / close
- active nav item / active group 표시
- collapsed mode flyout submenu open / close
- `sidebarExpanded` persistence restore

### Regression Tests

- 기존 canonical route 5개 렌더 smoke
- overview / spending / assets / insights / workbench page mount 유지
- legacy redirect route 유지
- 기존 `AppLayout.test.tsx`, `router.test.tsx`는 새 shell 기준으로 갱신

### Accessibility and Interaction Tests

- mobile drawer:
  - `Escape`로 닫힘
  - overlay click으로 닫힘
  - route 선택 후 닫힘
  - body scroll lock 적용/해제
- focus:
  - hamburger → drawer → first nav item 흐름 검증
  - collapsed submenu keyboard open/close 검증
- tooltip/flyout:
  - collapsed sidebar에서 label discoverability 유지

### Validation Commands

- `cd frontend && npm test`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`

### Manual Verification

- 데스크톱:
  - sidebar collapse / expand
  - collapsed mode에서 flyout submenu 접근 가능
  - content width 증가 확인
  - 각 page topbar/breadcrumb 확인
- 모바일:
  - drawer open / close
  - route selection 후 drawer close
  - `Escape` close
  - background scroll lock
  - horizontal overflow 여부
- review server:
  - Tailscale에서 canonical route 확인

## Risks

### Shell Replacement Risk

`AppLayout`을 사실상 새로 짜기 때문에 route mount, focus order, mobile navigation이 동시에 영향을 받을 수 있다.

대응:

- navigation config를 먼저 고정
- shell 테스트를 먼저 추가
- page 내용은 최대한 그대로 두고 shell만 교체

### Header Duplication Risk

기존 `PageHeader`와 새 `AppTopbar`가 동시에 title을 가지면 정보 중복이 생긴다.

대응:

- topbar가 canonical page chrome이 되게 하고
- 기존 `PageHeader`는 축소/제거/역할 변경 중 하나를 명확히 선택

### Over-Refactor Risk

shell 변경을 핑계로 unrelated page refactor까지 같이 벌어질 수 있다.

대응:

- 이번 작업 범위는 shell, page chrome, 공용 조합 추출로 제한
- analytics/data semantics 변경 금지

## Open Implementation Decisions Already Resolved

- desktop IA: sidebar
- desktop sidebar behavior: collapsible
- mobile IA: sidebar drawer
- content width: 넓은 max-width
- sidebar information density: lean
- IA structure: current grouping 유지
- page header direction: thin top header
- shell strategy: 기존 `AppLayout` 점진 수정이 아니라 사실상 재작성

## Implementation Readiness

이 spec은 구현 계획으로 내릴 준비가 된 상태다. 다음 단계는 이 설계를 기준으로 파일 단위 구현 계획을 작성하는 것이다.
