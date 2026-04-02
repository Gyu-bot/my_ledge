# 2026-04-02 Codex Log

## Summary
- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋을 먼저 확인했다.
- 사용자 요청에 따라 프론트엔드 리뷰용 로컬 서버를 다시 기동하고, 같은 머신의 Tailscale 주소로 접근 가능하도록 바인딩을 조정했다.
- 프론트엔드만 띄우면 API surface가 비기 때문에 backend dev server도 함께 올려 프록시까지 검증했다.

## Runtime Bring-up
- frontend:
  - 실행: `cd frontend && npm run dev -- --host 0.0.0.0 --port 4173`
  - 확인: `http://127.0.0.1:4173`, `http://100.69.156.40:4173`
- backend:
  - 실행: `cd backend && UV_CACHE_DIR=/tmp/uv-cache-my-ledge uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
  - 확인: `http://127.0.0.1:8000/api/v1/health`
- DB:
  - 기존 `docker compose` 의 `db` 서비스가 healthy 상태임을 확인하고 재사용했다.

## Verification
- `tailscale ip -4` → `100.69.156.40`
- `curl -fsS http://127.0.0.1:8000/api/v1/health` → `{"status":"ok"}`
- `curl -fsS http://127.0.0.1:4173/api/v1/health` → frontend proxy 경유 `{"status":"ok"}`
- `curl -I http://100.69.156.40:4173` → `HTTP/1.1 200 OK`

## Notes
- `uv` 기본 캐시 경로는 현재 샌드박스 권한 문제로 실패하므로 `/tmp/uv-cache-my-ledge` override가 필요했다.
- 이번 턴은 코드 변경 없이 런타임 서버 기동과 접근성 검증이 목적이다.

## Screenshot Reset And Audit
- 사용자 요청에 따라 `output/` 하위 기존 산출물을 모두 삭제했다.
- Playwright skill을 우선 시도했지만 아래 제약으로 실패했다:
  - `npm` cache 권한 문제
  - Playwright browser/session cache 권한 문제
  - 샌드박스의 browser namespace 제약으로 Chrome launch abort
- fallback:
  - `/opt/google/chrome/chrome --headless --no-sandbox --disable-dev-shm-usage`
  - route별 개별 프로필을 `/tmp` 아래에 두고 desktop/mobile 스크린샷을 재수집
- 생성 파일:
  - `output/playwright/overview-desktop.png`
  - `output/playwright/analysis-spending-desktop.png`
  - `output/playwright/analysis-assets-desktop.png`
  - `output/playwright/analysis-insights-desktop.png`
  - `output/playwright/operations-workbench-desktop.png`
  - `output/playwright/data-wrapper-desktop.png`
  - `output/playwright/overview-mobile.png`
  - `output/playwright/analysis-spending-mobile.png`
  - `output/playwright/analysis-assets-mobile.png`
  - `output/playwright/analysis-insights-mobile.png`
  - `output/playwright/operations-workbench-mobile.png`

## Layout Findings
- 공통:
  - global hero가 카드 안에 들어가 있어 첫 화면 정보 밀도가 낮고, desktop/mobile 모두 제목 줄바꿈이 거칠다
  - 각 페이지 `PageHeader`가 다시 카드로 감싸져 상단 여백이 중복된다
- overview:
  - 첫 viewport에서 hero + page header + KPI 카드가 연속으로 쌓여 요약에 빨리 도달하지 못한다
  - `월간 현금흐름` 카드의 빈 grid 영역 비중이 크다
- spending:
  - timeline/placeholder 카드 높이가 커서 데이터가 적을 때 의미 없는 흰 공간이 과도하다
  - 필터와 집계 카드 사이의 호흡보다 빈 영역이 더 먼저 보인다
- assets:
  - `순자산 추이` single-point summary가 전체 card height를 그대로 차지해 빈 회색 블록처럼 보인다
- insights:
  - `Assumptions` 카드가 raw text 중심이라 다른 카드 대비 정보 표현이 거칠다
- operations:
  - main table와 sidebar가 desktop에서 초반엔 균형이 맞지만 sidebar 종료 후 우측 공백이 크게 남는다
- legacy residue:
  - `/data` thin wrapper가 아직 남아 있고 legacy label이 표시된다
  - `DashboardPage.tsx`, `PlaceholderApp.tsx`, 관련 테스트 파일이 새 IA 바깥에 잔존한다

