# 2026-04-08 Codex

## Income Stability Threshold Documentation Follow-up

- 사용자 요청
  - `income stability` 로직 문서에 `불안정` 판단 기준값 설명이 없다는 피드백

### 확인 결과

- backend `income-stability` endpoint는 `coefficient_of_variation` 숫자만 계산해 반환
- `안정/보통/불안정`, `낮음/보통/높음` 해석은 현재 frontend page logic에 있음
  - `OverviewPage`: `< 0.1`, `< 0.25`, 그 이상
  - `InsightsPage`: `< 0.1`, `< 0.25`, 그 이상
- 즉 누락된 건 계산식이 아니라 **threshold 해석 위치와 값 설명**이었음

### 대응

- `docs/backend-api-and-metrics-reference.md`
  - `Income Stability` 섹션에
    - backend는 CV만 계산한다는 점
    - 현재 frontend label threshold 값
    - threshold 변경 포인트가 frontend라는 점
    를 명시

## Backend API And Metrics Reference Documentation

- 사용자 요청
  - `documentation-engineer` 를 써서 현재 backend에 구현된 모든 API 설명/응답과 canonical view 및 주요 지표 산출 로직을 별도 문서로 저장해 달라는 요청

### 진행 메모

- `documentation-engineer` subagent를 두 차례 시도했지만 둘 다 context window 한도로 종료됨
- 문서 자체는 메인 세션에서 코드 기준으로 직접 정리
- 기존 `docs/backend-api-ssot.md` 는 live contract 요약에 가깝고, 이번 문서는 엔지니어용 구현 설명서로 분리

### 작성 범위

- `/api/v1` 전체 endpoint 목록
- 인증 요구사항
- request/query/body와 response model의 핵심 필드
- `vw_transactions_effective`, `vw_category_monthly_spend` canonical view
- 주요 서비스 로직:
  - transaction read/filter/search/effective category
  - upload reconcile / snapshot replace
  - asset snapshot compare
  - monthly cashflow / category mom / fixed cost / merchant spend
  - payment method patterns / income stability / recurring payments / spending anomalies

### 결과

- 새 문서 저장:
  - `docs/backend-api-and-metrics-reference.md`

## Assets KPI Sub Cleanup

- 사용자 요청
  - 자산 현황 페이지에서 KPI 카드 중 `투자 평가액`만 `원금 대비` 텍스트를 남기고, 나머지 KPI 카드의 스냅샷 대비 sub는 제거해 달라는 요청

### 판단

- 이전 턴에서 KPI와 요약 카드의 snapshot compare 문구를 함께 정리했지만, 실제 요구는 KPI 카드의 보조 문구 제거가 더 강했음
- KPI는 한눈에 현재 값만 보여주는 역할이므로 `순자산`, `총자산`, `총부채`는 value-only가 더 맞고, `투자 평가액`만 원금 대비 해석을 유지하는 편이 적절

### TDD

- red
  - `frontend/src/test/pages/AssetsPage.test.tsx`
  - 요약 카드 badge에는 snapshot compare 문구가 남아도 되지만, KPI sub는 `투자 평가액` 카드 1개만 남아야 한다는 테스트로 조정
  - 실행 결과: KPI 4장 모두 `data-testid="kpi-sub"` 를 렌더링하고 있어 실패 확인
- green
  - `frontend/src/pages/AssetsPage.tsx`
  - `순자산`, `총자산`, `총부채` 의 `sub`, `subVariant` 제거
  - `투자 평가액` 만 `원금 대비` sub 유지

### 실행한 명령

- `cd frontend && npm test -- src/test/pages/AssetsPage.test.tsx`
  - 결과: `1 passed`
- `cd frontend && npm test`
  - 결과: `69 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과

### 결과

- 자산 현황 KPI 카드에서 `투자 평가액`만 보조 텍스트 유지
- `순자산`, `총자산`, `총부채`는 현재 값만 표시

## Assets Snapshot Copy Cleanup

- 사용자 요청
  - 자산 현황 페이지는 기간 누적 비교가 아니라 스냅샷 비교인데 KPI 카드와 요약 카드에 `부분 기간` 텍스트가 보이는 건 어색하니 정리해 달라는 요청

### 판단

- `frontend/src/pages/AssetsPage.tsx` 는 `comparison_label` 을 그대로 KPI sub와 투자/대출 badge에 재사용하고 있었고, 이 값이 `부분 기간 · 7일`처럼 보이게 만들고 있었음
- 자산 화면은 기간 진단이 아니라 baseline snapshot 대비 변화 해석이 핵심이므로, 표현도 `이전 스냅샷/기준 스냅샷 대비` 중심으로 바꾸는 것이 맞음

### TDD

- red
  - `frontend/src/test/pages/AssetsPage.test.tsx`
  - 자산 페이지에서는 `부분 기간` 문구가 보이지 않고, baseline snapshot date 기준 비교 문구가 보여야 한다는 테스트로 변경
  - 실행 결과: 기존 `부분 기간 · 7일` 문자열이 그대로 노출되어 실패 확인
- green
  - `frontend/src/pages/AssetsPage.tsx`
  - `comparison_label` 대신 baseline snapshot date 기반 `YYYY-MM-DD 대비 · N일` 문구를 사용하도록 정리
  - non-stale badge tone도 일반 snapshot compare 톤으로 단순화

### 실행한 명령

- `cd frontend && npm test -- src/test/pages/AssetsPage.test.tsx`
  - 결과: `1 passed`
- `cd frontend && npm test`
  - 결과: `69 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과

### 결과

- 자산 현황 KPI/투자/대출 카드에서 `부분 기간` 문구 제거
- baseline snapshot date 중심의 비교 문구만 남겨 자산 화면 의미와 맞도록 정리

## Overview Signal Control And Analytics Metadata

- 사용자 요청
  - 개요 페이지 `주의 신호` 카드에도 `이상 지출` 카드처럼 `직전 마감월 / 부분 기간` 선택 UI를 넣고, API 응답에도 마감월/부분기간 여부 메타데이터를 포함해 달라는 요청
  - 공통 기준 1개를 카드 전체에 적용하는 1번 방식으로 확정

### 판단

- `주의 신호` 카드의 `이상 지출`과 `수입 안정성`은 같은 시간 기준으로 읽히는 것이 맞아서, 지표별 개별 control보다 카드 공통 control이 더 적절
- API 응답도 assumptions 문자열 파싱이 아니라 구조화된 메타데이터를 내려야 프론트가 안정적으로 소비 가능

### TDD

- red
  - `backend/tests/services/test_analytics_service.py`
  - `backend/tests/api/test_analytics_api.py`
  - `income-stability`, `spending-anomalies` 응답에 `comparison_mode`, `reference_date`, `is_partial_period` 이 포함되어야 한다는 테스트 추가
  - `frontend/src/test/pages/OverviewPage.test.tsx`
  - 개요 `주의 신호` 카드에 공통 기준 selector가 있어야 하고, partial 전환 시 `useIncomeStability` 와 `useSpendingAnomalies` 가 같은 기준일로 다시 호출되어야 한다는 테스트 추가
  - 실행 결과: 응답 메타데이터/selector 모두 없어 실패 확인
