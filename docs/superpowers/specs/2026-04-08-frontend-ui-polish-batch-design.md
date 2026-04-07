# Frontend UI Polish Batch Design

## Goal

기존 `docs/STATUS.md` 에 적힌 frontend polish TODO를 하나의 정리된 배치로 묶어,
shell hierarchy, 공통 section contract, page-level interaction, dark theme readability,
Tailnet review 안정화를 함께 정비한다.

## Scope

- 대상 surface:
  - `AppSidebar`
  - `AppTopbar`
  - `SectionCard`
  - `Pagination`
  - chart tooltip / hover state styling
  - `SpendingPage`
  - `InsightsPage`
  - `WorkbenchPage`
  - `DailyCalendar`
  - merchant treemap visualization
  - 관련 테스트와 `vite.config.ts`
- 기존 canonical route와 page IA는 유지한다.
- 실제 backend/frontend dev server는 그대로 사용하고, 이번 변경에서 Tailnet review 용 mockup/preview 접근성만 안정화한다.
- 새 페이지나 새 backend API는 추가하지 않는다.

## Design

### Batch strategy

- 이번 polish 는 시각 정리와 interaction 추가를 분리하지 않고 하나의 배치로 처리한다.
- 이유는 `SectionCard` header 규칙, topbar/sidebar hierarchy, filter/action 배치, page action control 이 서로 묶여 있어서 분리하면 같은 surface 를 두 번 수정하게 되기 때문이다.
- 구현 우선순위는 다음 순서를 따른다.
  - 공통 shell/token contract
  - Spending interaction polish
  - Insights control polish
  - Workbench hierarchy/state polish
  - Tailnet review 안정화와 테스트 보강

### Shell and shared component contract

- `AppSidebar`
  - 기본 desktop collapsed interaction 은 유지한다.
  - section label, item spacing, active/hover contrast, brand block density 를 다시 정렬해 icon-only 와 expanded 상태의 위계를 더 분명하게 만든다.
- `AppTopbar`
  - breadcrumb, title, meta badge 의 baseline 을 정렬한다.
  - mobile/desktop 모두에서 title 과 meta badge 가 흔들리지 않게 height 와 spacing 을 통일한다.
- `SectionCard`
  - 현재 `title + badge + body` 구조를 `title / meta / action / description / body` 로 확장한다.
  - 모든 페이지는 card header 안에서 title, 기간 정보, action control, 설명 문구를 같은 규칙으로 배치한다.
  - loading / error / empty / ready 상태도 section boundary 내부에서 통일된 구조를 가지게 한다.
- `Pagination`
  - pagination font size 를 토큰화하고 현재보다 한 단계 줄인다.
  - dense table/card footer 에도 시각적으로 과하지 않도록 line-height 와 control padding 을 함께 축소한다.
- theme tokens
  - dark theme 에서 `text-text-ghost`, `text-text-faint`, 기타 soft 계열이 낮은 대비를 보이는 지점을 상향 조정한다.
  - 조정은 전역 토큰 중심으로 하고, page-level hardcoded color class 는 가능한 한 제거한다.
- divider and dense border tone
  - card 내부 table divider, list divider, accordion divider 는 현재보다 한 단계 낮은 대비를 사용한다.
  - primary card boundary 는 유지하되, card 내부 구조선은 background tone 과 덜 충돌하는 subtler border 로 통일한다.
- chart hover and tooltip contract
  - chart hover 시 highlight background 는 현재 surface / accent palette 와 어울리는 tone 으로 맞춘다.
  - chart tooltip 의 text color 는 기존 semantic token 을 우선 사용하고, chart tooltip 전용 semantic token 이 부족하면 토큰을 추가해 재사용 가능하게 만든다.
  - hover active state 에서만 임시 hardcoded color 를 넣지 않고, line/area/bar/treemap 공통 hover contract 를 만든다.

### Spending page

- `월별 카테고리 추이`
  - stacked bar 를 stacked area 차트로 변경한다.
  - series 는 Top 5 카테고리만 개별 표시하고, 나머지는 `기타` 로 묶는다.
  - chart legend 와 section meta 는 이 집계 규칙을 드러내야 한다.
  - 기존 range slider 는 제거하고, detail filter 와 같은 month picker 방식으로 기간을 선택하게 바꾼다.
  - section badge 문구는 `조회 기간` 으로 통일하고 선택 기간을 직접 보여준다.
- `일별 지출 달력`
  - hover 또는 focus 시 날짜와 금액을 보여주는 lightweight popover 를 추가한다.
  - mobile 에서는 tap 또는 pressed state 로 동일 정보를 읽을 수 있어야 한다.
- `소분류별 지출`
  - `카테고리별 지출` 과 같은 기준 기간 badge 를 추가한다.
  - badge 는 공통 section meta token 을 사용해 동일한 시각 규칙을 따른다.
