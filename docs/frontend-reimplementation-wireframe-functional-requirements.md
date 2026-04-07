# Frontend Reimplementation Functional Requirements

**Status:** Active  
**Intent:** 현재 구현된 프론트엔드를 시각 스타일과 무관하게 다시 만들기 위한 기능 기준 문서

## Purpose

보존 대상은 아래다.

- route 구조
- shell 구조
- 페이지별 정보 계층
- 상태 처리
- 상호작용
- API 의존성 형태

보존 대상이 아닌 것은 아래다.

- 색상
- 폰트
- spacing
- radius
- chart aesthetic
- 기존 컴포넌트 파일 구조 자체

디자인 기준은 `docs/frontend-design-tokens.md`를 본다.

## Current Live Routes

| Route | Role |
| --- | --- |
| `/` | 개요 |
| `/analysis/spending` | 지출 분석 |
| `/analysis/assets` | 자산 현황 |
| `/analysis/insights` | 인사이트 |
| `/operations/workbench` | 거래 작업대 |

### Legacy redirects

| Route | Target |
| --- | --- |
| `/spending` | `/analysis/spending` |
| `/assets` | `/analysis/assets` |
| `/income` | `/` |
| `/transfers` | `/` |
| `/data` | `/operations/workbench` |
| `*` | `/` |

### Deliberately not live

- `/income` and `/transfers` are compatibility redirects only

## App Shell Requirements

- shell은 `left sidebar + topbar + scrollable content` 구조다
- desktop은 고정 sidebar를 사용한다
- mobile은 drawer를 사용한다
- page title은 page body가 아니라 topbar에 표시한다
- 각 페이지는 topbar 우측에 meta badge를 주입할 수 있어야 한다
- breadcrumb/title mapping은 route 기반이어야 한다

## Shared Requirements

- 모든 page/section은 `loading`, `empty`, `error` 상태를 분리해 다룬다
- table/list pagination은 현재 페이지와 전체 건수를 명시한다
- write 기능은 API key가 없으면 read-only 모드로 제한된다
- dense table은 모바일에서 별도 카드형 레이아웃 요구가 있지만, 현재 구현은 page별 적용 범위가 다르므로 재구현 시 same information priority를 유지해야 한다
- page별 meta badge는 page state와 동기화되어야 한다

## Page Requirements

### Overview

- KPI 4개를 최상단에 보여야 한다
- 월간 현금흐름과 주의 신호를 2-column 구조로 배치한다
- 카테고리 Top 5와 최근 거래를 하단에 배치한다
- 최근 거래는 read-only다
- overview는 여러 API 응답을 클라이언트에서 조합한다

### Spending

- timeline 범위와 detail 범위는 분리되어야 한다
- detail range 변경 시 거래 page는 1로 reset된다
- category/subcategory breakdown은 같은 detail range를 공유한다
- fixed/variable, necessity ratio는 `fixed-cost-summary` 기반으로 동작한다
- merchant treemap은 상위 merchant 지출을 시각화한다
- daily calendar는 월 선택을 가진다
- 거래 내역은 table + pagination 구조다

### Assets

- KPI 4개와 순자산 추이를 보여야 한다
- 투자 요약과 대출 요약은 서로 독립 section이다
- 투자 요약은 cost basis / market value / return을 포함한다
- 대출 요약은 principal / balance / rate를 포함한다

### Insights

- KPI 3개를 최상단에 둔다
- 핵심 인사이트는 클라이언트에서 derived summary를 만든다
- 반복 결제, 이상 지출은 assumption toggle을 가진다
- merchant top list와 category MoM summary를 별도 section으로 둔다

### Workbench

- read-only 경고 또는 write-enabled 상태를 상단에서 보여야 한다
- filter bar는 search/type/source/category/payment_method/date range/include_deleted/is_edited를 가진다
- selection이 생기면 bulk edit panel이 나타난다
- 거래 table은 inline edit / delete / restore를 제공한다
- upload, upload history, danger zone은 accordion 구조다

## API Dependency Shape

### Read APIs

- transactions list
- transaction filter options
- assets snapshots / net worth / investments / loans
- analytics monthly cashflow / category mom / fixed cost / merchant spend / recurring / anomalies
- upload logs
- runtime config is read from `window.__MY_LEDGE_RUNTIME_CONFIG__.{ apiKey, apiBaseUrl }` first, then `import.meta.env.VITE_API_KEY`
- month-based UI filters are adapted in the frontend to backend `start_date` / `end_date` query params

### Write APIs

- transaction update
- transaction delete
- transaction restore
- transaction bulk update
- upload
- data reset

## Source Of Truth Hierarchy

프론트엔드 현재 기준 문서는 아래 순서를 따른다.

1. `docs/frontend-design-tokens.md`
2. `docs/frontend/components-and-design-token-inventory.md`
3. `docs/frontend/page-wireframes.md`
4. `docs/frontend-reimplementation-wireframe-functional-requirements.md`
5. `docs/STATUS.md`

`docs/archive/frontend/` 아래 문서는 historical record이며 현재 기준이 아니다.