- green
  - `backend/app/schemas/analytics.py`
  - `backend/app/services/analytics_service.py`
  - `frontend/src/types/analytics.ts`
  - `frontend/src/api/analytics.ts`
  - `frontend/src/hooks/useAnalytics.ts`
  - `frontend/src/pages/OverviewPage.tsx`
  - analytics 응답 메타데이터 추가, `useIncomeStability(params)` 확장, Overview 공통 기준 selector + partial date input 구현

### 실행한 명령

- `cd backend && uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py -q`
  - 결과: `34 passed`
- `cd frontend && npm test -- src/test/pages/OverviewPage.test.tsx`
  - 결과: `3 passed`
- `cd backend && uv run pytest -q`
  - 결과: `86 passed`
- `cd frontend && npm test`
  - 결과: `69 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과

### 결과

- 개요 `주의 신호` 카드에서 `직전 마감월 / 부분 기간` 공통 기준을 선택 가능
- partial 선택 시 `수입 안정성`과 `이상 지출`이 같은 기준일을 공유
- 두 analytics 응답 모두 구조화된 기간 메타데이터를 포함해 프론트가 assumptions 문자열에 의존하지 않게 됨

## Income Stability Period Alignment Hotfix

- 사용자 요청
  - 개요 페이지 `주의 신호` 카드에서 `수입 안정성`도 `이상 지출`과 같은 기준월/부분기간 규칙을 써야 하지 않느냐는 질의
  - endpoint 레벨에서 맞추는 1번 방식으로 정렬 요청

### 원인 조사

- `backend/app/services/analytics_service.py`
  - `get_spending_anomalies()` 는 이미
    - `end_date=None` 이면 직전 마감월 기준
    - partial `end_date` 이면 이전 월도 같은 일자 cutoff
    를 적용하고 있었음
  - 반면 `get_income_stability()` 는 단순히 전달받은 기간의 월별 수입 합계만 계산하고, default closed-month / partial cutoff 로직이 전혀 없었음
- `frontend/src/pages/OverviewPage.tsx`
  - 개요 페이지는 `useIncomeStability()` 와 `useSpendingAnomalies({ page: 1, per_page: 1 })` 를 함께 쓰고 있어, 같은 `주의 신호` 카드 안에서 시간 기준이 서로 달랐음

### TDD

- red
  - `backend/tests/services/test_analytics_service.py`
  - `backend/tests/api/test_analytics_api.py`
  - `income-stability` 도
    - 기본: 직전 마감월만 포함
    - partial `end_date`: 이전 월 same-day cutoff 적용
    해야 한다는 테스트 추가
  - 실행 결과: 현재 월이 포함되고 이전 월 cutoff도 적용되지 않아 실패 확인
- green
  - `backend/app/services/analytics_service.py`
  - `get_income_stability()` 에 `ref_date`, `used_last_closed_month`, `partial_cutoff_day` 로직 추가
  - anomaly와 동일한 helper 패턴으로 assumptions 문구까지 정렬

### 실행한 명령

- `cd backend && uv run pytest tests/services/test_analytics_service.py -q`
  - 결과: `18 passed`
- `cd backend && uv run pytest tests/api/test_analytics_api.py -q`
  - 결과: `16 passed`
- `cd backend && uv run pytest -q`
  - 결과: `86 passed`

### 결과

- `income-stability` 는 이제 `spending-anomalies` 와 같은 기준으로 계산됨
- 개요 페이지 `수입 안정성`도 별도 프론트 수정 없이 직전 마감월 기준/partial same-day cutoff 규칙을 자동으로 따름

## Workbench Subcategory Fallback Hotfix

- 사용자 요청
  - 소분류 콤보박스에 실제 선택값이 비어 있고, 현재 데이터의 카테고리 소분류값으로 옵션을 만들어야 할 것 같다는 피드백

### 원인 조사

- 실제 실행 중인 API 응답을 확인:
  - `curl -s http://127.0.0.1:8000/api/v1/transactions/filter-options`
  - 결과: `category_minor_options`, `category_minor_options_by_major` 필드가 없는 구버전 응답
- 즉 저장소 코드는 최신이지만, 현재 떠 있는 backend 인스턴스는 이전 계약을 그대로 내리고 있었음
- 프론트는 새 필드가 있다고 가정하고 있었기 때문에, 구버전 응답을 받으면 소분류 옵션이 비어 버렸음

### 대응

- `frontend/src/pages/WorkbenchPage.tsx`
  - `filter-options` 응답에 소분류 메타데이터가 없거나 비어 있으면 `txList.data.items` 의 `effective_category_major`, `effective_category_minor` 를 사용해 fallback 옵션 생성
  - 대분류별 fallback map과 전역 소분류 fallback list를 모두 구성
- 이 보강으로 backend가 구버전 응답을 주더라도 현재 화면에 로드된 거래 기준으로 소분류 콤보박스가 채워짐

### TDD

- red
  - `frontend/src/test/pages/WorkbenchPage.test.tsx`
  - `filter-options` 응답에 소분류 메타데이터가 비어 있을 때도 현재 transaction list 데이터에서 소분류 옵션이 보여야 한다는 테스트 추가
  - 실행 결과: 소분류 option 없음으로 실패 확인
- green
  - `frontend/src/pages/WorkbenchPage.tsx`
  - fallback 옵션 생성 로직 추가

### 실행한 명령

- `cd frontend && npm test -- src/test/pages/WorkbenchPage.test.tsx`
  - 결과: `6 passed`
- `cd frontend && npm test`
  - 결과: `68 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과

### 결과

- 구버전 backend `filter-options` 응답에서도 소분류 콤보박스가 현재 로드된 거래 기준으로 채워짐
- backend를 재기동하면 서버 제공 옵션을 우선 사용하고, 그렇지 않으면 fallback이 동작

## Workbench Subcategory Column And Select Hotfix

- 사용자 요청
  - 거래 작업대에서 설명 열 폭을 조금 줄이고, 카테고리 소분류 열을 추가해 달라는 요청
  - 일괄수정 폼에서도 대분류/소분류를 자유입력 대신 콤보박스로 바꿔 달라는 요청

### 판단

- 프론트만 수정하면 소분류 콤보박스를 제대로 채울 수 없어서 backend `/api/v1/transactions/filter-options` 계약 확장이 필요했음
- 소분류는 전역 목록보다 대분류에 따라 좁혀지는 것이 맞아서 `category_minor_options` 와 `category_minor_options_by_major` 를 함께 추가
- edit row와 bulk form 모두 같은 옵션 소스를 쓰도록 맞추고, 대분류 변경 시 소분류 선택은 초기화

### TDD

- red
  - `backend/tests/api/test_transactions_api.py`
  - filter-options 응답에 소분류 목록/대분류별 소분류 매핑이 포함되어야 한다는 테스트 추가
  - `frontend/src/test/pages/WorkbenchPage.test.tsx`
  - 거래 테이블에 effective 소분류가 보여야 하고, bulk panel category 입력이 select 기반이어야 한다는 테스트 추가
- green
  - `backend/app/schemas/transaction.py`
  - `backend/app/services/transactions_service.py`
  - `frontend/src/types/transaction.ts`
  - `frontend/src/pages/WorkbenchPage.tsx`
  - filter-options 응답 확장, 설명 열 폭 축소, 소분류 열 추가, row edit/bulk edit category select 연결

### 실행한 명령

- `cd backend && uv run pytest tests/api/test_transactions_api.py -q`
  - 결과: `8 passed`
- `cd frontend && npm test -- src/test/pages/WorkbenchPage.test.tsx`
  - 결과: `5 passed`
- `cd backend && uv run pytest -q`
  - 결과: `82 passed`
- `cd frontend && npm test`
  - 결과: `67 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과

