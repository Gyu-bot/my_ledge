# Frontend Components and Design Token Inventory

## Scope

이 문서는 현재 `frontend/src` 기준으로 구현된 프론트엔드 컴포넌트를 분류하고, 각 컴포넌트가 어떤 디자인 토큰과 연결되는지 정리한다.

- 기준 소스:
  - `frontend/src/index.css`
  - `frontend/src/components/**/*`
  - `frontend/src/app/*`
- 토큰 원칙 문서:
  - `docs/frontend-design-tokens.md`
- 이 문서는 "현재 구현체 인벤토리" 성격이다.
- 이미 구현됐지만 페이지에 연결되지 않은 컴포넌트도 별도로 기록한다.

## Token Source of Truth

### Typography

| 토큰 | 현재 값 | 주요 적용 영역 |
|---|---|---|
| `--font-heading` | `"Outfit", "Inter", ui-sans-serif, system-ui, sans-serif` | 앱 셸 타이틀, 큰 제목 |
| `--font-body` | `"Inter", ui-sans-serif, system-ui, sans-serif` | 본문, 표, 필터, 설명 텍스트 |
| `--font-mono` | `"Source Code Pro", ui-monospace, SFMono-Regular, monospace` | 현재 직접 사용처는 많지 않지만 코드/숫자형 보조 텍스트 후보 |

### Radius

| 토큰 | 현재 값 | 대표 적용 컴포넌트 |
|---|---|---|
| `--radius-xs` | `4px` | `Badge`, `SelectItem`, 작은 컬러칩 |
| `--radius-sm` | `8px` | `Button`, `Input`, `Checkbox`, `Alert`, `Separator` 주변 작은 패널 |
| `--radius` | `12px` | `Card`, `AccordionItem`, 표 래퍼, 카드 내부 요약 박스 |
| `--radius-lg` | `16px` | `AsidePanel`, 강조 패널 후보 |
| `--radius-xl` | `20px` | 현재 직접 사용은 제한적 |
| `--radius-full` | `9999px` | 상단 섹션 네비, 섹션 탭, pill 형태 badge/summary label |

### Surface / Border / Text

| 토큰 | 현재 값 | 대표 적용 영역 |
|---|---|---|
| `--color-canvas` | `#f8fafc` | 전체 앱 배경 |
| `--color-surface` | `#ffffff` | 기본 표면 |
| `--color-surface-raised` | `#ffffff` | 카드, 입력 요소 배경 |
| `--color-surface-muted` | `#f1f5f9` | 요약 박스, 표 헤더 배경, muted panel |
| `--color-border` | `#e2e8f0` | 카드, 표, 입력 border |
| `--color-border-strong` | `#cbd5e1` | 요약성 카드/패널의 강조 border |
| `--color-text` | `#0f172a` | 제목, 주요 수치 |
| `--color-text-muted` | `#475569` | 본문, 보조 라벨 |
| `--color-text-subtle` | `#64748b` | overline, caption, 기간 메타 |
| `--color-text-inverse` | `#ffffff` | primary nav active text |

### Semantic Colors

| 토큰 | 현재 값 | 대표 의미 |
|---|---|---|
| `--color-primary` / `--color-primary-strong` / `--color-primary-soft` | blue scale | 핵심 CTA, 활성 네비, 기준 범위 강조 |
| `--color-secondary` / `--color-secondary-soft` | amber scale | 보조 비교축, 현금흐름 지출 bar |
| `--color-accent` / `--color-accent-strong` / `--color-accent-soft` | teal scale | 보조 강조, 추세, info chip |
| `--color-positive` / `--color-positive-soft` | green scale | 현재 직접 사용은 제한적, 향후 상태값 후보 |
| `--color-warning` / `--color-warning-soft` | amber scale | warning alert, validation 메시지 |
| `--color-danger` / `--color-danger-soft` | red scale | destructive button, danger zone, error 상태 |
| `--color-info` / `--color-info-soft` | violet scale | 현재 직접 사용은 제한적, 향후 info 상태 후보 |
| `--color-ring` | `#2563eb` | focus-visible ring |
| `--color-selection` | `rgba(37, 99, 235, 0.18)` | text selection |

### Shadow

