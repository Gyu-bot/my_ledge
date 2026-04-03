# Frontend Page Wireframes

## Scope

이 문서는 현재 라우팅 기준 페이지 구조를 와이어프레임 관점으로 정리한다.

- 기준 라우트:
  - `/`
  - `/analysis/spending`
  - `/analysis/assets`
  - `/analysis/insights`
  - `/operations/workbench`
- legacy redirect:
  - `/spending` → `/analysis/spending`
  - `/assets` → `/analysis/assets`
  - `/data` → `/operations/workbench`

## Global Shell

### 앱 셸

- 상단 브랜드 블록
  - `Finance cockpit` overline
  - `my_ledge workspace` 제목
  - 전체 제품 설명 문장
  - 구현 컴포넌트:
    - `AppLayout`
- 1차 섹션 네비
  - `개요`
  - `분석`
  - `운영`
  - 구현 컴포넌트:
    - `PrimarySectionNav`
- 2차 섹션 탭
  - 분석 섹션: `지출`, `자산`, `인사이트`
  - 운영 섹션: `거래 작업대`
  - 구현 컴포넌트:
    - `SectionTabNav`

## 개요

### 페이지 헤더

- 개요 페이지의 목적과 snapshot 기준일을 상단에 표시
- 구현 컴포넌트:
  - `PageHeader`

### KPI 요약 카드 그리드

- 핵심 summary card를 4열 그리드로 노출
- 각 카드는 label, value, detail로 구성
- 구현 컴포넌트:
  - `MetricCardGrid`
  - `StatusCard`

### 월간 현금흐름 카드

- 월 단위로 수입, 지출, net cashflow를 bar/line 혼합 그래프로 표시
- 카드 헤더 우측에 적용 기간과 최근 업로드 상태 badge를 표시
- 구성 요소:
  - 카드 제목
  - 기간 badge group
  - 최근 업로드 상태 badge
  - `ComposedChart`
    - 수입: `Bar`
    - 지출: `Bar`
    - net cashflow: `Line`
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `Badge`
  - Recharts `ComposedChart`

### 주의 신호 카드

- 현재 데이터를 기준으로 해석해야 할 signal summary를 카드 목록으로 표시
- 각 row는 label, value badge, detail 문장으로 구성
- 구현 컴포넌트:
  - `Card`
  - `Badge`

### 카테고리 요약 Top 5 카드

- 지출 비중 상위 5개 카테고리를 순위 중심으로 표시
- 각 row는 순위 badge, category name, share percentage로 구성
- 구현 컴포넌트:
  - `Card`
  - `Badge`

### 최근 거래 카드

- 최신 거래를 read-only 표로 표시
- 카드 헤더에 적용 기간 badge group을 표시
- 반응형에서 모바일은 카드 스택 형태로 전환
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `TransactionsTable`

## 지출 분석

### 페이지 헤더

- 지출 분석 화면의 역할과 화면 목적을 설명
- 구현 컴포넌트:
  - `PageHeader`

### 월별 시계열 섹션

- 시계열 전용 기간을 상단 slider로 조정
- 구현 컴포넌트:
  - `TimelineRangeSlider`

### 월별 카테고리 추이 카드

- 월별 지출을 카테고리별 누적 area chart로 표시
- 적용 기간을 헤더 badge로 표시
- 구성 요소:
  - 카드 제목
  - 설명 텍스트
  - 기간 badge group
  - 카테고리 legend chip
  - stacked area chart
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `CategoryTimelineAreaChart`

### 월별 고정비/변동비 추이 카드

- 향후 고정비/변동비 분류가 채워지면 동일 기간의 area chart를 표시할 자리
- 현재는 placeholder로 구성
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `SectionPlaceholder`

### detail scope 구분 영역

- 시계열 카드와 detail 집계 카드 사이의 필터 기준 전환을 텍스트와 separator로 명시
- 구현 컴포넌트:
  - `Separator`

### detail 월 필터 바

- 아래 집계 카드와 거래 내역에 함께 적용되는 시작 월 / 종료 월 필터
- 구현 컴포넌트:
  - `TransactionFilterBar`
  - `DateRangeFilter`

### 카테고리별 지출 카드

- 선택한 기간 기준 상위 카테고리 지출 금액 비교
- 구성 요소:
  - 카드 제목
  - 설명
  - 기간 badge group
  - horizontal bar chart
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `HorizontalBarChart`

### 하위 카테고리별 지출 카드

- 상위 카테고리 필터를 먼저 고른 뒤 소분류 지출 bar chart를 표시
- 구성 요소:
  - 카드 제목
  - 설명
  - 기간 badge group
  - 상위 카테고리 select
  - horizontal bar chart
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `Select`
  - `HorizontalBarChart`