### 결과

- 거래 작업대 테이블에 소분류 열이 추가되고 설명 열 폭은 더 compact 해짐
- 단건 수정과 일괄수정 모두 대분류/소분류를 콤보박스로 선택 가능
- 소분류 옵션은 대분류에 따라 좁혀져 잘못된 조합 입력을 줄임
- backend/frontend 전체 검증까지 green

## Workbench Transaction Table Usability Hotfix

- 사용자 요청
  - 거래 작업대에서 한 페이지에 보이는 거래 수를 늘리고, 현재 필터/페이지에 보이는 거래를 한 번에 선택할 수 있게 해 달라는 요청
  - 검색은 완전일치가 아니라 포함 검색으로 동작하게 해 달라는 요청

### 판단

- backend `/api/v1/transactions` 검색은 이미 `ILIKE %keyword%` 기반 포함 검색이라 검색 엔진 로직을 바꿀 필요는 없었음
- 실제 수정 포인트는 frontend `WorkbenchPage` 의 page size 고정값과 row-by-row 선택 UX였음
- 선택 범위는 사용자 확인에 따라 "필터 결과 전체"가 아니라 "현재 페이지에 보이는 40건" 기준으로 제한

### TDD

- red
  - `frontend/src/test/pages/WorkbenchPage.test.tsx`
  - `per_page=40` 으로 조회해야 한다는 테스트와, header checkbox 클릭 시 현재 페이지의 visible row 전체가 선택되어야 한다는 테스트를 먼저 추가
  - 실행 결과: `per_page=20` 고정과 header select-all 부재로 실패 확인
- green
  - `frontend/src/pages/WorkbenchPage.tsx`
  - `PAGE_SIZE=40` 상수화
  - header checkbox 추가, 현재 페이지 visible row 기준 전체 선택/해제 로직 추가
  - 부분 선택 시 indeterminate 상태 반영
  - 검색 placeholder를 `거래처·설명 포함 검색` 으로 조정

### 실행한 명령

- `cd frontend && npm test -- src/test/pages/WorkbenchPage.test.tsx`
  - 결과: red 확인 후 green 적용 뒤 `4 passed`
- `cd frontend && npm test`
  - 결과: `66 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과

### 결과

- 거래 작업대는 한 페이지에 40건씩 표시
- 현재 페이지에 보이는 삭제되지 않은 거래를 header checkbox 하나로 일괄 선택/해제 가능
- 검색 UI 문구는 실제 포함 검색 계약과 일치하도록 정렬
- frontend 회귀, lint, typecheck 모두 green

## Desktop Sidebar Collapse

- 사용자 요청
  - 오른쪽 사이드바처럼 느껴지는 데스크톱 네비게이션을 평소에는 icon-only 로 접고 필요할 때 클릭으로 펼치게 바꿔 달라는 요청

### 판단

- 실제 코드에는 별도 right rail 이 없고, `AppSidebar` 가 왼쪽 데스크톱 shell navigation 역할을 하고 있었음
- 새 화면이나 새 route 를 만들지 않고 기존 `AppLayout` + `AppSidebar` 연결만 수정하는 것이 맞다고 판단
- persistence 는 이번 턴 범위에서 제외하고, 앱 진입 시 기본값만 collapsed 로 두기로 결정

### 문서화

- `docs/superpowers/specs/2026-04-08-desktop-sidebar-collapse-design.md`
- `docs/superpowers/plans/2026-04-08-desktop-sidebar-collapse.md`

### TDD

- red:
  - `frontend/src/test/components/layout/AppSidebar.test.tsx`
  - `frontend/src/test/components/layout/AppLayout.test.tsx`
  - 기본 collapsed 상태에서 라벨이 숨겨지고, 토글 후 라벨이 다시 보이는 테스트를 추가
  - 실행 결과: 실패 확인
- green:
  - `frontend/src/components/layout/AppLayout.tsx`
  - `frontend/src/components/layout/AppSidebar.tsx`
  - `AppLayout` 이 `sidebarCollapsed` 상태를 소유
  - `AppSidebar` 가 `collapsed`, `onToggle` 을 받아 폭/브랜드/section label/nav label 렌더링을 분기
  - nav icon-only 상태에서도 `aria-label`, `title` 유지

### 실행한 명령

- `cd frontend && npm test -- --runInBand src/test/components/layout/AppSidebar.test.tsx src/test/components/layout/AppLayout.test.tsx src/test/components/layout/AppTopbar.test.tsx`
  - 결과: `6 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과

### 결과

- 데스크톱 shell 은 기본 icon-only 상태로 시작
- sidebar header 의 chevron 버튼 클릭 시 full-width 로 펼쳐지고 다시 접을 수 있음
- 모바일 drawer 와 topbar breadcrumb 계약은 그대로 유지

## Validation Sweep

- 사용자 요청
  - 필요한 검증을 모두 진행해 달라는 요청

### 실행 기준

- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 기준으로 남아 있던 validation scope를 재확인
- `AGENTS.md` 에서 full build는 사전 확인 대상이라 이번 턴에서는 제외
- 대신 아래 검증을 필수 세트로 실행:
  - backend 전체 회귀
  - frontend 전체 회귀
  - upload/read/edit/reset/assets/source parity 관련 운영 플로우 검증

### 실행한 명령

- `cd backend && uv run pytest -q`
  - 결과: `74 passed`
