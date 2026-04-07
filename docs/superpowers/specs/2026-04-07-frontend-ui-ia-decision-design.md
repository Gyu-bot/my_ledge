# Frontend UI/IA Decision Design

**Goal:** 최근 frontend review와 사용자 결정을 바탕으로, 이후 구현과 polish가 같은 기준 위에서 진행되도록 shell, filter ownership, shared interaction rule을 고정하고, `frontend-developer`가 바로 구현을 시작할 수 있는 handoff 기준을 제공한다.

## Scope

이번 문서는 방향 메모가 아니라 handoff 가능한 설계 문서다.

고정 대상은 아래 3가지다.

1. shell contract
2. `SpendingPage` filter ownership
3. shared interaction spec direction

색상, spacing, typography 미세 조정은 이번 문서 범위가 아니다. 다만, 어떤 surface에 어떤 interaction rule을 적용해야 하는지는 구현자가 다시 해석하지 않도록 명시한다.

## Current Context

- frontend는 canonical route 5개 기준으로 동작한다.
  - `/`
  - `/analysis/spending`
  - `/analysis/assets`
  - `/analysis/insights`
  - `/operations/workbench`
- 최근 review 결과, 재작업 가능성이 큰 리스크는 다음 세 가지로 압축됐다.
  - shell source-of-truth 분산
  - `SpendingPage` filter hierarchy 불안정
  - page별 interaction rule drift

## Locked Decisions

## 1. Shell Contract

desktop shell은 icon-only rail이 아니라 label이 보이는 standard sidebar 방향으로 정리한다.

topbar는 아래 역할만 맡는다.

- breadcrumb
- page title
- meta badge

topbar는 기본적으로 page-level filter나 bulk action을 직접 소유하지 않는다. 그런 control은 page body 안에 둔다.

이 결정의 목적은 desktop/mobile IA 차이를 줄이고, route 추가 시 sidebar/topbar를 다시 뜯는 비용을 줄이는 데 있다.

### Handoff Requirements

- router, desktop sidebar, mobile drawer, topbar breadcrumb/title metadata는 단일 route manifest를 source-of-truth로 사용해야 한다.
- route manifest는 최소 아래 필드를 가져야 한다.
  - `path`
  - `section`
  - `label`
  - `title`
  - `breadcrumb`
  - `desktopNav`
  - `mobileNav`
- desktop sidebar는 icon + label 조합을 사용한다.
- mobile drawer는 같은 정보 구조를 유지하되, collapsible group이 필요하면 desktop과 동일 section naming을 써야 한다.
- topbar는 body-level action/filter를 받지 않는다.
- page가 topbar에 올릴 수 있는 것은 `meta badge` 하나로 제한한다.

### Acceptance Criteria

- 새 route를 추가할 때 sidebar, drawer, topbar title이 한 파일 수정으로 함께 반영된다.
- desktop/mobile navigation label hierarchy가 서로 다르게 보이지 않는다.
- topbar에서 filter row나 bulk action row가 렌더링되지 않는다.

## 2. SpendingPage Filter Ownership

`SpendingPage`는 filter ownership을 아래처럼 나눈다.

### Page-global

- `detail range`
- `income toggle`

이 두 값은 페이지 안의 주요 분석 section이 공통으로 참조한다.

### Section-local

- `calendar month`
- `category drill-down`

이 값들은 각 section 안의 로컬 control로 유지한다.

### Section-specific global-like control

- `timeline range`

`timeline range` 는 페이지 전체 filter가 아니라 상단 추이 section 전용 control로 취급한다.

즉, 상단 추이 카드의 관찰 범위를 바꾸는 역할이지, 하단 breakdown/table/calendar 전체를 직접 지배하는 기본 filter로 보지 않는다.

### Handoff Requirements

- `SpendingPage`는 filter state를 아래 세 층으로 분리해야 한다.
  - timeline-only state
  - page-global state
  - section-local state
- page-global state는 최소 아래 section에 공유된다.
  - category breakdown
  - subcategory breakdown
  - fixed cost summary
  - merchant treemap
  - transaction table
- section-local state는 다른 section query key를 오염시키면 안 된다.
- UI copy나 badge에서도 filter ownership이 드러나야 한다.
  - 예: treemap badge는 최근 3개월 고정이 아니라 detail range를 반영
  - 예: calendar card는 자기 own month control을 명시

### Acceptance Criteria

- `detail range`를 바꾸면 breakdown, treemap, transaction table이 같은 기간으로 동시에 바뀐다.
- `calendar month` 변경은 calendar card에만 영향을 준다.
- `category drill-down` 변경은 subcategory card에만 영향을 준다.
- timeline slider 변경은 월별 카테고리 추이 card에만 영향을 준다.