## User Feedback
- 각 페이지 제목은 카드 섹션이 아니라 일반 page header 느낌으로 처리해야 한다.
- 제목을 카드로 감싸는 현재 방식은 여백만 늘리고 정보 밀도를 떨어뜨린다고 판단했다.

## Compact Header And Legacy Cleanup
- 새 구현 계획 문서를 추가했다:
  - `docs/superpowers/plans/2026-04-02-frontend-compact-header-legacy-cleanup.md`
- TDD:
  - `AppLayout.test.tsx`, `router.test.tsx`, `OperationsWorkbenchPage.test.tsx`, `AssetsPage.test.tsx`, `LineTrendChart.test.tsx` 를 먼저 수정해 red 확인
  - 이후 shell/header/route/single-point summary 구현으로 green 복귀
- 주요 변경:
  - `AppLayout` 상단 hero card를 compact masthead로 축소
  - `PageHeader` 를 카드형 섹션에서 page-level compact header로 변경
  - `/data` route를 wrapper 렌더 대신 `/operations/workbench` redirect로 전환
  - `OperationsWorkbenchPage` 의 legacy banner 제거
  - `DashboardPage.tsx`, `DataPage.tsx`, `PlaceholderApp.tsx` 및 관련 테스트 삭제
  - `LineTrendChart` 단일 포인트 fallback을 `단일 스냅샷` compact summary로 축소
  - `SectionPlaceholder` 기본 패딩을 줄여 빈 공간 과다 노출을 완화

## Verification
- `cd frontend && npm test`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- 결과:
  - frontend test `18 files / 40 tests` 통과
  - typecheck 통과
  - lint 통과
  - Recharts `ResponsiveContainer` warning은 jsdom 환경 stderr에만 남고 실패는 아님

## Updated Screens
- compact header 반영본 재수집:
  - `output/playwright/overview-desktop.png`
  - `output/playwright/analysis-spending-desktop.png`
  - `output/playwright/analysis-assets-desktop.png`
  - `output/playwright/analysis-insights-desktop.png`
  - `output/playwright/operations-workbench-desktop.png`
  - `output/playwright/overview-mobile.png`
  - `output/playwright/analysis-spending-mobile.png`
  - `output/playwright/analysis-assets-mobile.png`
  - `output/playwright/analysis-insights-mobile.png`
  - `output/playwright/operations-workbench-mobile.png`

## Residual Polish
- `operations-workbench` desktop에서는 sidebar 카드가 본문보다 빨리 끝나 우측 여백이 길게 남는다.
- spending/assets 본문은 새 shell 아래에서 동작하지만, 차트/필터/요약 블록의 정보 밀도 정리는 한 차례 더 손보는 편이 좋다.

## Overview Width And Runtime Follow-up
- 사용자 피드백:
  - overview 하단 2열에서 `카테고리 요약 Top 5` 는 너무 넓고 `최근 거래` 는 좁아 줄바꿈이 지저분했다
  - 분석/운영 페이지는 지출/자산/인사이트/운영 작업대 전부 로드 오류를 보였다
- root cause 조사:
  - `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 확인 후 systematic-debugging 순서로 재현
  - `curl http://127.0.0.1:4173/api/v1/transactions/summary?months=6`
  - `curl http://127.0.0.1:4173/api/v1/assets/net-worth-history`
  - `curl http://127.0.0.1:4173/api/v1/analytics/monthly-cashflow`
  - `curl http://127.0.0.1:4173/api/v1/upload/logs`
  - 위 네 경로가 모두 `500` 을 반환해 공통 API path 문제로 좁혔다
  - backend dev server session이 내려가 있었고, frontend proxy가 backend 부재를 `500` 으로 노출하는 상태였다
- runtime 조치:
  - backend 재기동:
    - `cd backend && UV_CACHE_DIR=/tmp/uv-cache-my-ledge uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
  - 재확인:
    - `transactions/summary` 200
    - `assets/net-worth-history` 200
    - `analytics/monthly-cashflow` 200
    - `upload/logs` 200
- TDD:
  - `frontend/src/pages/__tests__/OverviewPage.test.tsx`
    - overview 하단 section grid 비율이 `최근 거래` 우선 폭을 갖는지 red test 추가
  - `frontend/src/components/tables/TransactionsTable.test.tsx`
    - 날짜/결제수단 헤더와 셀이 `nowrap` 으로 유지되어 설명 열이 더 많은 폭을 갖는지 red test 추가
- 구현:
  - `frontend/src/pages/OverviewPage.tsx`
    - overview 하단 section grid를 `xl:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.38fr)]` 로 조정
    - Top 5 카드 내부 spacing/padding을 조금 줄여 좌측 column 밀도 개선
  - `frontend/src/components/tables/TransactionsTable.tsx`
    - desktop 헤더에 날짜/결제수단/금액 폭과 `whitespace-nowrap` 부여
    - row cell에도 날짜/결제수단/금액 `nowrap` 적용
- 검증:
  - `cd frontend && npm test`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`
  - 모두 통과