- `cd frontend && npm test -- --runInBand`
  - 결과: `39 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과
- `cd backend && uv run pytest tests/api/test_upload_api.py tests/api/test_transactions_api.py tests/api/test_data_management_api.py tests/api/test_assets_api.py tests/services/test_source_verification.py -q`
  - 결과: `27 passed`

### 해석

- backend 전체 회귀와 frontend 전체 회귀는 모두 green
- upload → read → edit → reset → assets compare → source parity까지 이어지는 핵심 운영 플로우도 테스트 기준으로 재검증 완료
- 현재 남은 검증성 TODO는 코드 레벨이 아니라 운영 배포본 smoke capture 쪽이다

### 문서 반영

- `docs/STATUS.md`
  - Last Worker / 검증 완료 상태 / 남은 TODO 정리

## Frontend UI Polish Batch Planning

- 사용자 요청
  - 기존 `docs/STATUS.md` 의 frontend polish TODO를 우선으로 하되, divider contrast, chart hover/tooltip tone, Spending stacked area, 조회 기간 picker, nested treemap 요구도 함께 구현해 달라는 요청
  - 상세 구현 계획과 구현 모두 `frontend-developer` 흐름으로 진행하고, 최종 검토 후 보고해 달라는 요청

### 판단

- 기존 TODO와 추가 요구가 서로 강하게 연결돼 있어서 shell/readability와 interaction을 분리하지 않고 한 batch로 묶는 것이 맞다고 판단
- plan 문서는 현재 저장소의 기존 implementation plan 밀도에 맞춰 practical checklist 형태로 두고, 실제 코드 변경은 frontend subagent에 위임하는 방식으로 진행하기로 결정
- mockup/visual companion은 Tailnet URL만 안정화하고, 실제 앱 smoke는 현재 떠 있는 backend/frontend dev server를 그대로 쓰는 방향으로 유지

### 문서화

- `docs/superpowers/specs/2026-04-08-frontend-ui-polish-batch-design.md`
- `docs/superpowers/plans/2026-04-08-frontend-ui-polish-batch.md`

### 계획 범위

- shared shell/token/section contract
- chart hover/tooltip semantic styling
- Spending stacked area + 조회 기간 picker + nested treemap + calendar popover
- Insights 기간/기준월 control
- Workbench hierarchy/read-only/bulk state polish
- Tailnet hostname Vite allowlist 정리와 frontend verification

## Frontend UI Polish Batch Implementation

- 사용자 요청
  - 승인된 UI polish spec과 implementation plan 기준으로 실제 frontend 변경을 진행하고 최종 검토까지 마무리해 달라는 요청

### 구현 범위

- 공통
  - `SectionCard` header contract를 `title/meta/action/description/body` 구조로 확장하고 Spending/Insights/Workbench에 적용
  - divider contrast, `soft` 계열 텍스트, chart hover/tooltip semantic token을 전역 CSS와 chart util에 반영
  - pagination density를 한 단계 줄이고 topbar/sidebar/card/filter hierarchy를 재정렬
- Spending
  - `월별 카테고리 추이` 를 stacked area chart로 교체하고 Top 5 + `기타` 집계 적용
  - 기존 range slider 카드 제거 후 조회 기간 select control + `조회 기간` meta badge로 정렬
  - `소분류별 지출` period meta 추가
  - `거래처별 지출 비중` 을 category > merchant nested treemap으로 교체
  - `일별 지출 달력` 에 hover/focus popover와 active summary를 추가
- Insights
  - `거래처 소비 Top 5` 에 최근 1/3/6/12개월 selector 추가
  - `카테고리 전월 대비` 에 기준월 selector 추가
- Workbench
  - filter bar / bulk panel / secondary accordion hierarchy를 약한 border와 compact spacing 기준으로 재정렬
  - read-only warning path를 테스트로 고정
- Runtime
  - `vite.config.ts` 에 Tailnet hostname allowlist 추가

### 실행한 명령

- `cd frontend && npm test -- --runInBand`
  - 결과: `20 passed`, `48 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과
- `cd frontend && npm run dev -- --host 127.0.0.1 --port 4174`
  - 결과: 임시 Vite server 기동 후 smoke 용도로만 사용하고 즉시 종료
- `curl -I -H 'Host: moltbot.tailbe7385.ts.net' http://127.0.0.1:4174`
  - 결과: `HTTP/1.1 200 OK`

### 결과

- 승인된 1차 UI polish batch는 실제 화면 코드와 테스트까지 반영 완료
- frontend regression, lint, typecheck, Tailnet host allowlist smoke가 모두 green
- 남은 후속은 운영 배포본 capture와 Workbench bulk mutation / topbar meta lifecycle test 보강이다

## Frontend UI Polish Batch Execution

- 사용자 요청
  - 승인된 `docs/superpowers/specs/2026-04-08-frontend-ui-polish-batch-design.md` 와 `docs/superpowers/plans/2026-04-08-frontend-ui-polish-batch.md` 기준으로 현재 workspace에서 frontend polish batch를 구현하고, frontend 검증 후 `docs/STATUS.md` 와 daily log를 갱신해 달라는 요청

### 구현 범위

- 공통
  - `SectionCard`, `Pagination`, dark theme divider/text token contrast 정리
  - chart hover tint / tooltip text color를 semantic token 기반으로 통일
  - `DailyCalendar` hover/focus popover 추가
- Spending
  - `월별 카테고리 추이` 를 Top 5 + `기타` stacked area 차트로 전환
  - timeline/detail 범위를 month picker 기반 `조회 기간` 흐름으로 정리하고 month range 무결성 보정
  - `소분류별 지출` 기간 meta, category -> merchant nested treemap 연결
- Insights
  - `거래처 소비 Top 5` 기간 선택 (`1/3/6/12개월`)
  - `카테고리 전월 대비` 기준월 선택
- Workbench
  - filter / bulk / table / accordion hierarchy 재정렬
  - read-only / bulk apply 문구와 상태 hierarchy 보정
- Tooling
  - Vite dev server host를 `0.0.0.0` 기준으로 열고 MagicDNS host allowlist 추가

### TDD

- red baseline
  - `frontend/src/test/pages/SpendingPage.test.tsx`
  - `frontend/src/test/pages/InsightsPage.test.tsx`
  - 기존 range slider 제거, month picker 노출, Spending/Insights query contract 변경 기준으로 실패 확인
- 추가 red
  - `frontend/src/test/components/DailyCalendar.test.tsx`
  - hover/focus 시 day detail popover가 떠야 한다는 요구를 테스트로 먼저 고정
- green
  - Spending/Insights/DailyCalendar 구현 반영 후 위 테스트와 `chartTheme` 테스트 기대값 갱신

### 실행한 명령

- `cd frontend && npm test -- --runInBand src/test/components/DailyCalendar.test.tsx src/test/pages/SpendingPage.test.tsx src/test/pages/InsightsPage.test.tsx src/test/lib/chartTheme.test.ts`
  - 결과: `4 files passed`, `12 tests passed`
- `cd frontend && npm test -- --runInBand`
  - 결과: `20 files passed`, `48 tests passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과

### 결과

- 승인된 UI polish batch 범위의 frontend 구현과 검증을 완료
- 남은 후속은 운영 배포본 smoke capture와 일부 behavior coverage 보강

## Frontend UI Polish Batch Implementation

- 구현 범위
  - `SectionCard` 에 `meta/action/description` slot을 추가하고 Spending, Insights, Workbench header 패턴을 통일
  - 차트 hover background와 tooltip text/label 색을 semantic chart token으로 정리
  - `SpendingPage` 를 stacked area + 조회기간 month picker + 소분류 기간 badge + category→merchant nested treemap + 일별 달력 hover tooltip 구조로 전환
  - `InsightsPage` 에 거래처 소비 기간 selector와 카테고리 기준월 selector를 추가
  - `WorkbenchPage` filter/table/bulk/read-only 경계의 border contrast를 낮추고 위계를 완만하게 정리
  - `vite.config.ts` 에 Tailnet MagicDNS hostname allowlist를 추가

### 구현 메모

- `frontend-developer` 위임 흔적이 남아 있는 working tree를 기준으로 실제 파일 상태를 재검토하고, 타입/API 연결과 테스트를 메인 세션에서 최종 정리
- `DailyCalendar` tooltip state의 nullable narrowing 오류를 수정해 typecheck를 복구
- chart theme 테스트는 확장된 tooltip style 계약(`color`, `boxShadow`) 기준으로 재확인
- 추가 read-only 회귀 테스트, calendar hover 테스트, `SectionCard` slot 테스트, Spending/Insights selector 테스트를 포함해 전체 frontend 회귀를 재실행
- `frontend-developer` 최종 audit 응답: `No additional findings.`

### 실행한 명령

- `cd frontend && npm run typecheck`
  - 결과: 통과
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm test -- --runInBand src/test/lib/chartTheme.test.ts src/test/components/DailyCalendar.test.tsx`
  - 결과: `2 passed`, `6 passed`