### 고정비 필수/비필수 비율 카드

- 고정비 세부 분류가 채워지면 비율 시각화를 표시할 자리
- 현재는 placeholder 카드
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `SectionPlaceholder`

### 변동비 비율 카드

- 변동비 구성 비율을 보여줄 자리
- 현재는 placeholder 카드
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `SectionPlaceholder`

### 거래처별 Tree Map 카드

- 거래처 기준 지출 규모를 treemap으로 표시
- 구성 요소:
  - 카드 제목
  - 설명
  - 기간 badge group
  - treemap chart
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `MerchantTreemapChart`

### 일별 지출액 카드

- 선택한 detail 기간 안에서 한 달을 골라 일자별 지출 또는 수입/지출 순변동을 달력으로 표시
- 구성 요소:
  - 카드 제목
  - 설명
  - 적용 기간 badge group
  - `수입 포함` checkbox
  - 현재 선택 월 badge
  - 월 선택 select
  - 총합 요약 박스
  - daily spend calendar
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `Checkbox`
  - `Badge`
  - `Select`
  - `DailySpendCalendar`

### 거래 내역 카드

- 현재 조건에 맞는 거래를 접기/펼치기 가능한 아코디언 안에 표시
- 구성 요소:
  - 카드 제목
  - 설명
  - 적용 기간 badge group
  - `수입 포함` checkbox
  - 현재 페이지 텍스트
  - accordion trigger
  - 거래 표
  - 이전/다음 페이지 버튼
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `Checkbox`
  - `Accordion`
  - `TransactionsTable`
  - `Button`

### 지출 분석의 인라인 상태 박스

- loading/error/empty 상황에서 section 단위 메시지를 표시
- 구현 위치:
  - `InlineSectionStatus` in `SpendingPage.tsx`
- 현재는 공통 컴포넌트로 분리되지 않음

## 인사이트

### 페이지 헤더

- rule-based diagnostics 중심 화면임을 상단에서 설명
- 구현 컴포넌트:
  - `PageHeader`

### 인사이트 요약 카드 그리드

- 요약 지표를 4열 카드로 표시
- 일부 카드에는 가정 설명 popover가 붙음
- 구현 컴포넌트:
  - `InsightSummaryCards`
  - `AssumptionPopover`

### 핵심 인사이트 카드

- title + description 쌍의 해석 포인트를 stack 형태로 표시
- 구현 컴포넌트:
  - `Card`
  - 내부 row panel

### 반복 결제 카드

- 반복 결제 후보 목록을 표 형태로 표시
- 카드 헤더에 가정 설명 popover를 배치
- 표 아래에 이전/다음 pagination bar를 배치
- 구성 요소:
  - 카드 제목
  - 설명
  - assumption popover
  - recurring payments table
  - card-local pagination
- 구현 컴포넌트:
  - `Card`
  - `AssumptionPopover`
  - `RecurringPaymentsTable`
  - `InsightCardPagination` in `InsightsPage.tsx`

### 이상 지출 카드

- baseline 대비 급증한 카테고리를 표 형태로 표시
- 카드 헤더에 가정 설명 popover를 배치
- 표 아래에 이전/다음 pagination bar를 배치
- 구현 컴포넌트:
  - `Card`
  - `AssumptionPopover`
  - `SpendingAnomaliesTable`
  - `InsightCardPagination` in `InsightsPage.tsx`

### 거래처 소비 Top N 카드

- 상위 거래처 지출을 row list로 표시
- 각 row는 거래처명, 건수/평균금액, 총 금액 badge로 구성
- 카드 헤더에 적용 기간 badge group을 표시
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `Badge`

### 카테고리 증감 요약 카드

- 전월 대비 증감이 큰 카테고리를 row list로 표시
- delta amount는 badge로 강조
- 카드 헤더에 적용 기간 badge group을 표시
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `Badge`

## 자산 현황

### 페이지 헤더

- 자산 화면 목적과 snapshot 기준일 표시
- 구현 컴포넌트:
  - `PageHeader`

### 자산 KPI 요약 카드 그리드

- summary card를 4열로 배치
- 마지막 카드는 accent tone을 사용
- 구현 컴포넌트:
  - `StatusCard`

### 순자산 추이 카드

- 적재된 snapshot 기준 순자산 변화를 trend chart로 표시
- 카드 헤더에 적용 기간 badge group을 표시
- 데이터가 1개뿐이면 single-point summary로 대체
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `LineTrendChart`
  - `SectionPlaceholder`