| 토큰 | 현재 값 | 대표 적용 영역 |
|---|---|---|
| `--shadow-soft` | `0 1px 2px rgba(15, 23, 42, 0.06)` | 기본 카드, 활성 네비, 작은 float panel |
| `--shadow-medium` | `0 4px 10px rgba(15, 23, 42, 0.08)` | 현재 직접 사용은 제한적 |
| `--shadow-large` | `0 12px 24px rgba(15, 23, 42, 0.12)` | 현재 직접 사용은 제한적 |
| `--shadow-overlay` | `0 20px 40px rgba(15, 23, 42, 0.18)` | 현재 직접 사용은 제한적 |

### Chart Tokens

차트는 `frontend/src/components/charts/chartTheme.ts`의 상수를 통해 CSS 토큰 계열을 정적 색으로 맞춘다.

| 차트 토큰 | 값 | 매핑 의미 |
|---|---|---|
| `CHART_ACCENT` | `#2563eb` | primary 계열 |
| `CHART_ACCENT_SOFT` | `#bfdbfe` | primary-soft 계열 |
| `CHART_SECONDARY` | `#d97706` | secondary 계열 |
| `CHART_COMPLEMENTARY` | `#0f766e` | accent 계열 |
| `CHART_INFO` | `#7c3aed` | info 계열 |
| `CHART_DANGER` | `#dc2626` | danger 계열 |
| `CHART_MUTED` | `#475569` | text-muted 계열 |
| `CHART_BAR_RADIUS_VERTICAL` | `[2, 2, 0, 0]` | bar top rounding |
| `CHART_BAR_RADIUS_HORIZONTAL` | `[0, 2, 2, 0]` | horizontal bar end rounding |

## App Shell Components

### `AppProviders`

- 역할: TanStack Query `QueryClientProvider` 주입
- 사용 목적: 페이지 전체에서 서버 상태 캐시와 재조회 정책 통일
- 토큰 연결: 시각 토큰 직접 사용 없음

### `AppLayout`

- 역할: 전역 페이지 셸
- 사용 목적:
  - skip link 제공
  - 상단 브랜딩 영역 제공
  - `PrimarySectionNav`, `SectionTabNav`로 IA 구성
  - route별 본문 outlet 제공
- 토큰 연결:
  - `bg-dashboard-grid`
  - `--font-heading`
  - `--color-border`
  - `--color-surface`
  - `--radius-full`

### `PrimarySectionNav`

- 역할: 최상위 섹션 이동
- 사용 페이지: 전체 앱 셸
- 현재 항목: `개요`, `분석`, `운영`
- 토큰 연결:
  - active: `--color-primary`, `--color-text-inverse`, `--shadow-soft`
  - inactive: `--color-surface`, `--color-border`, `--color-text-muted`

### `SectionTabNav`

- 역할: 섹션 내부 2차 탭
- 사용 페이지:
  - 분석: `지출`, `자산`, `인사이트`
  - 운영: `거래 작업대`
- 토큰 연결:
  - active: `--color-primary-soft`, `--color-primary`
  - inactive: `--color-surface-muted`, `--color-text-muted`

### `PageHeader`

- 역할: 페이지별 eyebrow, title, description, meta를 통일
- 사용 페이지: 개요, 지출 분석, 인사이트, 자산 현황, 거래 작업대
- 토큰 연결:
  - eyebrow: `Badge variant="secondary"`
  - title/body: `--color-text`, `--color-text-muted`
  - divider: `--color-border`

## UI Primitives

### `Badge`

- variant:
  - `default`, `secondary`: `primary-soft` 기반 배지
  - `accent`: `accent-soft` 기반 배지
  - `reference`: `surface-muted` 기반 기준 기간 배지
  - `destructive`: `danger-soft` 기반 상태 배지
- 사용 목적:
  - 상태 표시
  - period meta
  - rank / source / category chip

### `Button`

- variant:
  - `default`: primary CTA
  - `outline`: secondary action
  - `secondary`: muted filled action
  - `destructive`: danger action
  - `ghost`: icon-only 보조 action
- size:
  - `default`, `sm`, `lg`, `icon`

### `Card`

- 역할: 현재 프로젝트의 기본 정보 컨테이너
- 조합:
  - `CardHeader`
  - `CardTitle`
  - `CardDescription`
  - `CardContent`
  - `CardFooter`
- 토큰 연결:
  - `--radius`
  - `--color-border`
  - `--color-surface-raised`
  - `--shadow-soft`