- `cd frontend && npm test -- --runInBand`
  - 결과: `20 passed`, `48 passed`

### 결과

- 기존 UI polish TODO와 추가 요청 범위는 frontend 코드와 테스트 기준으로 반영 완료
- 현재 남은 후속 범위는 운영 배포본 기준 MagicDNS smoke 확인과 일부 behavior coverage 확장이다

## Frontend UI Polish Follow-up

- 사용자 요청
  - breadcrumb 상하 여백과 `MyLedge` 가독성 보강
  - month axis에 연도 포함
  - popover 배경 분리 강화
  - table divider contrast 완화
  - secondary font color 전역 상향
  - Spending stacked area / treemap palette 대비 상향
  - 거래처 treemap category-first drilldown과 높이 확대

### 판단

- shell/readability 성격의 토큰 수정과 Spending treemap interaction 수정이 함께 필요했기 때문에, `frontend-developer` 에게는 treemap drilldown만 분리 위임하고 메인 세션에서는 공통 토큰/formatter/topbar를 정리했다
- month axis 표기는 개별 chart마다 문자열 slice를 반복하던 상태라 `formatMonthAxisLabel` helper로 공통화하는 편이 안전하다고 판단
- table divider와 서브 텍스트 가독성 이슈는 개별 페이지 클래스보다 토큰 재조정으로 푸는 것이 맞다고 판단

### TDD

- red:
  - `frontend/src/test/components/layout/AppTopbar.test.tsx`
  - `frontend/src/test/lib/utils.test.ts`
  - `frontend/src/test/components/NestedTreemapChart.test.tsx`
  - 실행 결과: breadcrumb spacing/brand readability, month-axis formatter, treemap drilldown 관련 실패 확인
- green:
  - `frontend/src/components/layout/AppTopbar.tsx`
  - `frontend/src/lib/utils.ts`
  - `frontend/src/components/charts/{DualBarChart,LineAreaChart,StackedAreaChart,StackedBarChart,NestedTreemapChart}.tsx`
  - `frontend/src/components/ui/DailyCalendar.tsx`
  - `frontend/src/index.css`
  - `frontend/tailwind.config.js`
  - `frontend/src/pages/SpendingPage.tsx`
  - `frontend/src/pages/WorkbenchPage.tsx`

### 실행한 명령

- `cd frontend && npm test -- --runInBand src/test/components/layout/AppTopbar.test.tsx src/test/lib/utils.test.ts src/test/components/NestedTreemapChart.test.tsx`
  - 결과: red 확인 후 green `3 files passed`, `13 tests passed`
- `cd frontend && npm run typecheck`
  - 결과: 통과
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm test -- --runInBand`
  - 결과: `21 files passed`, `53 tests passed`

### 추가 검증

- `cd frontend && npm run dev -- --host 127.0.0.1 --port 4174`
  - 임시 Vite server 기동
- `curl -I -H 'Host: moltbot.tailbe7385.ts.net' http://127.0.0.1:4174`
  - 결과: `HTTP/1.1 200 OK`
- `lsof -ti:4174 | xargs -r kill`
  - 임시 server 종료

### 결과

- topbar breadcrumb는 더 여유 있는 vertical spacing과 brighter brand token으로 정리
- chart month axis는 year-month(`YY.MM`) 형식으로 통일
- chart tooltip / calendar popover는 surface 분리와 stronger border로 배경 대비를 보강
- secondary text와 table divider token을 전역 상향/완화 조정
- Spending treemap은 category-first view에서 merchant drilldown 가능한 taller chart로 전환

## Frontend UI Polish Checklist Follow-up

- 사용자 요청
  - breadcrumb 상단 title 전체를 더 밝게 적용
  - table 구분선은 제거
  - pagination 을 전용 token 기준으로 더 작게 정리
  - stacked area / treemap palette 를 더 대비 있는 dark-theme 친화 색으로 재구성
  - `DailyCalendar` popover 를 날짜 셀 바로 위로 옮기고 chart tooltip 과 같은 스타일 contract로 통일

### 체크리스트

- [x] breadcrumb 상단 title treatment 전역 밝기 상향
- [x] table header/row separator 제거
- [x] pagination 전용 token + compact size 적용
- [x] Spending stacked area / treemap 고대비 palette 재구성
- [x] `DailyCalendar` tooltip 셀 기준 anchor 적용
- [x] `DailyCalendar` tooltip shared chart token contract 적용

### TDD

- red:
  - `frontend/src/test/components/layout/AppTopbar.test.tsx`
  - `frontend/src/test/components/ui/Pagination.test.tsx`
  - `frontend/src/test/components/DailyCalendar.test.tsx`
  - breadcrumb brightness, pagination token, calendar tooltip anchoring 요구를 먼저 실패로 고정
- green:
  - `frontend/src/components/layout/AppTopbar.tsx`
  - `frontend/src/components/ui/Pagination.tsx`
  - `frontend/src/components/ui/DailyCalendar.tsx`
  - `frontend/src/index.css`
  - `frontend/src/lib/chartTheme.ts`
  - `frontend/src/pages/{SpendingPage,InsightsPage,WorkbenchPage,AssetsPage}.tsx`
  - `frontend/tailwind.config.js`

### frontend-developer 위임

- Spending visualization follow-up 을 `frontend-developer` 에 위임
  - palette 재구성
  - `NestedTreemapChart` 의 drilldown 유지
  - `DailyCalendar` tooltip anchoring / shared tooltip token contract
- 메인 세션에서는 topbar, pagination, table separator 제거, 테스트/문서 갱신을 맡아 최종 병합

### 실행한 명령

- `cd frontend && npx vitest run src/test/components/layout/AppTopbar.test.tsx src/test/components/ui/Pagination.test.tsx src/test/components/DailyCalendar.test.tsx`
  - 결과: red 확인
- `cd frontend && npx vitest run src/test/components/layout/AppTopbar.test.tsx src/test/components/ui/Pagination.test.tsx src/test/components/DailyCalendar.test.tsx src/test/lib/chartTheme.test.ts src/test/components/NestedTreemapChart.test.tsx`
  - 결과: `5 files passed`, `13 tests passed`
