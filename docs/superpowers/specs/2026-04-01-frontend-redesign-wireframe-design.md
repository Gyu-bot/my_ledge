# Frontend Redesign Wireframe Design

**Goal:** 현재 backend/API surface와 기존 frontend의 기능 범위를 유지하면서, 모바일 대응이 가능한 새로운 정보구조와 화면 와이어프레임을 정의한다. 이번 문서는 구현이 아니라, 재설계할 frontend의 구조와 각 화면의 책임을 확정하는 데 목적이 있다.

## Scope

이번 설계가 다루는 범위:

1. 전역 정보구조
2. 전역 앱 셸과 내비게이션 패턴
3. 주요 페이지와 탭 구성
4. backend endpoint를 어떤 화면이 소비하는지에 대한 매핑
5. 모바일/데스크톱 공통 레이아웃 원칙

이번 설계에서 제외하는 범위:

- 세부 비주얼 스타일 시스템 확정
- 실제 컴포넌트 구현
- 세부 애니메이션/마이크로인터랙션 정의
- Phase 4C backend 미구현 endpoint의 화면 구현

## Required Reference

frontend 구현 시 아래 문서를 단일 시각 기준으로 함께 참조한다.

- `docs/frontend-design-tokens.md`

이 스펙의 정보구조와 새 토큰 문서의 시각 토큰을 조합해 구현한다.

## Current Context

- 현재 frontend는 아래 4개 route만 실제로 구현되어 있다.
  - `/`
  - `/assets`
  - `/spending`
  - `/data`
- 기존 PRD에는 `income`, `transfers` 페이지가 정의되어 있지만, 실제 frontend에는 아직 없다.
- backend는 현재 transaction/assets/upload/data-reset뿐 아니라 advisor analytics endpoint 8종도 이미 제공한다.
- 기존 frontend는 page 단위의 단일 대형 화면 구조가 강하고, 분석 화면과 운영 화면의 성격 차이가 전역 구조에 충분히 반영되지 않는다.
- 사용자는 새 frontend를 `분석`과 `운영`이 모두 중요한 균형형 제품으로 원하지만, 모바일에서도 사용 가능해야 한다.
- 사용자는 advisor analytics를 메인 대시보드에 흡수하지 않고 별도 `인사이트` 성격의 페이지로 분리하길 원한다.
- 사용자는 `운영` 섹션에서 업로드보다 거래 편집을 더 자주 수행할 것으로 예상하며, 거래 작업대가 먼저 보여야 한다고 명시했다.

## Approaches

### Approach 1: 단순 1차 메뉴 균등 구조

상단에 `홈`, `지출`, `자산`, `인사이트`, `데이터`를 같은 위상으로 둔다.

- 장점: 학습 비용이 낮고 직관적이다.
- 장점: 구현 난도가 가장 낮다.
- 단점: `분석`과 `운영`의 성격 차이가 약해진다.
- 단점: 기능이 늘어나면 상단 메뉴가 다시 평평해지고, 홈의 정체성이 모호해질 수 있다.

### Approach 2: 상단 섹션 + 내부 탭의 혼합 구조

전역 상단은 `개요`, `분석`, `운영` 세 섹션으로 나누고, 각 섹션 안에서 내부 탭으로 세부 기능을 전환한다.

- 장점: 데스크톱과 모바일 모두에서 스케일이 좋다.
- 장점: 제품의 큰 문맥을 먼저 고르고, 세부 기능은 짧은 이동으로 접근할 수 있다.
- 장점: advisor analytics를 독립된 `인사이트` surface로 자연스럽게 배치할 수 있다.
- 단점: 정보구조 설계를 먼저 명확히 고정해야 한다.
- 단점: 내부 탭 수가 과도해지면 다시 깊이가 생길 수 있다.

### Approach 3: 운영 중심 워크스페이스 구조

업로드와 거래 작업대를 중심에 두고, 분석은 후순위 패널로 배치한다.

- 장점: 데이터 정리/보정 작업 효율이 높다.
- 장점: write-heavy 워크플로우를 강화하기 쉽다.
- 단점: 제품 첫인상이 백오피스에 가까워진다.
- 단점: 분석 제품으로서의 가치가 약해진다.
- 단점: 모바일에서 분석 컨텍스트가 더 약해질 수 있다.

## Recommendation

Approach 2를 채택한다.

이 프로젝트는 단순한 데이터 입력 도구가 아니라, 개인 재무 분석과 advisor analytics surface를 함께 제공하는 제품이다. 따라서 `분석`과 `운영`을 전역에서 구분하되, 좌측 고정 사이드바보다 모바일 확장성이 좋은 상단 섹션 구조가 더 적합하다.

