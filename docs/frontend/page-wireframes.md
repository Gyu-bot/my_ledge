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
- `/operations/loan-mapping`
- `/operations/installments`
- `/operations/asset-settings`
- `/operations/auto-classification`
- `/operations/canonical-views`
- `/operations/recurring-classification`

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
- 거래 작업대/거래 목록 필터의 `고정/변동`, `필수여부` 수동 편집과 `반복분류` 조회/필터
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

[유동성 Health]       [대출 요약]
```

### Blocks

- KPI 4개:
  - 순자산
  - 총자산
  - 총부채
  - 현금성 자산
- 순자산 추이
- 유동성 Health: 순자산 구성, 자산별 `liquidity_tier` / 현금성 여부 읽기 전용 표시, `자산 설정` 이동
- 대출 요약: 대출별 `monthly_payment` / `repayment_method` 읽기 전용 표시, 계좌 메타의 `loan_kind`와 `derived_from_loan_account` 출처 표시

### Topbar meta

- `기준일 YYYY-MM-DD`

### Component token map

| Block | Component | Primary tokens |
| --- | --- | --- |
| KPI row | `KpiCard` x4 | `bg-surface-card`, `border-border`, `text-kpi`, `text-text-secondary`, delta accent/danger |
| net-worth chart | `SectionCard` + `LineAreaChart` | `bg-surface-card`, `border-border`, `CHART_ACCENT`, shared tooltip contract |
| liquidity health | `SectionCard` + summary cards + `HorizontalBarList` + read-only metadata rows | `bg-surface-card`, `border-border`, `text-text-secondary`, accent/info tones |
| loan summary | `SectionCard` + summary cards + compact read-only table | `bg-surface-card`, `border-border`, `text-text-primary`, `text-danger`, table text tokens without separators |

## Insights `/analysis/insights`

```text
[KPI x3]

[핵심 인사이트]

[재량 지출 속도]      [구매 게이트 후보]

[반복 결제]            [이상 지출]

[거래처 소비 Top 5]    [카테고리 전월 대비]
```

### Blocks

- KPI 3개:
  - 저축률
  - 수입 변동성
  - 이상 지출 카테고리 수
- 핵심 인사이트
- 재량 지출 속도: 월 진행률 대비 재량 지출 baseline 비교
- 구매 게이트 후보: Insights 안의 post-transaction review section으로 둔다. 거래 1건당 1줄, 큰 일회성/새 거래처/거래처 급증/재량 급증 사유 badge 복수 표시, review status, pending 후보의 `7일 숨김`/`닫기` action을 제공한다.
- 반복 결제: 거래처별 반복 후보와 저장된 `할부` / `매월 반복` 분류 결과를 읽기 전용으로 표시
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
| velocity / purchase gate | `SectionCard` + compact candidate rows | `bg-surface-card`, `border-border`, `text-text-secondary`, `text-warn`, `text-danger` |
| recurring / anomaly tables | `SectionCard` + table + `Pagination` | `bg-surface-card`, `border-border`, `text-text-primary`, `text-text-muted`, `text-pagination`, no row separators |
| merchant top 5 | `SectionCard` + control + `HorizontalBarList` | `bg-surface-card`, `border-border`, `text-text-secondary`, `border-border-strong` |
| category mom | `SectionCard` + control + `MoMBarList` | `bg-surface-card`, `border-border`, `CHART_DANGER`, `CHART_ACCENT` |

## Workbench `/operations/workbench`

```text
[write access alert]

[filter bar]

[bulk edit / delete / restore panel]   (selection 있을 때만)

[transaction table + pagination]

[업로드 accordion]
[최근 업로드 이력 accordion]
[Danger Zone accordion]
```

### Blocks

- write access alert
- filter bar: 검색은 분석용 거래처, 원본 설명, 메모를 대상으로 한다.
- bulk edit panel: 거래처/카테고리/고정비/필수여부/메모 수정, delete/restore preview 후 실행
- transaction table: 단건 수정에서 분석용 거래처/카테고리/고정비/필수여부/반복분류/메모를 편집한다.
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

## Recurring Classification `/operations/recurring-classification`

```text
[read-only alert]

[summary]

[dry-run approval candidates]

[selected group bulk classification panel]

[recurring payment candidate table + classification select + pagination]
```

### Blocks

- write access alert
- summary
- dry-run approval candidates: 카테고리 기반 반복결제 제안, confidence, 매칭 거래, 적용 범위
- selected group bulk classification panel
- recurring payment candidate table, `할부` 분류 행의 할부 관리 이동 링크
- group classification select: `미분류`, `할부`, `매월 반복`, `반복 아님`
- pagination

### Topbar meta

- `현재 page item count / total count`

### Component token map

| Block | Component | Primary tokens |
| --- | --- | --- |
| write access alert | `AlertBanner` | warn state surface and text tokens |
| summary | inline shell | `bg-surface-card`, `border-border-subtle`, `text-text-secondary`, `text-text-ghost` |
| dry-run approval candidates | row list + native select + action button | `bg-surface-card`, `border-border-faint`, `bg-accent-dim`, `text-accent` |
| selected group bulk classification panel | inline edit panel | `bg-surface-section`, `border-border-subtle`, `text-info-default`, `bg-accent-dim` |
| recurring table | table + `Pagination` | `bg-surface-card`, `border-border-subtle`, `text-text-primary`, `text-text-muted` |
| classification select | native select | `bg-surface-bar`, `border-border-subtle`, `text-text-secondary` |

## Installments `/operations/installments`

```text
[read-only alert]

[KPI x4]

[할부 항목 관리]

[거래 연결 후보]