- `cd frontend && npm run typecheck`
  - 결과: 통과
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm test -- --runInBand`
  - 결과: `21 files passed`, `54 tests passed`

### 결과

- breadcrumb 상단 breadcrumb/title 영역은 route 전반에서 더 밝은 chrome 으로 정리
- table row/header separator 는 제거돼 텍스트 주의력이 더 강하게 유지되도록 조정
- pagination 은 `text-pagination` token 과 compact control sizing 을 사용하도록 통일
- Spending stacked area 와 treemap 은 같은 high-contrast palette 를 공유
- `DailyCalendar` tooltip 은 날짜 셀 wrapper 안에 렌더링돼 hover/focus 한 날짜 바로 위에 뜨고, `chart-tooltip-*` token/class contract 를 공유한다

## Frontend UI Polish Extra Follow-up

- 사용자 요청
  - 거래 작업대의 거래 목록 페이지/건수 badge를 프로젝트 공통 badge 스타일로 정리
  - desktop sidebar font color를 main font color 쪽으로 올려 가독성 개선
  - `SpendingPage` 에 timeline section 과 나머지 section 사이 separator 추가
  - accordion chevron 크기를 현재의 절반 수준으로 축소
  - 프로젝트 전체 popover typography 통일 및 font size 1.5x 상향

### 체크리스트

- [x] Workbench 거래 목록 page/count badge shared token 정렬
- [x] desktop sidebar inactive/section text tone 상향
- [x] `SpendingPage` timeline/detail scope separator 추가
- [x] accordion chevron compact size 적용
- [x] shared popover typography 확대 및 `DailyCalendar`/chart tooltip 통일

### TDD

- red:
  - `frontend/src/test/components/layout/AppSidebar.test.tsx`
  - `frontend/src/test/pages/WorkbenchPage.test.tsx`
  - `frontend/src/test/pages/SpendingPage.test.tsx`
  - `frontend/src/test/components/DailyCalendar.test.tsx`
  - `frontend/src/test/lib/chartTheme.test.ts`
  - badge token, sidebar tone, separator, chevron size, popover typography 요구를 먼저 실패로 고정
- green:
  - `frontend/src/components/layout/AppSidebar.tsx`
  - `frontend/src/pages/WorkbenchPage.tsx`
  - `frontend/src/pages/SpendingPage.tsx`
  - `frontend/src/components/ui/DailyCalendar.tsx`
  - `frontend/src/lib/chartTheme.ts`

### 실행한 명령

- `cd frontend && npx vitest run src/test/components/layout/AppSidebar.test.tsx src/test/pages/WorkbenchPage.test.tsx src/test/pages/SpendingPage.test.tsx src/test/components/DailyCalendar.test.tsx src/test/lib/chartTheme.test.ts`
  - 결과: red 확인 후 green `5 files passed`, `19 tests passed`
- `cd frontend && npm run typecheck`
  - 결과: 통과
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm test -- --runInBand`
  - 결과: `21 files passed`, `58 tests passed`

### 결과

- Workbench 거래 목록의 page/count badge는 shared badge token 기준으로 정리
- desktop sidebar inactive nav/section label은 `text-text-primary` 계열로 상향
- `SpendingPage` 는 월별 카테고리 추이와 나머지 상세 섹션 사이를 separator로 분리해 필터 적용범위가 더 명확해짐
- Spending/Workbench accordion chevron은 `text-nano` 기준으로 축소
- shared chart tooltip font size를 15로 올리고, `DailyCalendar` tooltip도 `text-body-sm` / `text-body-md` typography로 맞춰 project-wide popover 스타일을 통일

## Frontend Token And Wireframe Documentation Refresh

- 사용자 요청
  - 현재 wireframe별 컴포넌트에 어떤 디자인 토큰이 들어가는지, 특히 폰트 색상과 색상 팔레트를 문서로 정리해 달라는 요청

### 판단

- 기존 active 문서가 이미 `docs/frontend-design-tokens.md`, `docs/frontend/page-wireframes.md`, `docs/frontend/components-and-design-token-inventory.md` 로 분리돼 있었기 때문에 새 문서를 늘리기보다 이 세 문서를 현재 구현 기준으로 다시 맞추는 편이 적절하다고 판단
- 토큰 값 source of truth는 `frontend/src/index.css`, semantic alias는 `frontend/tailwind.config.js`, chart token contract는 `frontend/src/lib/chartTheme.ts` 이므로 문서도 같은 레이어 구조를 유지

### 문서 반영

- `docs/frontend-design-tokens.md`
  - `text-pagination` 추가
  - current border/text token value를 실제 코드값으로 갱신
  - text usage guidance 추가
  - category palette value table 추가
  - tooltip/popover typography contract 추가
- `docs/frontend/page-wireframes.md`
  - shell token map 추가
  - Overview/Spending/Assets/Insights/Workbench 각 wireframe에 component token map 추가
  - Spending wireframe을 현재 구현 기준으로 timeline/detail separator 포함 구조로 갱신
- `docs/frontend/components-and-design-token-inventory.md`
  - `AppTopbar`, `Pagination`, `DailyCalendar`, `StackedAreaChart`, `NestedTreemapChart` 최신 token source 반영
  - page inventory를 current wireframe 기준으로 정리

### 검증

- `git diff -- docs/frontend-design-tokens.md docs/frontend/page-wireframes.md docs/frontend/components-and-design-token-inventory.md`
  - 결과: 현재 구현 기준 변경만 포함됨 확인
- `rg -n "text-pagination|chart-tooltip-shadow|#dde5ef|#5d93ff|timeline/detail scope separator|NestedTreemapChart|navigation.ts" docs/frontend-design-tokens.md docs/frontend/page-wireframes.md docs/frontend/components-and-design-token-inventory.md`
  - 결과: 핵심 token / palette / component mapping entry 반영 확인

### 결과

- 현재 frontend wireframe별 component-token mapping, font color usage, chart/category palette가 active 문서 세트에 정리됨
- 이후 디자인 질의에는
  - 값 자체는 `docs/frontend-design-tokens.md`
  - route별 block/token 연결은 `docs/frontend/page-wireframes.md`
  - component-level inventory는 `docs/frontend/components-and-design-token-inventory.md`
  를 기준으로 보면 된다

## Frontend/Backend Follow-up Split Execution

- 사용자 요청
  - 프론트엔드와 백엔드를 각각 서브에이전트로 나눠 검토/구현
  - 프론트엔드:
    - `Pagination` 을 `text-nano` 크기로 축소하고 border 제거
    - `DailyCalendar` tooltip contract/dot 크기 재점검
    - chart axis label 크기를 `text-body-sm` 로 정렬
    - `text-muted`, `text-faint` 일원화
    - `거래처별 지출 비중` 을 `카테고리별/거래처별` selector 구조로 정리
    - 실데이터 상위 8개 카테고리 기준 palette 재매핑
    - `이상 지출` 증감 표기를 단일 방향 부호 규칙으로 수정
  - 백엔드:
    - `spending-anomalies` threshold 의미 확인/수정
    - 이상지출 추가 분석, 반복결제 subtype은 계획 문서에만 추가

### 서브에이전트 분리

- frontend subagent:
  - scope: pagination / daily calendar / treemap / palette / anomaly UI / frontend tests
- backend subagent:
  - scope: anomaly threshold bug / backend tests / analytics plan 문서 보강

### root cause

- `spending-anomalies` 는 `delta_pct` 를 계산해 응답에 실어주고 있었지만, 실제 필터는 `anomaly_threshold` 를 `anomaly_score` cutoff로 적용하고 있었다.
- baseline 평균이 거의 일정한 카테고리는 표준편차가 매우 작아서, 실제 증감률이 16.6% 수준이어도 `anomaly_score` 가 과도하게 커져 threshold `0.5` 를 통과할 수 있었다.
- 사용자 기대와 endpoint 계약상 `0.5` 는 50% 증감률로 해석하는 것이 맞으므로, threshold 비교 대상을 `abs(delta) / baseline_avg` 로 분리해 고정했다.

### TDD

