# 2026-04-01 Codex Log

## Summary
- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋, 현재 git 상태를 먼저 확인했다.
- `.env` 가 현재 git tracked 상태이고, `.gitignore` 에 누락되어 있음을 확인했다.
- `.env` 경로 이력이 최신 커밋 하나에만 존재함을 확인해 전체 filter-rewrite 대신 latest commit rewrite 전략을 선택했다.
- `.gitignore` 에 `.env` 를 추가하고 `docs/STATUS.md` 를 현재 작업 기준으로 갱신했다.
- 오늘 턴의 로컬 history 정리 후 remote 반영에는 force-push가 필요하므로 이를 후속 조치로 남긴다.

## Git Hygiene Update
- `git ls-files .env` → tracked 확인
- `git rev-list --all -- .env` → latest commit 1건만 매칭
- 조치:
  - `.gitignore` 에 `.env` 추가
  - `git rm --cached .env` 로 인덱스에서만 제거
  - latest commit amend 로 로컬 history 에서 `.env` 제거

## Verification
- `git log --oneline -- .env`
- `git ls-files .env`
- `git status --short --branch`

## Follow-up
- remote `origin/main` 에는 기존 커밋이 남아 있을 수 있으므로 반영하려면 force-push가 필요하다.

## Frontend Redesign Wireframe
- 현재 frontend 라우트, 페이지 구성, hook 조합, backend API/analytics surface를 검토했다.
- 현재 구현은 `/`, `/assets`, `/spending`, `/data` 4개 화면만 활성화되어 있고, backend advisor analytics 8종 endpoint는 아직 frontend에서 사용하지 않음을 확인했다.
- visual companion을 사용해 IA 3안(A 균등형 / B 혼합형 / C workspace 중심)을 비교했고, 사용자와 함께 `Option B`를 선택했다.
- 선택된 방향:
  - 전역 구조는 `개요 | 분석 | 운영`
  - `분석` 내부에 `지출 | 자산 | 인사이트`
  - `운영` 내부에 `업로드 | 거래 작업대`
  - `income` / `transfers`는 독립 페이지보다 홈의 월간 현금흐름과 인사이트 surface로 흡수
- 후속 승인 반영:
  - 운영 섹션은 `거래 작업대`가 기본 화면
  - `업로드`, `최근 업로드 이력`, `Danger Zone`은 작업대 아래 접힌 아코디언
- 산출물:
  - `docs/superpowers/specs/2026-04-01-frontend-redesign-wireframe-design.md`
  - `.gitignore` 에 `.superpowers/` 추가
- 다음 단계는 spec 리뷰 승인 후 구현 계획 문서로 전환하는 것이다.

## DESIGN.md Review
- `docs/DESIGN.md` 를 검토했다.
- 결론:
  - 기술적으로 일부 토큰은 도입 가능하다.
  - 하지만 문서 전체를 as-is 디자인 시스템으로 채택하는 것은 부적합하다.
- 주요 이유:
  - CRM / sales pipeline 전용 도메인 언어가 강하다.
  - kanban / stage / won-risk-lost 상태 모델이 재무 대시보드와 맞지 않는다.
  - 현재 확정된 frontend IA(`개요 | 분석 | 운영`)보다 pipeline workspace 가정을 더 강하게 전제한다.
- 적용 가능하다고 본 범위:
  - spacing scale
  - radius scale
  - card / input / button의 기본 밀도 규칙
- 적용 비추천 범위:
  - 브랜드명/컨셉 문구
  - pipeline stage 색 의미
  - won / risk / lost 상태 chip
  - kanban 전제 do/don't

## Design Token Rewrite
- 사용자 결정:
  - legacy `docs/DESIGN.md` 는 archive 없이 제거
  - 새 기준 문서는 `docs/frontend-design-tokens.md`
- 조치:
  - `docs/frontend-design-tokens.md` 작성
  - `docs/superpowers/specs/2026-04-01-frontend-redesign-wireframe-design.md` 에 새 토큰 문서 참조 추가
  - `docs/STATUS.md` 를 새 기준에 맞게 갱신
  - legacy `docs/DESIGN.md` 삭제
