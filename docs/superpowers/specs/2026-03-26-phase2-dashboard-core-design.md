# Phase 2 Dashboard Core Design

**Goal:** Phase 2 범위를 frontend 중심의 실행 가능한 작업 단위로 재정의하고, canonical API/read model을 기준으로 대시보드 UI 구현 순서와 공통 설계 기준을 고정한다.

## Scope

Phase 2는 아래 4개 사용자 표면을 포함한다.

1. 메인 대시보드
2. 자산 현황 페이지
3. 지출 분석 페이지
4. 데이터 관리 페이지

이번 설계는 화면 구현 자체보다, 어떤 순서로 어떤 공통 기반 위에서 구현할지를 정의하는 데 초점을 둔다.

## Current Context

- Backend는 Phase 1 기준으로 canonical read model을 제공한다.
  - `vw_transactions_effective`
  - `vw_category_monthly_spend`
- `/api/v1/schema` 는 raw table과 canonical view를 함께 문서화한다.
- Frontend는 현재 placeholder shell만 존재한다.
  - `frontend/src/App.tsx`
  - `frontend/src/pages/PlaceholderApp.tsx`
- 실제 route, API client, page component 분리, chart wiring은 아직 없다.

## Approaches

### Approach 1: Page-by-page direct implementation

각 페이지를 독립적으로 빠르게 구현한다.

- 장점: 첫 페이지가 빨리 보인다.
- 단점: API 호출 방식, 공통 레이아웃, 필터/테이블/카드 패턴이 중복되기 쉽다.
- 단점: 뒤늦게 구조를 정리하면 디자인과 데이터 레이어를 다시 건드리게 된다.

### Approach 2: Shared shell first, then page slices

공통 앱 shell, routing, query/api layer, shared card/filter/table/chart primitives를 먼저 만든 뒤 페이지를 우선순위대로 구현한다.

- 장점: canonical API를 일관되게 쓰게 된다.
- 장점: Phase 2 이후 `income`, `transfers` 페이지 확장에도 구조를 재사용할 수 있다.
- 장점: UI 품질 기준과 접근성 기준을 한 번에 적용하기 쉽다.
- 단점: 첫 화면이 나오기까지 초기 작업이 조금 더 필요하다.

### Approach 3: Data management first

업로드/편집 워크플로우를 먼저 구현하고, 분석 화면은 뒤로 미룬다.

- 장점: 데이터 보정 루프를 먼저 닫을 수 있다.
- 단점: 사용자가 가장 먼저 보고 싶은 “대시보드 경험”이 늦어진다.
- 단점: 제품 인상과 탐색성이 약하다.

## Recommendation

Approach 2를 채택한다.

이 프로젝트는 이미 backend canonical layer가 준비된 상태라, frontend도 공통 read path를 먼저 고정하는 편이 맞다. 대시보드만 먼저 예쁘게 만드는 방식보다, route/app shell/query layer를 먼저 두고 `dashboard -> assets -> spending -> data` 순서로 자르는 편이 재작업이 적다.

## UI Direction

`ui-ux-pro-max` 검색 결과를 Phase 2 기본 디자인 시스템으로 채택한다.

- Product framing: personal finance dashboard
- Style: Data-Dense Dashboard
- Visual direction: 밝은 배경 기반의 핀테크 분석 UI
- Primary color: `#1E40AF`
- Secondary color: `#3B82F6`
- Accent/CTA: `#F59E0B`
- Background: `#F8FAFC`
- Text: `#1E3A8A`
- Typography: `Fira Code` heading + `Fira Sans` body

이 방향은 현재 placeholder shell의 톤과도 이어지고, financial analytics 맥락에 맞는 “차분하지만 밀도 높은” 느낌을 유지한다.

## UX Rules

`ui-ux-pro-max` 결과 중 이번 범위에서 반드시 지킬 항목:

- 중요한 액션은 hover 전용으로 두지 않는다. 터치 환경에서 click/tap으로 동작해야 한다.
- 테이블은 모바일에서 `overflow-x-auto` 또는 card layout fallback을 가져야 한다.
- 아이콘 버튼에는 `aria-label` 또는 시각적으로 숨긴 텍스트를 제공한다.
- `focus-visible` ring을 사용한다.
- `prefers-reduced-motion` 를 존중한다.
- 색만으로 상태를 전달하지 않는다.

## Page Order

### 1. Main Dashboard

가장 먼저 구현한다.

- 이유: 제품의 대표 화면이다.
- 이유: KPI card, line/area trend, donut/category mix, recent transactions 등 공통 컴포넌트를 가장 잘 추출할 수 있다.

### 2. Assets

두 번째로 구현한다.

- 이유: Phase 1에서 assets/investments/loans API가 이미 준비되어 있다.
- 이유: 순자산 차트와 자산/부채 breakdown은 dashboard 이후 재사용이 쉽다.

### 3. Spending

세 번째로 구현한다.

- 이유: 필터/테이블/카테고리 집계 조합이 더 복잡하다.
- 이유: canonical transaction read model이 이미 있으므로 foundation 이후 붙이기 좋다.

### 4. Data Management

네 번째로 구현한다.

- 이유: 쓰기 API와 편집 테이블이 함께 들어가므로 가장 인터랙션 복잡도가 높다.
- 이유: 앞선 화면에서 공통 테이블/폼 패턴을 확보한 뒤 들어가는 편이 안정적이다.

## Architecture

Frontend는 아래 계층으로 나눈다.

### App Shell

- `App.tsx` 는 router, providers, layout만 담당한다.
- top-level navigation과 page container를 공통으로 가진다.

### API Layer

- `frontend/src/api/` 아래에 endpoint별 fetch 함수를 둔다.
- backend canonical read model을 그대로 반영하는 typed response를 사용한다.

### Query Layer

- `frontend/src/hooks/` 에 React Query hooks를 둔다.
- component는 가급적 raw fetch보다 query hook을 소비한다.

### UI Layer

- `frontend/src/components/` 는 재사용 가능한 card, chart wrapper, filters, table, empty/loading/error state로 분리한다.
- `frontend/src/pages/` 는 page composition에 집중한다.

## Charts

`ui-ux-pro-max` 추천과 PRD를 조합한 차트 선택:

- 월별 추이, 순자산 시계열: `Line` 또는 `Area` chart
- 카테고리 비교, 결제수단 비교: `Bar` chart
- 구성 비율: `Pie/Donut` chart
- 복잡한 비교는 MVP에서 억지로 한 화면에 몰지 않고 페이지별로 분리한다

모든 차트는 Recharts만 사용한다.

## Testing Strategy

- route/app shell smoke test
- page-level rendering tests
- API layer 단위 테스트
- 주요 상태 empty/loading/error test
- frontend lint/typecheck/build

## Deliverables

- Phase 2 실행 계획 문서
- `STATUS.md` 에 Phase 2 우선순위 반영
- 이후 구현 배치는 아래 순서로 진행
  - foundation
  - dashboard
  - assets
  - spending
  - data management