- red:
  - `backend/tests/services/test_analytics_service.py`
    - `test_get_spending_anomalies_uses_threshold_as_delta_ratio_floor`
  - `backend/tests/api/test_analytics_api.py`
    - `test_spending_anomalies_endpoint_applies_threshold_to_percent_change`
  - baseline 표준편차를 작게 만든 16.6% 증가 케이스를 넣고 threshold `0.5` 에서 제외돼야 함을 실패로 고정
- green:
  - `backend/app/services/analytics_service.py`
    - threshold 비교를 `delta_ratio` 기준으로 분리
    - `baseline_avg == 0 and target_amount > 0` 인 경우 신규 지출 발생으로 reason 분기
    - assumptions 문구에 threshold의 퍼센트 의미를 명시
  - `frontend/src/test/pages/InsightsPage.test.tsx`
    - 이상지출 증감 표기가 `++16.6%` 처럼 중복 부호를 내지 않는지 회귀 테스트 추가

### 데이터 검증

- 실DB 상위 지출 카테고리 확인:
  - `금융`, `데이트`, `식비`, `자동차`, `미분류`, `여행/숙박`, `주거/통신`, `문화/여가`
- 확인 명령:
  - `docker compose exec -T db psql -U my_ledge -d my_ledge -c "SELECT effective_category_major AS category, SUM(ABS(amount)) AS total FROM vw_transactions_effective WHERE type='지출' GROUP BY effective_category_major ORDER BY total DESC NULLS LAST LIMIT 12;"`

### 문서 반영

- `docs/superpowers/plans/2026-03-31-advisor-analytics-expansion.md`
  - `recurring-payments` 후속 subtype 분류(`subscription`, `installment`, `general_recurring`) 추가
  - `spending-anomalies` 후속 2차 진단 축(`평균 거래금액`, `거래 횟수`, `merchant outlier`) 추가
- `docs/STATUS.md`
  - frontend follow-up 완료 상태와 backend threshold contract 정렬 반영
  - `anomaly_threshold=0.5` 는 50% 증감률 의미라는 의사결정 추가

### 실행한 명령

- `cd frontend && npm test -- --runInBand src/test/components/ui/Pagination.test.tsx src/test/components/DailyCalendar.test.tsx src/test/components/NestedTreemapChart.test.tsx src/test/lib/chartTheme.test.ts src/test/pages/InsightsPage.test.tsx src/test/pages/SpendingPage.test.tsx`
  - 결과: `6 files passed`, `24 tests passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과
- `cd frontend && npm test -- --runInBand`
  - 결과: `21 files passed`, `62 tests passed`
- `cd backend && uv run pytest tests/services/test_analytics_service.py::test_get_spending_anomalies_uses_threshold_as_delta_ratio_floor tests/api/test_analytics_api.py::test_spending_anomalies_endpoint_applies_threshold_to_percent_change tests/services/test_analytics_service.py::test_get_spending_anomalies_detects_spike tests/api/test_analytics_api.py::test_spending_anomalies_endpoint_detects_spike -q`
  - 결과: `4 passed`
- `cd backend && uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py -q`
  - 결과: `24 passed`
- `cd backend && uv run ruff check .`
  - 결과: 통과
- `cd backend && uv run pytest -q`
  - 결과: `76 passed`

### 결과

- frontend는 요청한 follow-up 항목 기준으로 현재 코드/테스트가 모두 정렬됨
- backend `spending-anomalies` 는 threshold를 사용자 기대대로 “기준선 대비 증감률”로 해석하도록 계약이 정리됨
- anomaly drill-down과 recurring subtype은 live contract를 흔들지 않고 계획 문서에 후속으로만 추가함

## Spending Anomalies Threshold Rollback

- 사용자 피드백
  - 이상지출 로직은 수정 전 방식이 더 맞다고 판단
  - 기존 판정 로직으로 롤백하고, `assumptions` 설명만 더 자세히 남기길 요청

### 판단

- 직전 수정은 사용자 기대(`0.5 = 50%`)에는 맞았지만, 실제 live contract는 이미 `anomaly_score` cutoff 기반으로 소비되고 있었다.
- 따라서 score 기반 판정은 유지하고, 응답에서 threshold 의미를 숨기지 않는 쪽이 더 안전하다.

### TDD

- red:
  - `backend/tests/services/test_analytics_service.py`
    - `test_get_spending_anomalies_filters_on_anomaly_score`
  - `backend/tests/api/test_analytics_api.py`
    - `test_spending_anomalies_endpoint_documents_anomaly_score_threshold`
  - `16.6%` 증가지만 `anomaly_score > 0.5` 인 금융 케이스가 계속 노출되고, assumptions 에 `anomaly_score` 기준이라는 문구가 포함돼야 함을 실패로 고정
- green:
  - `backend/app/services/analytics_service.py`
    - threshold 비교를 다시 `if anomaly_score < anomaly_threshold: continue` 로 롤백
    - `assumptions` 에 `threshold` 가 `anomaly_score` 기준이며, 표준편차 유무에 따라 계산식이 달라진다는 설명 추가

### 실행한 명령

- `cd backend && uv run pytest tests/services/test_analytics_service.py::test_get_spending_anomalies_filters_on_anomaly_score tests/api/test_analytics_api.py::test_spending_anomalies_endpoint_documents_anomaly_score_threshold -q`
  - 결과: red 확인 후 green `2 passed`
- `cd backend && uv run pytest tests/services/test_analytics_service.py::test_get_spending_anomalies_filters_on_anomaly_score tests/api/test_analytics_api.py::test_spending_anomalies_endpoint_documents_anomaly_score_threshold tests/services/test_analytics_service.py::test_get_spending_anomalies_detects_spike tests/api/test_analytics_api.py::test_spending_anomalies_endpoint_detects_spike -q`
  - 결과: `4 passed`

### 결과

- `spending-anomalies` 는 다시 `anomaly_score` cutoff 기반으로 판정한다
- `assumptions` 는 `threshold` 가 퍼센트가 아니라 score이며, `|delta|/stdev` 또는 `|delta|/baseline_avg` 계산이라는 점을 직접 설명한다

## Spending Anomalies Closed-Month Default

- 사용자 피드백
  - 진행 중인 월을 그대로 anomaly 대상에 넣으면 월초/월중에는 대부분 왜곡될 수 있음
  - 기본값은 직전 마감월이어야 하고, partial 비교가 필요하면 이전 월 같은 일자까지 잘라 보는 방식을 제안

### 판단

- 이 피드백이 맞다.
- anomaly는 월합계 비교 성격이 강해서, 기본값을 partial current month로 두면 false positive/false negative가 모두 커진다.
- 따라서 기본 호출은 `last closed month` 로 보고, 사용자가 `end_date` 를 명시한 경우에만 partial month를 허용하는 쪽이 안전하다.
- partial 비교는 이전 월 전체가 아니라 `같은 일자 cutoff` 를 적용해야 의미가 맞는다.

### TDD

- red:
  - `backend/tests/services/test_analytics_service.py`
    - `test_get_spending_anomalies_defaults_to_last_closed_month`
    - `test_get_spending_anomalies_partial_period_uses_same_day_baseline_cutoff`
  - `backend/tests/api/test_analytics_api.py`
    - `test_spending_anomalies_endpoint_defaults_to_last_closed_month`
    - `test_spending_anomalies_endpoint_partial_period_uses_same_day_cutoff`
  - 현재 로직이 `today` 기준 current month 전체/직전월 전체를 비교하고 있어서 실패하는 것부터 확인
- green:
  - `backend/app/services/analytics_service.py`
    - `end_date is None` 이면 `date.today()` 가 아니라 `직전 마감월 말일`을 reference date로 사용
    - 명시적 `end_date` 가 월말이 아니면 `partial_cutoff_day` 를 계산
    - baseline month rows는 `row["date"].day <= partial_cutoff_day` 일 때만 집계
    - assumptions 문구에 `직전 마감월 기준` 또는 `부분 기간 비교(기준일=..., 이전 월도 N일까지만 집계)` 를 명시

### 실행한 명령

- `cd backend && uv run pytest tests/services/test_analytics_service.py::test_get_spending_anomalies_defaults_to_last_closed_month tests/services/test_analytics_service.py::test_get_spending_anomalies_partial_period_uses_same_day_baseline_cutoff tests/api/test_analytics_api.py::test_spending_anomalies_endpoint_defaults_to_last_closed_month tests/api/test_analytics_api.py::test_spending_anomalies_endpoint_partial_period_uses_same_day_cutoff -q`
  - 결과: red 확인 후 green `4 passed`
- `cd backend && uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py -q`
  - 결과: `28 passed`
- `cd backend && uv run ruff check .`
  - 결과: 통과
- `cd backend && uv run pytest -q`
  - 결과: `80 passed`

### 결과

- `spending-anomalies` 기본 호출은 직전 마감월 기준으로 동작한다
- partial `end_date` 를 넘기면 이전 월 전체가 아니라 같은 일자 cutoff baseline으로 비교한다
- `assumptions` 에 현재 어떤 비교 모드가 적용됐는지 드러난다

## Spending Anomalies Absolute Delta Floor

- 사용자 피드백
  - 현재 `anomaly_score` 기준만으로는 수천원~수만원대 편차도 거의 모두 이상지출 후보로 잡힌다
  - 기본값으로 `baseline 대비 절대 변동액 10만원 미만` 은 제외하고, 이후 조정 가능해야 한다

### 판단

- score 기반 판정은 유지하되, 절대 변동액 하한을 추가하는 게 맞다.
- 작은 분모에서 score가 과도하게 커지는 카테고리를 기본 탐지에서 걷어내려면 `abs(delta)` 기준 하한이 필요하다.
- 추후 조정 가능성을 위해 서비스 내부 상수가 아니라 query param 계약으로 두고, 기본값만 `100000` 으로 둔다.

### TDD

- red:
  - `backend/tests/services/test_analytics_service.py`
    - `test_get_spending_anomalies_filters_small_absolute_deltas_by_default`
  - `backend/tests/api/test_analytics_api.py`
    - `test_spending_anomalies_endpoint_filters_small_absolute_deltas_by_default`
  - `금융` 카테고리처럼 score는 높지만 `delta < 100000` 인 케이스가 기본값에서는 제외되고, `min_delta_amount=10000` 으로 낮추면 다시 포함되어야 함을 실패로 고정
- green:
  - `backend/app/services/analytics_service.py`
    - `get_spending_anomalies(..., min_delta_amount: int = 100_000)` 추가
    - `abs(delta) < min_delta_amount` 이면 `anomaly_score` 판정 전에 제외
    - `assumptions` 에 `min_delta_amount=100000` 문구 추가
  - `backend/app/api/v1/endpoints/analytics.py`
    - `min_delta_amount` query param 추가 (`default=100000`)
  - 기존 anomaly 테스트 중 새 기본값과 충돌하던 기대치를 보정

### 실행한 명령

- `cd backend && uv run pytest tests/services/test_analytics_service.py::test_get_spending_anomalies_filters_small_absolute_deltas_by_default tests/api/test_analytics_api.py::test_spending_anomalies_endpoint_filters_small_absolute_deltas_by_default -q`
  - 결과: red 확인 후 green `2 passed`
- `cd backend && uv run ruff check .`
  - 결과: 통과
- `cd backend && uv run pytest -q`
  - 결과: `82 passed`
- live runtime 확인
  - 기존 8000 backend가 stale 상태였던 점을 다시 정리하고, `setsid ... uvicorn app.main:app --host 0.0.0.0 --port 8000` 로 재기동
  - `curl http://127.0.0.1:4173/api/v1/analytics/spending-anomalies?...` 응답에서 `min_delta_amount=100000` assumptions 와 축소된 anomaly 결과를 확인