- 새 문서 원칙:
  - 4px spacing, radius, density, input/button/card 기본 규칙은 유지
  - pipeline / stage / won-risk-lost 의미 체계는 제거
  - 재무 도메인에 맞는 blue / teal / semantic state palette로 재정의

## Frontend Redesign Implementation Plan
- `writing-plans` 기준으로 구현 계획 문서를 작성했다.
- 산출물:
  - `docs/superpowers/plans/2026-04-01-frontend-redesign-implementation.md`
- 계획 범위:
  - 새 토큰 적용과 shell foundation
  - 새 route map 및 legacy redirect
  - overview page 구현
  - analysis section의 spending/assets migration
  - insights page 구현
  - operations workbench 재구성
  - 회귀 테스트와 문서 마무리

## Operations Workbench Implementation
- 사용자 승인된 redesign spec/plan 범위 안에서 operations slice만 구현했다.
- 작업 파일:
  - `frontend/src/pages/OperationsWorkbenchPage.tsx`
  - `frontend/src/components/operations/OperationsAccordions.tsx`
  - `frontend/src/components/operations/WorkbenchSidebar.tsx`
  - `frontend/src/pages/DataPage.tsx`
  - `frontend/src/pages/__tests__/OperationsWorkbenchPage.test.tsx`
  - `frontend/src/pages/__tests__/DataPage.test.tsx`
- 구현 내용:
  - `거래 작업대`를 운영 섹션의 기본 랜딩으로 승격
  - 기존 `useDataManagement` read/write 동작 재사용
  - 업로드 / 최근 업로드 이력 / Danger Zone을 기본 접힘 accordion으로 재배치
  - `/data` 는 새 작업대를 렌더하는 thin legacy wrapper로 유지
  - sidebar에 작업대 요약과 최근 업로드 맥락 추가
- TDD:
  - 먼저 `OperationsWorkbenchPage.test.tsx`, `DataPage.test.tsx` 를 추가/수정
  - red: 새 workbench heading / legacy wrapper expectation 부재로 실패 확인
  - green: 구현 후 두 파일 4개 테스트 통과
- Verification:
  - `cd frontend && npm test -- --runInBand src/pages/__tests__/OperationsWorkbenchPage.test.tsx src/pages/__tests__/DataPage.test.tsx`
  - 결과: `2 passed`, `4 passed`

## Frontend Redesign Integration
- 서브에이전트를 병렬로 사용해 정보 수집과 페이지 구현을 분리했다.
  - explorer 2개: 기존 overview/data surface 재사용 가능 영역과 부족한 analytics surface 확인
  - worker 2개: overview/insights slice, operations slice 구현 분담
- 메인 세션에서는 결과를 통합하고 새 app shell과 route map을 정리했다.
- 작업 파일:
  - `frontend/src/app/AppLayout.tsx`
  - `frontend/src/app/router.tsx`
  - `frontend/src/index.css`
  - `frontend/src/components/navigation/PrimarySectionNav.tsx`
  - `frontend/src/components/navigation/SectionTabNav.tsx`
  - `frontend/src/components/layout/AsidePanel.tsx`
  - `frontend/src/components/layout/MetricCardGrid.tsx`
  - `frontend/src/api/analytics.ts`
  - `frontend/src/types/analytics.ts`
  - `frontend/src/hooks/useOverview.ts`
  - `frontend/src/hooks/useInsights.ts`
  - `frontend/src/components/insights/InsightSummaryCards.tsx`
  - `frontend/src/components/insights/RecurringPaymentsTable.tsx`
  - `frontend/src/components/insights/SpendingAnomaliesTable.tsx`
  - `frontend/src/pages/OverviewPage.tsx`
  - `frontend/src/pages/InsightsPage.tsx`
- 구현 내용:
  - 상단 섹션 IA를 `개요 | 분석 | 운영` 으로 재구성
  - 분석 섹션에 `지출 | 자산 | 인사이트` 탭을 두고 canonical route를 `/analysis/*` 로 전환
  - 운영 섹션은 `/operations/workbench` 를 기준 route로 두고 `/data` 는 thin wrapper로 유지
  - `/spending`, `/assets` 는 redirect만 남겨 기존 링크 호환성을 유지
  - overview는 월간 현금흐름, 핵심 지표, 상위 카테고리, 최근 거래를 한 화면에 통합
  - insights는 income stability, recurring payments, anomalies, merchant/category signal을 읽는 전용 surface로 분리