최종 전역 구조는 아래와 같이 고정한다.

- 전역 섹션: `개요 | 분석 | 운영`
- `분석` 내부 탭: `지출 | 자산 | 인사이트`
- `운영` 내부 탭: `거래 작업대`

운영 보조 기능은 탭이 아니라 작업대 내부 아코디언으로 처리한다.

## Core Information Architecture

### 1. 개요

개요는 전체 제품의 첫 랜딩 화면이다.

포함 요소:

- 최신 기준일 요약
- 핵심 KPI 카드
  - 순자산
  - 이번 달 지출
  - 이번 달 수입
  - 최근 업로드 상태
- 월간 현금흐름 차트
  - income
  - expense
  - transfer
  - net cashflow
- 주의 신호 요약
  - 이상 지출
  - 반복 결제
  - 수입 안정성 요약
- 최근 거래 8건
- 카테고리 요약 Top 5

### 2. 분석

분석은 read-heavy 영역이다. 내부 탭은 아래 3개로 구성한다.

#### 2.1 지출

현재 `/spending` 페이지를 계승하되, advisor analytics 일부를 흡수해 더 밀도 있게 재구성한다.

포함 요소:

- 기간/카테고리/결제수단/검색 필터 바
- 월별 카테고리 추이
- 카테고리별 지출
- 하위 카테고리별 지출
- 결제수단 패턴
- 거래처 소비 treemap
- 일별 소비 캘린더
- 거래 내역 아코디언 테이블
- 보조 진단 카드
  - category MoM
  - fixed cost summary

#### 2.2 자산

현재 `/assets` 페이지를 계승하되, Phase 4C analytics가 들어올 공간을 미리 확보한다.

포함 요소:

- 순자산/총자산/총부채/투자 평가액 카드
- 순자산 추이 차트
- 투자 포지션 요약
- 대출 요약
- 향후 확장 슬롯
  - net worth breakdown
  - emergency fund
  - debt burden
  - investment performance

#### 2.3 인사이트

advisor analytics endpoint 8종의 공식 소비 화면이다. 이번 재설계에서 새로 추가되는 핵심 페이지다.

포함 요소:

- 상단 서브 탭 또는 segmented control
  - 현금흐름
  - 안정성
  - 반복지출
  - 이상탐지
- 핵심 진단 카드
  - 저축률
  - 수입 변동성
  - 이상 카테고리 수
- 주요 인사이트 리스트
- assumptions / 해석 주의사항 패널
- 반복 결제 표
- 이상 지출 표
- 거래처 소비 Top N
- 카테고리 증감 요약

### 3. 운영

운영은 write-heavy 영역이다. 하지만 업로드보다 거래 편집이 더 자주 사용되므로, 랜딩 시 거래 작업대가 먼저 보이도록 고정한다.

#### 3.1 거래 작업대

운영 섹션의 기본 화면이다.

포함 요소:

- 필터 바
- bulk toolbar
- editable transaction table
- selection summary
- 빠른 일괄 수정 패널
- 최근 수정 맥락

#### 3.2 보조 운영 기능

아래 항목은 모두 거래 작업대 아래의 아코디언으로 배치한다.

- 업로드
  - 파일 선택
  - snapshot date
  - 업로드 실행
  - 최근 업로드 결과 요약
- 최근 업로드 이력
- Danger Zone

기본 상태:

- `업로드`: 접힘
- `최근 업로드 이력`: 접힘
- `Danger Zone`: 접힘

## Route Strategy

초기 구현 기준 route 전략:

- `/` → 개요
- `/analysis/spending` → 분석 > 지출
- `/analysis/assets` → 분석 > 자산
- `/analysis/insights` → 분석 > 인사이트
- `/operations/workbench` → 운영 > 거래 작업대

추가 원칙:

- 기존 `/assets`, `/spending`, `/data`는 새 구조 적용 시 redirect 또는 legacy route alias로 유지할 수 있다.
- `income`와 `transfers`는 독립 route로 만들지 않는다.
- 해당 기능은 `개요`의 월간 현금흐름과 `인사이트` 내부 컨텐츠로 흡수한다.

## API Surface Mapping

### 개요

- `GET /api/v1/assets/snapshots`
- `GET /api/v1/transactions/summary`
- `GET /api/v1/transactions/by-category`
- `GET /api/v1/transactions`
- `GET /api/v1/analytics/monthly-cashflow`
- `GET /api/v1/analytics/income-stability`
- `GET /api/v1/analytics/recurring-payments`
- `GET /api/v1/analytics/spending-anomalies`