### 결과

- `spending-anomalies` 는 이제 `anomaly_score` 와 `abs(delta) >= min_delta_amount` 를 모두 만족해야 노출된다
- 기본값은 `100000` 원이며, query param으로 조정 가능하다
- live 8000 backend runtime도 새 계약 기준으로 재기동되었다

## Settings Surface Planning Follow-up

- 사용자 요청
  - 좌측 사이드바 하단에 `설정` 메뉴를 추가하고
  - anomaly threshold 같은 backend 관련 파라미터를 수정할 수 있는 관리 메뉴를 구현 계획에만 추가

### 판단

- 이 요구는 Insights 카드 내부의 임시 control이 아니라 shell-level settings surface로 계획하는 게 맞다.
- 파라미터 관리 범위도 anomaly 하나에 고정하지 말고, 향후 advisor/analytics heuristic parameter를 수용할 수 있는 공통 `analytics settings` surface로 잡는 편이 확장성 면에서 안전하다.

### 문서화

- `docs/superpowers/plans/2026-03-31-advisor-analytics-expansion.md`
  - `Workstream 2.5: Diagnostics Settings Surface` 추가
  - `설정` 사이드바 entry, settings page, analytics settings read/write API 방향, persistence model, v1 parameter inventory(`min_delta_amount`, `anomaly_threshold`, `baseline_months`)를 계획에 반영
- `docs/STATUS.md`
  - shell-level settings surface 결정 사항을 `Key Decisions` 에 기록

## Separate Settings / Token Lab Feature Plan

- 사용자 정정
  - `설정` feature는 backend parameter 조정만이 아니라
  - 프론트엔드 디자인 토큰(폰트 색상, 컬러 팔레트)을 직접 보고 임시로 바꿔볼 수 있는 기능도 함께 포함해야 함
  - 기존 analytics follow-up의 일부가 아니라 별도 feature plan으로 분리 요청

### 판단

- 이 요구는 기존 analytics 확장 문서의 하위 항목으로 두기엔 범위가 넓다.
- persisted backend settings와 temporary frontend token tuning은 성격이 다르므로, 하나의 `설정` shell page 아래 두 개의 domain panel로 나누는 별도 feature 계획이 더 적절하다.
- token tuning은 v1에서 live preview/debug surface로 제한하고, repo/source-of-truth를 자동 변경하는 흐름은 포함하지 않는다.

### 문서화

- 새 계획 문서 추가:
  - `docs/superpowers/plans/2026-04-08-settings-and-token-lab.md`
- 포함 범위:
  - 좌측 사이드바 하단 `설정` entry
  - persisted analytics settings API + settings page panel
  - temporary design token lab (폰트 색상, chart/category palette, reset/export/import)
- `docs/STATUS.md`
  - 별도 feature kickoff 항목과 key decision 추가