- `거래처별 지출 비중`
  - 단일 merchant treemap 대신 nested treemap 으로 바꿔 상위 depth 는 카테고리, 하위 depth 는 거래처가 되도록 한다.
  - 사용자는 카테고리별 면적 비중과 각 카테고리 내부 merchant 비중을 한 번에 읽을 수 있어야 한다.
  - nested hover/tooltip 도 공통 chart hover contract 를 따른다.
- 상세 필터/section header
  - 현재 카드 밖에 흩어진 filter row 와 section header 표현을 공통 contract 에 맞게 정리한다.
  - `조회 기간`, `상세 필터`, `거래 내역` 사이의 hierarchy 를 더 명확히 해서 시선 흐름이 period selection → breakdown → calendar/table 로 자연스럽게 이어지게 한다.

### Insights page

- `거래처 소비 Top 5`
  - 기간 선택지를 `최근 1개월 / 3개월 / 6개월 / 1년` 으로 제공한다.
  - 선택 control 은 card action slot 에 두고, 결과 badge 는 현재 선택 기간을 반영한다.
- `카테고리 전월 대비`
  - 기준월 선택 UI 를 제공한다.
  - 기준월 선택에 따라 comparison month 가 다시 계산되며, topbar meta 와 충돌하지 않게 card local control 로만 표현한다.
- KPI / insight card density
  - KPI row 와 `핵심 인사이트`, `반복 결제`, `이상 지출` 카드 사이의 여백과 보조 텍스트 대비를 맞춘다.
  - `진단 기준` 토글은 action button 스타일을 공통화해 시각적으로 같은 계열의 제어임을 드러낸다.

### Workbench page

- filter bar
  - dense form row 이지만 sectioned toolbar 처럼 읽히도록 그룹 경계와 action alignment 를 재정렬한다.
  - 적용/초기화 버튼은 filter row 끝에 고정된 action cluster 로 보이게 한다.
- bulk panel
  - 선택 개수, bulk field inputs, primary action, dismiss action 의 hierarchy 를 더 명확하게 만든다.
  - read-only 모드에서는 editable control 이 왜 막히는지 상태를 더 직접적으로 보여준다.
- table and secondary accordions
  - 거래 목록 card 와 `업로드 / 최근 업로드 이력 / Danger Zone` accordion 의 위계를 분리한다.
  - secondary accordion 은 같은 visual family 로 묶되, primary transaction table 보다 약한 강조를 사용한다.
- state boundaries
  - loading / error / empty / success feedback 을 table, upload, reset flow 에서 각각 명시적으로 보이게 정리한다.

### Tailnet review and visual companion

- 실제 앱 smoke 는 기존 frontend/backend dev server 를 유지한다.
- visual companion mockup 은 별도 server 로 노출하고, `moltbot.tailbe7385.ts.net` 으로 열 수 있게 유지한다.
- 추가로 `vite.config.ts` 에 Tailnet hostname 허용 경로를 정리해 frontend dev server 자체도 review URL 에서 403 없이 열리게 한다.
- 이 변경은 개발 편의를 위한 것이며 route behavior 나 API proxy 계약은 바꾸지 않는다.

### Testing

- component / page test 보강:
  - `SectionCard` 확장 contract
  - `Pagination` dense token contract
  - chart hover/tooltip semantic styling contract
  - Spending stacked area Top 5 + 기타 집계와 calendar hover interaction
  - Spending period picker contract 과 subcategory badge
  - Spending nested treemap shape/tooltip data contract
  - Insights 기간 선택과 기준월 선택
  - Workbench read-only gating, bulk toolbar, mutation success/error state
  - topbar meta lifecycle 과 canonical route metadata
- verification:
  - `cd frontend && npm test`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`
- visual smoke:
  - Tailnet hostname 으로 mockup server 와 Vite dev server 접근 가능 여부를 확인한다.

## Risks

- 전역 token 대비 조정이 기존 chart/table tone 에도 영향을 줄 수 있으므로, hardcoded text color 제거와 함께 확인해야 한다.
- stacked area 와 nested treemap 으로 차트 타입이 바뀌면 기존 데이터 shape 또는 tooltip payload 가 달라질 수 있으므로 chart adapter 레이어를 정리하는 편이 안전하다.
- `SectionCard` contract 확장은 여러 page 에 영향을 주므로, page-level ad hoc header markup 를 한 번에 정리하지 않으면 중간 상태가 더 복잡해질 수 있다.
- calendar hover interaction 은 desktop pointer 기준으로만 만들면 mobile parity 가 깨질 수 있으므로 focus/tap fallback 을 같이 고려해야 한다.
- Tailnet host allowlist 수정은 dev server 전용 범위로 제한해야 하며 production nginx 동작과 섞지 않는 편이 안전하다.
