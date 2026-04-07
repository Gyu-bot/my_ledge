# Frontend Reimplementation Wireframe And Functional Requirements

## Purpose

이 문서는 현재 구현된 프론트엔드를 "디자인 없이" 다시 만들기 위한 기능 기준 문서다.
보존 대상은 화면 구조, 정보 계층, 컨텐츠 블록, 상호작용, 상태 처리, API 의존성이다.

## Explicit Exclusions

아래 항목은 이 문서의 범위에서 제외한다.

- 기존 CSS 스타일
- 색상, 폰트, radius, spacing, shadow
- 디자인 토큰
- 기존 디자인 시스템/primitive 선택
- 기존 시각 스타일을 그대로 복제해야 한다는 요구

재구현 시 위 항목은 새로 정의해도 되지만, 아래의 정보 구조와 기능 요구사항은 유지되어야 한다.

## Current Route Map

### Canonical routes

| Route | Role |
| --- | --- |
| `/` | 개요 |
| `/analysis/spending` | 지출 분석 |
| `/analysis/assets` | 자산 현황 |
| `/analysis/insights` | 인사이트 |
| `/operations/workbench` | 거래 작업대 |

### Legacy redirects

| Legacy route | Redirect target |
| --- | --- |
| `/spending` | `/analysis/spending` |
| `/assets` | `/analysis/assets` |
| `/data` | `/operations/workbench` |
| `*` | `/` |

### Not currently implemented as live pages

- `/income`
- `/transfers`

PRD의 과거 범위와 별개로, 현재 프론트엔드의 실제 라우트는 위 5개다.

## Global App Shell

### Desktop wireframe

```text
+--------------------------------------------------------------+
| Left sidebar | Topbar: breadcrumb + page title + meta badge |
| navigation   +-----------------------------------------------+
|              | Main content area                             |
|              | page-specific cards / charts / tables         |
+--------------------------------------------------------------+
```

### Mobile wireframe

```text
+--------------------------------------------------+
| Topbar: menu button + title + optional meta      |
+--------------------------------------------------+
| Main content area                                |
+--------------------------------------------------+
| Sidebar is opened as a drawer                    |
+--------------------------------------------------+
```

### Shell requirements

- 좌측 사이드바 내비게이션이 기본 정보 구조다.
- 상단 topbar가 breadcrumb, 현재 페이지 제목, 페이지별 메타 정보를 표시한다.
- 기존의 페이지 내부 hero/header는 제거됐고, 현재는 topbar가 페이지 제목 역할을 맡는다.
- desktop은 고정형 사이드바, mobile은 drawer 방식이어야 한다.
- 페이지 전환 시 breadcrumb와 title은 현재 route에서 파생되어야 한다.
- 페이지별 메타 badge는 topbar 우측에 표시된다.

### Navigation structure

- 1단계
  - `개요`
  - `분석`
  - `운영`
- 2단계
  - 분석
    - `지출`
    - `자산`
    - `인사이트`
  - 운영
    - `거래 작업대`

## Shared Functional Requirements

- 모든 페이지는 `loading`, `error`, `empty` 상태를 각각 독립적으로 처리해야 한다.
- 적용 기간, 기준일, 건수 같은 메타 정보는 페이지 상단 chrome에서 보여야 한다.
- 읽기용 테이블은 모바일에서 카드형 레이아웃으로 전환되어야 한다.
- 페이지 내 카드/섹션은 독립적으로 비어 있을 수 있으므로, 전체 페이지 실패와 섹션 단위 placeholder를 구분해야 한다.
- 쓰기 기능은 runtime API key 유무에 따라 전체 read-only 모드로 전환될 수 있어야 한다.
- 테이블/리스트 pagination은 사용자에게 현재 페이지, 전체 건수, 이전/다음 이동을 명시해야 한다.

## Page Requirements

### 1. Overview `/`

#### Topbar meta

- 최신 자산 snapshot 기준일

#### Wireframe

```text
[Summary cards x4]

[Monthly cashflow chart]   [Signal summaries]

[Top 5 categories]         [Recent transactions]
```

#### Content blocks

1. Summary cards 4개
- 순자산
- 이번 달 지출
- 이번 달 수입
- 저축률

2. 월간 현금흐름
- 월별 수입, 지출, 순현금흐름 표시
- 적용 기간 표시
- 최근 업로드 상태 표시

3. 주의 신호
- 이상 지출 건수
- 반복 결제 건수
- 수입 안정성

4. 카테고리 요약 Top 5
- 상위 5개 카테고리
- 각 카테고리 점유율

5. 최근 거래
- 최신 거래 목록 read-only 표시
- 적용 기간 표시

#### Functional requirements

- overview는 단일 endpoint가 아니라 여러 읽기 API를 조합해 구성된다.
- summary 카드와 signal summary는 클라이언트에서 조합/계산된 결과를 포함한다.
- 최근 거래는 read-only다.

### 2. Spending `/analysis/spending`

#### Topbar meta

