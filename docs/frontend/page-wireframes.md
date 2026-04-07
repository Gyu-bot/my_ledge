# Frontend Page Wireframes

**Status:** Active  
**Scope:** Current implemented routes only

## Route Map

### Canonical routes

- `/`
- `/analysis/spending`
- `/analysis/assets`
- `/analysis/insights`
- `/operations/workbench`

### Legacy redirects

- `/spending` → `/analysis/spending`
- `/assets` → `/analysis/assets`
- `/income` → `/`
- `/transfers` → `/`
- `/data` → `/operations/workbench`
- `*` → `/`

## Global Shell

### Desktop

```text
+--------------------------------------------------------------+
| left sidebar | topbar: breadcrumb + title + meta badge      |
+--------------------------------------------------------------+
|              | main content                                  |
|              | page sections                                 |
|              | cards / charts / tables / accordions          |
+--------------------------------------------------------------+
```

### Mobile

```text
+--------------------------------------------------+
| topbar: menu button + title + optional meta      |
+--------------------------------------------------+
| content                                          |
+--------------------------------------------------+
| drawer opens from left                           |
+--------------------------------------------------+
```

### Shell notes

- 페이지 내부 hero header는 없다
- topbar가 page title과 meta badge를 담당한다
- sidebar는 desktop only, mobile은 drawer

## Overview `/`

```text
[KPI x4]

[월간 현금흐름]          [주의 신호]

[카테고리 Top 5]        [최근 거래]
```

### Blocks

- KPI 4개:
  - 순자산
  - 이번 달 지출
  - 이번 달 수입
  - 저축률
- 월간 현금흐름
- 주의 신호
- 카테고리 Top 5
- 최근 거래

### Topbar meta

- `기준일 YYYY-MM-DD`

## Spending `/analysis/spending`

```text
[timeline range slider]

[월별 카테고리 추이]

[detail filter bar]

[카테고리별 지출]       [소분류별 지출]

[고정비/변동비 비율]    [고정비 필수/비필수]

[거래처별 지출 비중]

[일별 지출 달력]

[거래 내역 table + pagination]
```

### Blocks

- timeline range slider
- 월별 카테고리 추이
- detail filter
- 카테고리별 지출
- 소분류별 지출
- 고정비/변동비 비율
- 고정비 필수/비필수
- 거래처별 지출 비중 treemap
- 일별 지출 달력
- 거래 내역

### Topbar meta

- `YYYY-MM ~ YYYY-MM`

## Assets `/analysis/assets`

```text
[KPI x4]

[순자산 추이]

[투자 요약]            [대출 요약]
```

### Blocks

- KPI 4개:
  - 순자산
  - 총자산
  - 총부채
  - 투자 평가액
- 순자산 추이
- 투자 요약
- 대출 요약

### Topbar meta

- `기준일 YYYY-MM-DD`

## Insights `/analysis/insights`

```text
[KPI x3]

[핵심 인사이트]

[반복 결제]            [이상 지출]

[거래처 소비 Top 5]    [카테고리 전월 대비]
```

### Blocks

- KPI 3개:
  - 저축률
  - 수입 변동성
  - 이상 지출 카테고리 수
- 핵심 인사이트
- 반복 결제
- 이상 지출
- 거래처 소비 Top 5
- 카테고리 전월 대비

### Topbar meta

- `핵심 인사이트 N건`

## Workbench `/operations/workbench`

```text
[write access alert]

[filter bar]

[bulk edit panel]   (selection 있을 때만)

[transaction table + pagination]

[업로드 accordion]
[최근 업로드 이력 accordion]
[Danger Zone accordion]
```

### Blocks

- write access alert
- filter bar
- bulk edit panel
- transaction table
- upload accordion
- upload history accordion
- danger zone accordion

### Topbar meta

- `현재 page item count / total count`

## Notes

- `/income`, `/transfers` 는 현재 live page가 아니며 overview(`/`)로 redirect된다
- 현재 wireframe 기준은 “구현된 프론트엔드”이며, 과거 redesign/plan 문서는 이 문서의 상위 기준이 아니다