### 분석 > 지출

- `GET /api/v1/transactions`
- `GET /api/v1/transactions/by-category`
- `GET /api/v1/transactions/by-category/timeline`
- `GET /api/v1/transactions/payment-methods`
- `GET /api/v1/analytics/category-mom`
- `GET /api/v1/analytics/fixed-cost-summary`
- `GET /api/v1/analytics/payment-method-patterns`
- `GET /api/v1/analytics/merchant-spend`

### 분석 > 자산

- `GET /api/v1/assets/snapshots`
- `GET /api/v1/assets/net-worth-history`
- `GET /api/v1/investments/summary`
- `GET /api/v1/loans/summary`

### 분석 > 인사이트

- `GET /api/v1/analytics/monthly-cashflow`
- `GET /api/v1/analytics/category-mom`
- `GET /api/v1/analytics/fixed-cost-summary`
- `GET /api/v1/analytics/merchant-spend`
- `GET /api/v1/analytics/payment-method-patterns`
- `GET /api/v1/analytics/income-stability`
- `GET /api/v1/analytics/recurring-payments`
- `GET /api/v1/analytics/spending-anomalies`

### 운영 > 거래 작업대

- `GET /api/v1/transactions`
- `PATCH /api/v1/transactions/{id}`
- `PATCH /api/v1/transactions/bulk-update`
- `DELETE /api/v1/transactions/{id}`
- `POST /api/v1/transactions/{id}/restore`
- `POST /api/v1/upload`
- `GET /api/v1/upload/logs`
- `POST /api/v1/data/reset`

## Layout Rules

### Desktop

- 전역 상단에서 섹션을 고른다.
- 섹션 내부 탭은 페이지 헤더 아래 가로 배치한다.
- 핵심 본문은 2열 또는 3열 grid를 사용한다.
- 보조 정보는 우측 보조 패널로 둘 수 있다.
- 운영 섹션에서는 작업대 본문이 우선이며, 보조 패널은 선택 상태/빠른 작업만 담당한다.

### Mobile

- 전역 상단은 `개요 | 분석 | 운영` 3개만 보여준다.
- 섹션 내부 탭은 가로 스크롤 가능한 segmented control 또는 tab row를 사용한다.
- 우측 보조 패널은 아래 카드로 떨어뜨린다.
- 운영 섹션은 항상 `거래 작업대`가 첫 화면에 보이도록 하고, 업로드/이력/Danger Zone은 아래 아코디언으로 세로 연결한다.

## Visual System Baseline

시각 토큰은 `docs/frontend-design-tokens.md`를 기준으로 한다.

- primary는 신뢰감 있는 blue
- accent는 보조 강조용 teal
- warning / danger / positive는 재무 상태 의미에 맞춰 구분
- spacing, radius, density는 4px base scale을 사용
- CRM / pipeline 중심 표현은 채택하지 않는다

## UX Rules

- 자주 쓰는 작업은 항상 첫 화면에 배치한다.
- 보조 빈도 기능은 탭보다 아코디언이나 보조 패널로 내린다.
- destructive action은 항상 가장 아래에 배치한다.
- read-heavy 분석 화면과 write-heavy 운영 화면은 시각적 밀도는 유지하되 상호작용 구조를 분리한다.
- `assumptions`가 포함된 analytics 응답은 표나 카드 옆에 해석 주의사항으로 함께 노출한다.
- 모바일에서 2단 이상의 깊은 네비게이션은 만들지 않는다.

## Testing Implications

재설계 구현 시 최소 검증 범위:

- 전역 섹션 전환 렌더링
- 내부 탭 전환 렌더링
- legacy route redirect 동작
- 개요/분석/운영 주요 화면의 loading/empty/error 상태
- 운영 섹션 아코디언 기본 접힘 상태
- 거래 작업대가 운영 섹션 첫 화면에 보이는지 검증
- analytics endpoint를 소비하는 인사이트 화면 렌더링
- 모바일 레이아웃에서 작업대 우선 순서 보장

## Final Decisions

- 정보구조는 `개요 | 분석 | 운영` 혼합형 구조를 채택한다.
- advisor analytics는 별도 `인사이트` 페이지로 분리한다.
- `income` / `transfers`는 독립 페이지로 만들지 않고 현금흐름/인사이트 surface로 흡수한다.
- 운영 섹션의 기본 화면은 `거래 작업대`다.
- `업로드`, `최근 업로드 이력`, `Danger Zone`은 모두 작업대 아래의 접힌 아코디언으로 배치한다.