- 현재 상세 조회 범위 `시작 월 ~ 종료 월`

#### Wireframe

```text
[Timeline range slider]

[Monthly category timeline]
[Monthly fixed/variable placeholder]

[Detail filter bar]

[Category breakdown]       [Subcategory breakdown + major filter]
[Fixed necessity placeholder] [Variable ratio placeholder]

[Merchant treemap]

[Daily spend calendar]

[Transactions accordion]
```

#### Content blocks

1. 월별 시계열 범위 제어
- 월 시작/종료 범위 slider
- 적용 버튼
- 초기화 버튼

2. 월별 카테고리 추이
- 카테고리별 월간 지출 시계열
- 상위 카테고리 중심
- 나머지는 `기타`로 묶음

3. 월별 고정비/변동비 추이
- 현재 placeholder만 존재
- 향후 `cost_kind` 분류 데이터가 채워지면 활성화

4. 상세 월 필터
- 시작 월
- 종료 월
- 아래 상세 카드와 거래 내역에 공통 적용

5. 카테고리별 지출
- 선택 기간 기준 카테고리 지출 집계

6. 하위 카테고리별 지출
- 상위 카테고리 select
- 선택된 상위 카테고리 기준 소분류 지출 집계

7. 고정비 필수/비필수 비율
- 현재 placeholder

8. 변동비 비율
- 현재 placeholder

9. 거래처별 Tree Map
- 거래처 기준 지출 규모 집계
- `merchant` 우선, 없으면 `description` fallback

10. 일별 지출 달력
- 표시 모드: `지출만` / `수입 포함`
- 대상 월 선택
- 총합 표시
- 일자별 금액 달력 표시

11. 거래 내역
- accordion으로 접기/펼치기
- `수입 포함` 토글
- pagination
- 현재 조건에 맞는 거래 목록

#### Functional requirements

- 시계열 섹션과 상세 집계 섹션은 서로 다른 필터 범위를 가진다.
- 상세 월 필터 변경 시 거래 내역 페이지는 1페이지로 리셋되어야 한다.
- `수입 포함`이 꺼져 있으면 지출만 조회한다.
- `수입 포함`이 켜져 있으면 수입과 지출을 함께 보여주되, 이 경우 일부 집계는 클라이언트에서 전체 거래를 모아 재구성한다.
- 일별 달력은 선택 월이 없거나 데이터가 없을 때 별도 빈 상태를 보여야 한다.
- 거래 내역은 접힌 상태에서도 카드 헤더에 현재 조건과 페이지 정보를 보여야 한다.

### 3. Assets `/analysis/assets`

#### Topbar meta

- 최신 snapshot 기준일

#### Wireframe

```text
[Summary cards x4]

[Net worth trend]

[Investment summary]       [Loan summary]
```

#### Content blocks

1. Summary cards 4개
- 순자산
- 총자산
- 총부채
- 투자 평가액

2. 순자산 추이
- snapshot 기반 시계열
- 적용 기간 표시
- 데이터가 1개 이하이거나 없으면 fallback/placeholder

3. 투자 요약
- 기준일
- 총 투자원금
- 총 평가액
- 투자 비중 분포

4. 대출 요약
- 기준일
- 총 대출원금
- 총 잔액
- 상위 4개 대출 항목
  - 상품명
  - 금융사
  - 대출 유형
  - 잔액
  - 금리

#### Functional requirements

- 자산 페이지는 자산 snapshot, 투자 summary, 대출 summary를 하나의 페이지 데이터로 정규화해 사용한다.
- 투자/대출 데이터가 없더라도 자산 summary와 순자산 추이는 별도로 표시 가능해야 한다.

### 4. Insights `/analysis/insights`

#### Topbar meta

- 핵심 인사이트 총 건수

#### Wireframe

```text
[Insight summary cards]

[Key insights]

[Recurring payments]       [Spending anomalies]

[Merchant spend top N]     [Category MoM]
```

#### Content blocks

1. 요약 카드
- 저축률
- 수입 변동성
- 이상 카테고리 수

2. 핵심 인사이트
- title + description 리스트

3. 반복 결제
- 반복 결제 후보 테이블
- assumption 설명 보기
- pagination

4. 이상 지출
- baseline 대비 급증 카테고리 테이블
- assumption 설명 보기
- pagination

5. 거래처 소비 Top N
- 거래처명
- 건수
- 평균 금액
- 총 금액
- 적용 기간 표시

6. 카테고리 증감 요약
- 전월 대비 증감이 큰 카테고리
- delta 금액
- 이전 기간 대비 현재 기간 설명

#### Functional requirements

- 인사이트 페이지 초기 로딩은 summary + 첫 페이지 데이터로 구성된다.
- 반복 결제와 이상 지출은 카드별 독립 pagination을 가진다.
- assumption 정보는 진단 가정/한계를 보여주는 부가 정보다.
- merchant spend와 category MoM은 요약형 list이며 별도 drill-down은 없다.

### 5. Operations Workbench `/operations/workbench`

#### Topbar meta