## Frontend Verification
- `cd frontend && npm test -- --runInBand src/app/AppLayout.test.tsx`
- `cd frontend && npm test -- --runInBand src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx`
- `cd frontend && npm test -- --runInBand src/app/AppLayout.test.tsx src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/OperationsWorkbenchPage.test.tsx src/pages/__tests__/DataPage.test.tsx`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm test`
- 결과:
  - 전체 frontend test `18 files / 44 tests` 통과
  - typecheck 통과
  - lint 통과
  - Recharts `ResponsiveContainer` warning은 jsdom 한계로 stderr에만 남고 실패는 아님

## Runtime Browser Verification
- 요청에 따라 실제 서버와 브라우저 기준으로 화면을 확인했다.
- 실행:
  - `docker compose up -d db`
  - `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run alembic upgrade head`
  - backend는 기존 `127.0.0.1:8000` 응답 인스턴스를 재사용
  - `cd frontend && npm run dev -- --host 127.0.0.1 --port 5173`
  - Playwright CLI로 canonical route를 순회하며 screenshot / console smoke 확인
- 확보한 캡처:
  - `output/playwright/screens/overview-desktop.png`
  - `output/playwright/screens/spending-desktop.png`
  - `output/playwright/screens/assets-desktop.png`
  - `output/playwright/screens/insights-desktop.png`
- 확인 결과:
  - desktop 4개 route는 실제 렌더링 기준으로 공통 shell과 상단 탭이 정상 노출됨
  - console error는 공통적으로 `favicon.ico` 404만 확인됨
  - overview / insights에서는 저장률이 과도한 음수로 노출되어 데이터 표현 검토가 필요함
  - assets 화면은 순자산 차트가 점 1개만 보여 빈 영역이 크게 남아 시계열 표현/empty-state polish가 필요함
  - spending 화면은 상단 필터/차트 레이아웃은 안정적이지만, 상세 섹션까지 보려면 추가 캡처가 필요함
- 자원 사용량 이슈 대응:
  - Playwright 세션과 dev server가 CPU/메모리를 많이 써서, 사용자 요청 직후 frontend dev server / backend uvicorn / docker db / chrome headless 프로세스를 모두 종료했다
  - 이후 검증은 저장된 캡처와 로그 분석으로 전환했다

## Layout Fix Pass
- 실브라우저 캡처 기준으로 확인된 문제를 바로 수정했다.
- 수정 대상:
  - `frontend/src/lib/insightMetrics.ts`
  - `frontend/src/hooks/useOverview.ts`
  - `frontend/src/hooks/useInsights.ts`
  - `frontend/src/components/charts/LineTrendChart.tsx`
  - `frontend/src/lib/insightMetrics.test.ts`
  - `frontend/src/components/charts/LineTrendChart.test.tsx`
  - `frontend/src/pages/__tests__/AssetsPage.test.tsx`
- 적용 내용:
  - 수입이 극단적으로 작아 저축률이 `-86836.5%` 같이 비정상적으로 길어질 때 `적자 구간` 또는 `산정 보류`로 축약
  - 시계열 포인트가 1건뿐인 경우 `LineTrendChart`가 빈 차트 대신 single-point summary panel을 렌더하도록 변경
  - 자산 페이지 테스트도 단일 포인트 fallback을 기준으로 갱신
- Verification:
  - `cd frontend && npm test -- --runInBand src/lib/insightMetrics.test.ts src/components/charts/LineTrendChart.test.tsx src/pages/__tests__/AssetsPage.test.tsx`
  - `cd frontend && npm test -- --runInBand src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx src/components/charts/LineTrendChart.test.tsx src/lib/insightMetrics.test.ts`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`
- 결과:
  - 관련 테스트 5 files / 11 tests 통과
  - typecheck 통과
  - lint 통과