- 최신 캡처 갱신:
  - `output/playwright/overview-desktop.png`
  - `output/playwright/analysis-spending-desktop.png`
  - `output/playwright/analysis-assets-desktop.png`
  - `output/playwright/analysis-insights-desktop.png`
  - `output/playwright/operations-workbench-desktop.png`

## Workbench Full-Width And API Key Fallback
- 사용자 추가 요구:
  - 작업대의 `VITE_API_KEY` 미설정 경고를 없애고 기존 root `API_KEY` 를 그대로 재사용해야 한다
  - 거래 편집 작업대는 전체 폭을 써야 하며, 우측 sidebar는 제거하고 상단에 작은 요약/맥락 카드로 올려야 한다
  - 필터 결과 전체를 페이지네이션으로 끝까지 조회할 수 있어야 하고, 필터링은 더 강해야 한다
- root cause:
  - frontend dev server는 `frontend/` 기준 env만 읽고 있었고, root `.env` 의 `API_KEY` 는 브라우저용 `VITE_API_KEY` 로 승계되지 않았다
  - 그래서 `hasApiKeyConfigured()` 가 false 로 평가되어 작업대가 read-only 경고를 표시했다
  - operations workbench 는 `main + aside` split grid 구조라 테이블이 불필요하게 좁았다
- TDD:
  - `frontend/src/api/client.test.ts`
    - `VITE_API_KEY` 가 없어도 `API_KEY` fallback 을 쓰는지 red test 추가
  - `frontend/src/pages/__tests__/OperationsWorkbenchPage.test.tsx`
    - split sidebar grid 가 제거되고 full-width workbench 구조를 쓰는지 red test 추가
  - `frontend/src/hooks/__tests__/useDataManagement.test.tsx`
    - 필터 결과 전체에서 페이지 이동이 가능한지
    - `transaction_type`, `source`, `edited_only`, `date_from/date_to` client-side 고급 필터가 적용되는지 red test 추가
- 구현:
  - `frontend/vite.config.ts`
    - root env dir 를 읽도록 변경
    - root `.env` 의 `API_KEY` 를 frontend `VITE_API_KEY` 로 define 승계
  - `frontend/src/api/client.ts`
    - `resolveClientApiKey()` helper 추가
    - `VITE_API_KEY -> API_KEY` fallback 로직 반영
  - `frontend/src/components/data/DataManagementFilterBar.tsx`
    - 고급 필터 추가:
      - 거래 유형
      - 입력 출처
      - 시작일 / 종료일
      - 사용자 수정만
      - 기존 검색 / 대분류 / 결제수단 / 삭제 포함 유지
  - `frontend/src/hooks/useDataManagement.ts`
    - client-side advanced filter 적용
    - current page / total pages / page size 상태 추가
    - 필터 결과 전체를 유지한 채 현재 페이지 slice 만 UI에 전달하도록 변경
  - `frontend/src/components/operations/WorkbenchSidebar.tsx`
    - 우측 sidebar 대신 상단 compact summary strip 으로 역할 변경
  - `frontend/src/pages/OperationsWorkbenchPage.tsx`
    - summary strip 를 상단으로 올리고
    - filter bar + 거래 편집 작업대를 full-width 단일 column 구조로 재배치
    - 하단에 이전/다음 페이지 버튼과 페이지 상태 표시 추가
- verification:
  - `cd frontend && npm test`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`
  - 모두 통과
- runtime:
  - 기존 Vite dev server(pid 8939)를 내리고 재기동
  - `cd frontend && npm run dev -- --host 0.0.0.0 --port 4173`
  - Vite served module 확인:
    - `http://127.0.0.1:4173/src/api/client.ts`
    - `import.meta.env.VITE_API_KEY = "replace-me"` 가 실제 주입되는 것 확인
- 최신 캡처 갱신:
  - `output/playwright/operations-workbench-desktop.png`