- 현재 표시 건수 / 전체 건수

#### Wireframe

```text
[Read-only warning if no API key]
[Action feedback alert]

[Filter bar]

[Editable transactions table + pagination]

[Accordion: Upload]
[Accordion: Upload history]
[Accordion: Danger Zone]
```

#### Content blocks

1. 쓰기 권한 경고
- runtime API key가 없으면 업로드/수정/삭제/복원/초기화 비활성화

2. 액션 피드백
- 업로드
- 수정
- 일괄 수정
- 삭제
- 복원
- 초기화

3. 필터 바
- 검색
- 거래 유형
- 입력 출처
- 대분류
- 결제수단
- 시작일
- 종료일
- 삭제 포함
- 사용자 수정만
- 적용 / 초기화

4. 거래 편집 작업대
- pagination 기반 거래 목록
- desktop table / mobile card
- row-level 수정
- row-level 삭제
- row-level 복원

5. 일괄 수정 패널
- 선택된 row가 있을 때만 노출
- 공통 거래처
- 공통 대분류
- 공통 소분류
- 공통 고정비/변동비
- 공통 고정비 필수 여부
- 공통 메모
- 일괄 수정 적용

6. 업로드 아코디언
- 파일 선택
- snapshot 기준일 입력
- 업로드 실행
- 업로드 에러 표시
- 최근 업로드 결과 요약

7. 최근 업로드 이력 아코디언
- 파일명
- 상태
- 신규/스킵 건수
- 기준일
- 업로드 시각

8. Danger Zone 아코디언
- 초기화 범위 선택
  - 거래만 초기화
  - 거래 + 스냅샷 초기화
- 확인 문구 입력
- 파괴적 실행 버튼

#### Editable table requirements

- desktop 컬럼
  - 선택
  - 일시
  - 설명
  - 거래처
  - 카테고리
  - 분류
  - 메모
  - 상태
  - 금액
  - 동작
- 상태는 최소 아래를 구분해야 한다.
  - 삭제됨
  - 사용자 수정
  - 원본 상태
- 수정 가능 필드
  - `merchant`
  - `category_major_user`
  - `category_minor_user`
  - `memo`
- 분류 표시 필드
  - `cost_kind`
  - `fixed_cost_necessity`

#### Functional requirements

- 서버 필터링 + 서버 페이지네이션 기반이어야 한다.
- 필터 draft와 applied 상태를 구분해야 한다.
- row 편집 중에는 bulk selection이 풀려야 한다.
- bulk selection 중에는 개별 row 편집을 막아야 한다.
- 삭제된 row는 선택 대상에서 제외되어야 한다.
- reset은 업로드 이력을 지우지 않는다.

## Shared State And Behavior Rules

### Read-only mode

- `has_write_access = false` 면 업로드/수정/삭제/복원/초기화가 모두 비활성화된다.
- 읽기 기능은 계속 동작해야 한다.

### Pagination

- 개요 최근 거래: read-only 목록
- 인사이트 반복 결제: 독립 pagination
- 인사이트 이상 지출: 독립 pagination
- 거래 작업대: 서버 페이지네이션
- 지출 거래 내역: 페이지네이션 + accordion

### Responsive behavior

- desktop 사이드바, mobile drawer
- 읽기용 테이블은 mobile 카드 레이아웃 필요
- 거래 작업대는 desktop table / mobile editable cards 필요

### Placeholder / not-yet-implemented areas

- 지출 페이지 `월별 고정비/변동비 추이`
- 지출 페이지 `고정비 필수/비필수 비율`
- 지출 페이지 `변동비 비율`
- 미구현 live route
  - `income`
  - `transfers`

이 항목들은 현재 화면 구조상 자리를 차지하지만, 실제 기능은 아직 비어 있다.

## Data Dependencies By Page

| Page | Current data sources |
| --- | --- |
| Overview | asset snapshots, category breakdown, recent transactions, monthly cashflow, income stability, recurring payments, spending anomalies, upload logs |
| Spending | category timeline, category breakdown, transactions list, full transaction collection for 일부 집계/달력 |
| Assets | assets summary API with snapshots, investments, loans |
| Insights | monthly cashflow, income stability, recurring payments, spending anomalies, merchant spend, category MoM |
| Operations | transactions list, transaction filter options, upload logs, upload API, update/delete/restore/bulk-update/reset APIs |

## Reimplementation Guidance

- 기존 visual style은 버리고, 위 route 구조와 page block 구조를 기준으로 새 UI를 만들면 된다.
- topbar 기반 페이지 제목/메타 구조는 유지하는 편이 현재 정보 구조와 가장 가깝다.
- `Overview`, `Spending`, `Assets`, `Insights`, `OperationsWorkbench` 5개 페이지가 현재 제품의 실질적인 frontend 범위다.
- `merchant`, 사용자 카테고리 수정값, `cost_kind`, `fixed_cost_necessity`, upload/reset/write-access gating은 운영상 중요한 기능이므로 재구현 시 빠지면 안 된다.