### `Alert`

- variant:
  - `default`
  - `warning`
  - `destructive`
- 사용 페이지:
  - 거래 작업대 write-access 경고
  - action feedback
  - 업로드 에러/최근 업로드 에러

### 입력형 primitive

| 컴포넌트 | 역할 | 토큰 연결 |
|---|---|---|
| `Input` | date, month, search, text, file 입력 | `--radius-sm`, `--color-border`, `--color-surface-raised`, `--color-ring` |
| `Textarea` | 메모/일괄 메모 입력 | `--radius-sm`, `--color-border`, `--color-ring` |
| `Checkbox` | 필터 포함 여부, 행 선택, 수입 포함 | checked 시 `--color-primary` |
| `Select` | 분류, 카테고리, 월 선택 | trigger/content/item 모두 surface/border/accent 규칙 사용 |

### 구조형 primitive

| 컴포넌트 | 역할 | 토큰 연결 |
|---|---|---|
| `Table` | 데스크톱 표 구조 | row hover에 `accent-soft` |
| `Accordion` | 운영 보조 도구/거래 내역 접기 | border + white surface |
| `Popover` | 인사이트 가정 설명 | surface-raised + shadow-soft |
| `Separator` | 지출 분석 detail scope 구분선 | `--color-border` |

## Common Feedback and Meta Components

### `CardPeriodBadgeGroup`

- 역할: 카드 헤더의 기간/기준일 메타 표시를 표준화
- 현재 사용 페이지:
  - 개요
  - 지출 분석
  - 인사이트
  - 자산 현황
  - 대시보드 카테고리 비중 카드
- 토큰 연결:
  - 내부 badge는 `Badge variant="reference"`
  - 구분 기호는 `--color-text-muted`

### `LoadingState`

- 역할: 전체 페이지 loading fallback
- 사용 페이지: 개요, 인사이트, 자산, 거래 작업대
- 토큰 연결:
  - indicator dot: `--color-primary`
  - title/body: `--color-text`, `--color-text-muted`

### `EmptyState`

- 역할: 전체 페이지 empty fallback
- 사용 페이지: 개요, 지출 분석, 인사이트, 자산, 거래 작업대
- 토큰 연결:
  - dashed border
  - `--color-primary-soft`
  - `--color-text-muted`

### `ErrorState`

- 역할: 전체 페이지 error fallback
- 사용 페이지: 개요, 지출 분석, 인사이트, 자산, 거래 작업대
- 토큰 연결:
  - error chip: red fixed tone
  - detail alert: `Alert variant="destructive"`

### `SectionPlaceholder`

- 역할: 카드 내부 placeholder
- 사용 위치:
  - 지출 분석의 미구현 카드
  - 운영 섹션 최근 업로드 없음
  - 자산 페이지 스냅샷 부재 상태
  - 차트 empty fallback
- 토큰 연결:
  - dashed border
  - `--color-primary-soft` 배경

### `StatusCard`

- 역할: KPI/요약 카드
- 사용 위치:
  - 개요 summary grid
  - 자산 summary grid
- tone:
  - `primary`
  - `accent`
- 토큰 연결:
  - `primary-soft` / `accent-soft`
  - 큰 숫자 타이포

## Layout and Navigation Composites

### `MetricCardGrid`

- 역할: `SummaryCard[]`를 `StatusCard` 그리드로 배치
- 사용 페이지: 개요
- 토큰 연결:
  - `StatusCard`의 tone 시스템 재사용

### `AsidePanel`

- 역할: 사이드 패널용 일반 컨테이너
- 상태: 현재 미사용
- 토큰 연결:
  - `--radius-lg`
  - `--color-surface`
  - `--shadow-soft`

## Filters and Query Controls

### `DateRangeFilter`

- 역할: 시작 월 / 종료 월 month input 조합
- 사용 위치: `TransactionFilterBar` 내부

### `TransactionFilterBar`

- 역할: 지출 분석 detail scope 월 필터 적용/초기화
- 사용 페이지: 지출 분석
- 토큰 연결:
  - `Card`
  - `Input type="month"`
  - `Button default/outline`

### `TimelineRangeSlider`

- 역할: 월별 시계열 전용 dual-range slider
- 사용 페이지: 지출 분석
- 특징:
  - badge로 선택 월 범위 즉시 노출
  - `기간 적용`, `전체 기간` 액션 포함