### 투자 요약 카드

- 최신 투자 snapshot 기준 총 투자원금, 총 평가액, 비중 pie chart를 표시
- 카드 헤더에 기준일 badge를 표시
- 구성 요소:
  - 카드 제목
  - 설명
  - 기준일 badge group
  - 2개 KPI box
  - allocation pie chart
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `BreakdownPieChart`
  - `SectionPlaceholder`

### 대출 요약 카드

- 최신 대출 snapshot 기준 총 대출원금, 총 잔액, 주요 대출 목록을 표시
- 카드 헤더에 기준일 badge를 표시
- 구성 요소:
  - 카드 제목
  - 설명
  - 기준일 badge group
  - 2개 KPI box
  - 상위 4개 대출 row list
- 구현 컴포넌트:
  - `Card`
  - `CardPeriodBadgeGroup`
  - `SectionPlaceholder`

## 거래 작업대

### 페이지 헤더

- 운영 섹션의 목적과 현재 표시 건수를 상단에 표시
- 구현 컴포넌트:
  - `PageHeader`

### write access 경고 alert

- runtime API key가 없으면 수정/업로드 동작이 비활성화됨을 표시
- 구현 컴포넌트:
  - `Alert variant="warning"`

### action feedback alert

- 업로드, 수정, 삭제, 복원, reset 결과 피드백을 표시
- 구현 컴포넌트:
  - `Alert`

### 작업대 필터 바

- 거래 편집 대상 집합을 좁히는 고밀도 필터 패널
- 구성 요소:
  - 검색 input
  - 거래 유형 select
  - 입력 출처 select
  - 대분류 select
  - 결제수단 select
  - 시작일/종료일 input
  - 삭제 포함 checkbox
  - 사용자 수정만 checkbox
  - 필터 적용/초기화 button
- 구현 컴포넌트:
  - `DataManagementFilterBar`

### 거래 편집 작업대 카드

- 운영 섹션의 메인 surface
- 구성 요소:
  - 카드 제목
  - 설명
  - `EditableTransactionsTable`
  - 하단 페이지 정보와 이전/다음 pagination
- 구현 컴포넌트:
  - `Card`
  - `EditableTransactionsTable`
  - `Button`

### 편집 테이블 내부 구조

- desktop:
  - 행 선택 checkbox
  - 일시
  - 설명
  - 거래처
  - 카테고리
  - 분류
  - 메모
  - 상태
  - 금액
  - 동작 버튼
- mobile:
  - 카드 스택
  - 주요 메타와 편집 필드만 vertical 배치
- 일괄 수정 패널:
  - 선택된 행이 있을 때만 노출
  - 공통 거래처/분류/메모 입력
  - 공통 고정비/변동비, 고정비 필수 여부 입력
  - 일괄 수정 적용 버튼

### 업로드 아코디언

- 파일 업로드를 보조 도구로 접어 둔 구조
- 구성 요소:
  - 파일 input
  - snapshot 기준일 input
  - 업로드 실행 button
  - upload error alert
  - 최근 업로드 결과 요약
- 구현 컴포넌트:
  - `OperationsAccordions`
  - `Input`
  - `Button`
  - `Alert`

### 최근 업로드 이력 아코디언

- 최근 업로드 기록을 row list로 표시
- 각 row는 파일명, 상태 badge, 신규/스킵 건수, 기준일/업로드 시각으로 구성
- 구현 컴포넌트:
  - `OperationsAccordions`
  - `Badge`

### Danger Zone 아코디언

- 거래만 초기화하거나 스냅샷까지 전체 초기화하는 위험 작업 surface
- 구성 요소:
  - 초기화 범위 select
  - 확인 문구 input
  - destructive 실행 button
- 구현 컴포넌트:
  - `OperationsAccordions`
  - `Button variant="destructive"`

## Implemented but Not Currently Wired

### `CategoryBreakdownCard`

- 기간 선택이 가능한 카테고리 비중 카드
- 현재 라우트에는 붙지 않음
- wireframe 상 재활용 후보:
  - 개요 보조 카드
  - 지출 분석 상단 summary 카드

### `CategoryBreakdownTable`

- 카테고리 비중의 표형 보조 카드
- 현재 라우트에는 붙지 않음

### `WorkbenchSidebar`

- 작업대 요약 / 필터 / 최근 업로드 맥락을 사이드 패널로 묶는 컴포넌트
- 현재 작업대는 단일 컬럼 중심이라 연결되지 않음

### `AsidePanel`

- 범용 보조 패널 컨테이너
- 현재 페이지에 직접 연결되지 않음