## 3. Shared Interaction Spec Direction

shared interaction rule은 page별 예외를 늘리기보다 공통 규칙으로 강하게 묶는다.

우선 고정 대상은 아래다.

- card header action
- accordion 사용 기준
- pagination 위치와 밀도
- `loading / empty / error / ready` 상태 배치
- mobile table-card fallback
- destructive action 표현 규칙

## Draft Rules

### Card Header

- header에는 `title + meta badge + 최대 1 action`만 둔다.
- filter control은 가능하면 card body 상단으로 내린다.
- 설명 문구가 필요하면 header 아래 body 첫 줄에 둔다.

### Query State

- section state는 항상 card body 내부에서 전환한다.
- header는 loading/error 여부와 무관하게 최대한 안정적으로 유지한다.
- 공통 상태 순서는 `loading -> error | empty | ready` 로 통일한다.

### Tables And Mobile Cards

- desktop은 dense table을 유지한다.
- mobile은 같은 데이터를 card로 재배열하되, 정보 우선순위는 동일해야 한다.
- mobile card 상단에는 1순위 값 1~2개만 둔다.
- secondary metadata는 그 아래로 내린다.

### Pagination

- pagination은 해당 데이터 surface 바로 아래에 둔다.
- 카드 바깥이나 페이지 하단으로 흩어 놓지 않는다.
- 크기와 interaction density는 공통 primitive로 맞춘다.

### Accordion

- accordion은 보조 작업에만 사용한다.
- 핵심 read/write workflow는 accordion 안에 숨기지 않는다.
- destructive block은 항상 마지막에 둔다.

### Destructive Actions

- destructive action은 label 없는 icon-only 버튼으로 두지 않는다.
- `delete`, `reset` 계열은 항상 텍스트 의미를 동반한다.
- danger surface와 confirmation wording을 공통 규칙으로 맞춘다.

### Handoff Requirements

- `SectionCard`는 아래 슬롯 모델을 지원하거나, 최소한 이 모델을 깨지 않는 사용 방식으로 통일한다.
  - `title`
  - `meta`
  - `action`
  - `description`
  - `body`
- 상태 컴포넌트는 page마다 다른 위치에 렌더링하지 말고 card body 안에서 일관되게 렌더링한다.
- table에서 mobile card fallback이 필요한 경우, desktop table과 같은 데이터 우선순위를 유지해야 한다.
- pagination은 항상 data surface 바로 아래에 위치해야 한다.
- accordion은 `WorkbenchPage`의 upload/history/danger 같은 secondary workflow에만 사용한다.
- write surface의 destructive action은 text label과 confirmation copy를 함께 가져야 한다.

### Acceptance Criteria

- `InsightsPage`, `SpendingPage`, `WorkbenchPage`의 card header가 같은 시각 규칙을 따른다.
- loading/error/empty 위치가 카드마다 제각각 다르지 않다.
- mobile에서 table이 card로 바뀌어도 1순위 값이 무엇인지 desktop과 달라지지 않는다.
- `Danger Zone` 류 액션은 icon-only가 아니며, destructive wording이 공통 패턴을 따른다.

## Immediate Implications

다음 구현 배치는 아래 순서로 가는 것이 맞다.

1. `SpendingPage` correctness batch
   - slider controlled 정리
   - real subcategory breakdown
   - treemap/detail-range sync
2. shell manifest 정리
   - router/sidebar/mobile/topbar source-of-truth 통합
3. shared state/interactions 정리
   - section state wrapper
   - pagination/action/header rule 적용

## Implementation Order For Handoff

`frontend-developer`는 아래 순서로 진행한다.

1. route manifest 추가
   - router/sidebar/drawer/topbar 중복 정의 제거
2. `SpendingPage` state 분해
   - timeline-only / page-global / section-local 구분
3. `SpendingPage` correctness batch
   - slider controlled 정리
   - subcategory breakdown 실제 구현
   - treemap period sync
4. shared card/state rule 적용
   - `SectionCard` 사용 패턴 통일
   - section state wrapper 도입
5. `WorkbenchPage` surface 분해
   - filter bar / bulk panel / table / secondary accordions 구획 명확화

## Non-Goals

- 이번 문서는 구체적인 색상값, font token 수치, chart palette 재정의를 다루지 않는다.
- 이번 문서는 새로운 route 추가를 요구하지 않는다.
- 이번 문서는 backend API 변경을 요구하지 않는다.

## Deferred

아래 항목은 위 선결정 위에서 후속 polish로 다룬다.

- sidebar/topbar visual hierarchy 세부 조정
- pagination font scale 세밀화
- dark theme `soft` text contrast 상향
- chart tooltip/legend/annotation polish
- `일별 지출 달력` hover/popover 표현 강화