- 토큰 연결:
  - slider panel: `primary-soft`, `accent-soft`
  - handles: `accent`, `accent-strong`

### `DataManagementFilterBar`

- 역할: 거래 작업대용 고밀도 필터 패널
- 사용 페이지: 거래 작업대
- 포함 필터:
  - 검색
  - 거래 유형
  - 입력 출처
  - 대분류
  - 결제수단
  - 시작일/종료일
  - 삭제 포함
  - 사용자 수정만
- 토큰 연결:
  - dense card layout
  - `Checkbox`, `Input`, `Select`, `Button`

## Data Display Components

### `TransactionsTable`

- 역할: read-only 거래 목록 표시
- 사용 페이지:
  - 개요 `최근 거래`
  - 지출 분석 `거래 내역`
- 반응형 전략:
  - desktop: table
  - mobile: card stack
- 토큰 연결:
  - category/payment chip에 `Badge`
  - row hover `accent-soft`

### `EditableTransactionsTable`

- 역할: 거래 편집 작업대 핵심 테이블
- 사용 페이지: 거래 작업대
- 핵심 기능:
  - 단건 수정
  - 단건 삭제/복원
  - 행 선택
  - 일괄 수정
  - 모바일 카드형 편집
- 현재 노출 필드:
  - 일시
  - 설명
  - 거래처
  - 카테고리
  - 분류(`고정비/변동비`, `고정비 필수 여부`)
  - 메모
  - 상태
  - 금액
- 토큰 연결:
  - bulk panel: `primary-soft`
  - destructive action: `Button variant="destructive"`
  - 상태 badge: `accent`, `destructive`

### `RecurringPaymentsTable`

- 역할: 반복 결제 후보 목록
- 사용 페이지: 인사이트
- 컬럼:
  - 거래처
  - 카테고리
  - 평균 금액
  - 간격
  - 발생 횟수

### `SpendingAnomaliesTable`

- 역할: 이상 지출 후보 목록
- 사용 페이지: 인사이트
- 컬럼:
  - 기간
  - 카테고리
  - 금액
  - 기준 평균
  - 사유

### `CategoryBreakdownTable`

- 역할: 카테고리 비중의 표 버전
- 상태: 현재 미사용
- 의도:
  - 차트 옆 보조 표 또는 접근성 보강용 표면으로 재사용 가능

## Chart and Data-Viz Components

### `CategoryTimelineAreaChart`

- 역할: 월별 카테고리 누적 area chart
- 사용 페이지: 지출 분석
- 토큰 연결:
  - `CHART_NEUTRALS`
  - legend chip는 `Card/Badge`가 아니라 inline token chip

### `HorizontalBarChart`

- 역할: 카테고리별/소분류별 금액 비교
- 사용 페이지: 지출 분석
- 토큰 연결:
  - bar: `CHART_ACCENT`
  - tooltip hover: `CHART_ACCENT_SOFT`

### `DailySpendCalendar`

- 역할: 월별 일자 heat-calendar
- 사용 페이지: 지출 분석
- 토큰 연결:
  - 금액 intensity에 `CHART_ACCENT`, `CHART_ACCENT_SOFT`
  - zero state는 neutral gray

### `MerchantTreemapChart`

- 역할: 거래처별 지출 treemap
- 사용 페이지: 지출 분석
- 토큰 연결:
  - 블록 색상은 `CHART_NEUTRALS`

### `LineTrendChart`

- 역할: 자산 시계열 area/line trend
- 사용 페이지: 자산 현황
- 토큰 연결:
  - line: `CHART_ACCENT`
  - fill gradient: `CHART_ACCENT_SOFT`

### `BreakdownPieChart`

- 역할: 투자 비중 pie chart
- 사용 페이지: 자산 현황
- 토큰 연결:
  - slice 색상: `CHART_NEUTRALS`

### `CategoryDonutChart`

- 역할: 카테고리 비중 donut chart
- 상태: 현재 구현되어 있으나 실사용은 `CategoryBreakdownCard` 내부에 한정
- 참고:
  - `CategoryBreakdownCard` 자체가 현재 페이지에 연결되어 있지 않아 사실상 미노출 상태

## Insights-Specific Composites

### `AssumptionPopover`