[월별 남은 할부 예측]
```

### Blocks

- write access alert
- KPI: active plans, candidate count, remaining projected amount, missed amount
- 할부 항목 관리: 새 할부 항목 생성, 표시명/거래처/총 개월/월 납입액/첫 청구일/메모 저장, 상태 badge
- 거래 연결 후보: 검색은 거래처/원본 설명/메모를 대상으로 하며, `recurring_payment_kind='installment'` 거래와 기존 연결 거래, 단건 연결/해제, 선택 거래 일괄 순차 연결
- 월별 남은 할부 예측: observed/projected/missed 월별 합계와 회차별 schedule card
- 반복결제 화면에서 넘어온 query(`search`, `linked`, `prefill_merchant`, `prefill_amount`)는 후보 필터와 새 할부 항목 초안에 반영한다.

### Topbar meta

- 등록된 할부 항목 수

### Component token map

| Block | Component | Primary tokens |
| --- | --- | --- |
| write access alert | `AlertBanner` | warn state surface and text tokens |
| plan management | `SectionCard` + compact form + plan cards | `bg-surface-section`, `bg-surface-card`, `border-border-subtle`, `text-text-primary`, `text-text-muted` |
| transaction candidates | `SectionCard` + filter bar + table + `Pagination` | `bg-surface-card`, `border-border-subtle`, `text-text-secondary`, `text-pagination` |
| forecast | `SectionCard` + compact summary table + schedule cards | `bg-surface-section`, `border-border-subtle`, `text-info-default`, `text-warn`, `text-danger` |

## Asset Settings `/operations/asset-settings`

```text
[read-only alert]

[자산 설정 안내]

[자산 유동성 설정]

[대출 상환 설정]
```

### Blocks

- write access alert
- 자산 설정 안내: `/analysis/assets`는 조회 전용이며 이 화면에서 metadata를 수정한다는 안내
- 자산 유동성 설정: 최신 자산 row의 `liquidity_tier`와 `is_cash_equivalent` 편집
- 대출 상환 설정: 최신 대출 row의 `monthly_payment`와 `repayment_method` 편집. 연결 거래 추정 월상환액은 수동 입력과 분리된 읽기 영역으로 보여주고 `manual` / `estimated_from_linked_transactions` 출처를 표시한다. 사용자는 필요할 때만 수동 월상환액으로 확정한다. 자산 현황에서 `loan_kind` 기반으로 유도된 상환 방식도 저장 전까지는 조회 전용 fallback이다.
- read-only mode에서는 저장 컨트롤 disabled

### Topbar meta

- `기준일 YYYY-MM-DD`

### Component token map

| Block | Component | Primary tokens |
| --- | --- | --- |
| write access alert | `AlertBanner` | warn state surface and text tokens |
| asset/loan settings | `SectionCard` + row editors | `bg-surface-card`, `border-border-subtle`, `text-text-secondary`, `bg-surface-bar` |

## Auto Classification `/operations/auto-classification`

```text
[upload auto-apply toggles]

[fixed/variable category rules]

[recurring category rules]

[loan merchant rules]
```

### Blocks

- upload auto-apply toggles: 고정비 규칙, 대출 거래처 규칙, 반복결제 규칙
- fixed/variable category rules
- recurring category rules: `할부`, `매월 반복`, `반복 아님`
- loan merchant rules
- apply existing transactions buttons

## Canonical Views `/operations/canonical-views`

```text
[KPI x4]

[월별 현금흐름 chart + table]    [실질 가용액]

[대출 상환] [거래처 기준선] [분류 품질 큐]

[분류 품질 작업 연결]

[Canonical view reference table]
```

### Blocks

- KPI 4개:
  - latest income
  - non-loan spend
  - net cashflow
  - spendable after variable
- 월별 현금흐름: `vw_monthly_cashflow` 실제 row 기반 수입/지출 chart와 월별 table
- 실질 가용액: `vw_true_spendable_monthly` 실제 row 기반 변동 지출 전/후 잔액. 진행 중인 월의 수입이 낮으면 `예상` 태그로 최근 6개 마감월 이상치 제외 baseline 기준 값을 주 표시하고 관측값과 제외 월을 보조 표시
- 대출 상환: `vw_loan_repayment_monthly` 실제 row 기반 대출 계좌별 월 상환액
- 거래처 기준선: `vw_merchant_monthly_baseline` 실제 row 기반 월 지출과 baseline delta
- 분류 품질 큐: `vw_unclassified_work_queue` 실제 row 기반 우선순위 거래
- 분류 품질 작업 연결: 자동분류, 대출 연결, 반복 결제 분류 route link
- canonical view reference table: `/api/v1/schema` 의 view/column registry

### Topbar meta

- `N개월 canonical data`

### Component token map

| Block | Component | Primary tokens |
| --- | --- | --- |
| KPI row | `KpiCard` x4 | `bg-surface-card`, `border-border`, `text-kpi`, `text-text-secondary` |
| monthly cashflow | `SectionCard` + `DualBarChart` + compact table | `bg-surface-card`, `border-border`, shared chart tooltip contract |
| spendable / loan / merchant / queue | `SectionCard` + compact divided rows | `bg-surface-card`, `border-border-subtle`, `text-text-primary`, `text-text-muted` |
| quality links | `SectionCard` + route links | `bg-surface-card`, `border-border-subtle`, `text-text-secondary`, `text-text-ghost` |
| reference table | `SectionCard` + compact table | `bg-surface-card`, `bg-surface-bar`, `border-border-faint`, `text-micro`, `text-caption` |

## Notes

- `/income`, `/transfers` 는 현재 live page가 아니며 overview(`/`)로 redirect된다
- 현재 wireframe 기준은 “구현된 프론트엔드”이며, 과거 redesign/plan 문서는 이 문서의 상위 기준이 아니다
