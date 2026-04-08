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

### Shell token map

| Shell component | Primary tokens |
| --- | --- |
| `AppSidebar` | `bg-surface-bar`, `border-border`, `text-text-primary`, `text-text-secondary`, `bg-accent-dim`, `text-accent` |
| `AppTopbar` | `bg-surface-bar`, `border-border-subtle`, `text-text-secondary`, `text-text-primary`, shared meta badge token |
| topbar meta badge | `text-caption`, `text-text-muted`, `bg-surface-bar`, `border-border-subtle`, `rounded-full` |
| mobile drawer | `bg-surface-bar`, `border-border`, `text-text-primary`, `bg-black/60` |

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
[월별 카테고리 추이]

---------------- separator: 아래 섹션은 상세 필터 기준 ----------------

[detail filter bar]

[카테고리별 지출]       [소분류별 지출]

[고정비/변동비 비율]    [고정비 필수/비필수]

[거래처별 지출 비중]

[일별 지출 달력]

[거래 내역 table + pagination]
```

### Blocks

- 월별 카테고리 추이
- timeline/detail scope separator
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

### Component token map

| Block | Component | Primary tokens |
| --- | --- | --- |
| timeline section | `SectionCard` + `StackedAreaChart` | `bg-surface-card`, `border-border`, `text-text-secondary`, `text-micro`, category palette `--chart-category-*` |
| section separator | inline separator row | `bg-border-strong`, `text-caption`, `text-text-faint` |
| detail filter | inline filter panel | `bg-surface-card`, `border-border`, `border-border-strong`, `text-text-secondary`, `text-text-faint` |
| category/subcategory cards | `SectionCard` + `HorizontalBarList` | `bg-surface-card`, `border-border`, `text-text-secondary`, `CHART_ACCENT` |
| ratio cards | `SectionCard` + `SegmentedBar` | `bg-surface-card`, `border-border`, `var(--chart-info-soft)`, `var(--chart-accent)` |
| merchant treemap | `SectionCard` + `NestedTreemapChart` | `bg-surface-card`, `border-border`, category palette alias `--chart-treemap-*`, shared tooltip contract |
| daily calendar | `SectionCard` + `DailyCalendar` | `bg-surface-card`, `bg-border-subtle`, `var(--chart-danger)`, `var(--chart-accent)`, `.chart-tooltip-*` |
| transaction accordion | card shell + table + `Pagination` | `bg-surface-card`, `border-border`, `text-nano` chevron, `text-pagination`, table text tokens without row separators |

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

### Component token map

| Block | Component | Primary tokens |
| --- | --- | --- |
| KPI row | `KpiCard` x4 | `bg-surface-card`, `border-border`, `text-kpi`, `text-text-secondary`, delta accent/danger |
| net-worth chart | `SectionCard` + `LineAreaChart` | `bg-surface-card`, `border-border`, `CHART_ACCENT`, shared tooltip contract |
| investment summary | `SectionCard` + `HorizontalBarList` | `bg-surface-card`, `border-border`, `text-text-secondary`, accent/info tones |
| loan summary | `SectionCard` + summary cards + compact table | `bg-surface-card`, `border-border`, `text-text-primary`, `text-danger`, table text tokens without separators |

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

### Component token map

| Block | Component | Primary tokens |
| --- | --- | --- |
| KPI row | `KpiCard` x3 | `bg-surface-card`, `border-border`, `text-kpi`, accent/danger |
| insight list | `SectionCard` + variant badge | `bg-surface-card`, `border-border`, `text-text-primary`, `text-nano`, accent/danger/warn surfaces |
| recurring / anomaly tables | `SectionCard` + table + `Pagination` | `bg-surface-card`, `border-border`, `text-text-primary`, `text-text-muted`, `text-pagination`, no row separators |
| merchant top 5 | `SectionCard` + control + `HorizontalBarList` | `bg-surface-card`, `border-border`, `text-text-secondary`, `border-border-strong` |
| category mom | `SectionCard` + control + `MoMBarList` | `bg-surface-card`, `border-border`, `CHART_DANGER`, `CHART_ACCENT` |

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

### Component token map

| Block | Component | Primary tokens |
| --- | --- | --- |
| write access alert | `AlertBanner` | warn/danger/accent state surfaces and text tokens |
| filter bar | inline filter shell | `bg-surface-card`, `border-border`, `border-border-subtle`, `text-text-secondary`, `text-text-ghost` |
| bulk edit panel | inline edit panel | `bg-surface-card`, `border-border-subtle`, `text-text-faint`, `border-border-strong` |
| transaction table | table + shared badge + `Pagination` | `bg-surface-card`, `text-text-primary`, `text-text-ghost`, `text-pagination`, shared rounded badge token, no row separators |
| upload / history accordion | accordion shell + compact chevron | `bg-surface-card`, `bg-surface-section`, `border-border-subtle`, `text-nano` chevron |
| danger zone | destructive accordion | `bg-surface-danger`, `bg-surface-danger-muted`, `border-danger-muted`, `text-danger` |

## Notes

- `/income`, `/transfers` 는 현재 live page가 아니며 overview(`/`)로 redirect된다
- 현재 wireframe 기준은 “구현된 프론트엔드”이며, 과거 redesign/plan 문서는 이 문서의 상위 기준이 아니다