- 역할: rule-based analytics의 가정 문구 노출
- 사용 페이지: 인사이트
- 사용 위치:
  - 수입 변동성 summary card
  - 반복 결제 카드
  - 이상 지출 카드
- 토큰 연결:
  - `Button variant="ghost"`
  - `PopoverContent`

### `InsightSummaryCards`

- 역할: 인사이트 KPI 카드 grid
- 사용 페이지: 인사이트
- 특징:
  - 특정 카드에만 `AssumptionPopover` 조건부 노출
  - `StatusCard`와 유사하지만 인사이트 전용으로 유지 중
- 토큰 연결:
  - `primary-soft`, `accent-soft`

## Operations-Specific Composites

### `OperationsAccordions`

- 역할: 운영 보조 도구 모음
- 사용 페이지: 거래 작업대
- 포함 아코디언:
  - 업로드
  - 최근 업로드 이력
  - Danger Zone
- 토큰 연결:
  - 기본 accordion surface
  - danger section에 `danger-soft`

### `WorkbenchSidebar`

- 역할: 작업대 요약 / 현재 필터 / 최근 업로드 맥락 패널
- 상태: 현재 미사용
- 의도:
  - 작업대 좌우 2단 레이아웃 또는 보조 패널 재도입 시 활용 가능

## Dashboard-Specific Composite

### `CategoryBreakdownCard`

- 역할: 기간 선택이 가능한 카테고리 비중 카드
- 현재 상태: 테스트와 구현은 있으나 현재 route/page에는 연결되지 않음
- 내부 구성:
  - `CardPeriodBadgeGroup`
  - preset 버튼
  - custom month input
  - `CategoryDonutChart`
- 공통화 관점:
  - 카드 헤더/기간 변경 패널 구조가 유용하므로 추후 지출 분석 카드와 통합 가능

## Page-Local Composites Not Yet Commonized

현재 페이지 내부 함수로 남아 있어 재사용 범위가 생기면 분리 검토가 필요한 컴포넌트들이다.

| 로컬 컴포넌트 | 위치 | 현재 역할 | 공통화 후보 여부 |
|---|---|---|---|
| `InlineSectionStatus` | `SpendingPage.tsx` | loading/error/empty용 인라인 상태 박스 | 높음 |
| `MonthlyTimelineSection` | `SpendingPage.tsx` | 월별 차트 묶음 | 중간 |
| `DetailFilterSection` | `SpendingPage.tsx` | detail scope 필터 래퍼 | 낮음 |
| `BreakdownSection` | `SpendingPage.tsx` | 기간 집계 카드 묶음 | 중간 |
| `DailySpendSection` | `SpendingPage.tsx` | 달력 + 보조 컨트롤 | 중간 |
| `TransactionsSection` | `SpendingPage.tsx` | 거래 목록 아코디언 + 페이지네이션 | 높음 |
| `InsightCardPagination` | `InsightsPage.tsx` | 카드 내부 페이지네이션 바 | 높음 |
| `UploadResultSummary` | `OperationsAccordions.tsx` | 최근 업로드 결과 요약 박스 | 중간 |

## Current Componentization Assessment

### 공통화가 잘 된 영역

- 앱 셸 네비게이션
- 기본 카드/버튼/배지/입력 primitive
- 전체 페이지 loading/error/empty 상태
- 카드 헤더 기간 메타 표시
- 지출 분석 read-only chart primitives

### 아직 페이지별 조합으로 남은 영역

- 지출 분석의 인라인 상태 패널
- 카드 내부 페이지네이션
- 작업대의 결과 요약 패널
- overview / insights / assets 내 카드 본문용 반복 row 패턴

### 현재 미사용이지만 유지 중인 컴포넌트

- `AsidePanel`
- `WorkbenchSidebar`
- `CategoryBreakdownTable`
- `CategoryBreakdownCard`
- `CategoryDonutChart`는 위 카드의 내부 구현체로만 존재

## Suggested Next Normalization Targets

1. `InlineSectionStatus`를 `components/common/InlineStatusPanel`로 승격
2. `InsightCardPagination`과 거래 내역 pagination row를 공통 `CardPaginationBar`로 통합
3. 카드 내부의 "요약 row list" 패턴을 `MetricListCard`류로 추출
4. 미사용 상태가 길어지는 `WorkbenchSidebar`, `CategoryBreakdownTable`, `AsidePanel`은 유지 목적을 재판단
