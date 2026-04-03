# 2026-04-03 Codex Log

## Chart Tooltip And Card Header Polish
- 사용자 요청 기준으로, 먼저 누적 visual refresh 작업을 커밋/푸시했다.
  - commit: `395c66a`
  - message: `[frontend] visual system refresh and workbench polish (codex)`
  - push: `origin/main`
- 이후 frontend UI polish batch를 이어서 반영했다.
- 구현 범위:
  - `frontend/src/pages/OverviewPage.tsx`
    - `월간 현금흐름` y축 제거
    - tooltip을 공통 컴포넌트로 교체
  - `frontend/src/components/charts/ChartTooltipContent.tsx`
    - compact `text-xs` 기준 tooltip typography 통일
    - 공통 color line indicator 추가
    - chart 종류별 tooltip DOM 파편화를 제거
  - `frontend/src/components/charts/CategoryTimelineAreaChart.tsx`
    - `월별 카테고리 추이`를 다시 linear stacked area chart로 복귀
    - y축 제거 유지
  - `frontend/src/components/charts/HorizontalBarChart.tsx`
  - `frontend/src/components/charts/BreakdownPieChart.tsx`
  - `frontend/src/components/charts/CategoryDonutChart.tsx`
  - `frontend/src/components/charts/LineTrendChart.tsx`
  - `frontend/src/components/charts/MerchantTreemapChart.tsx`
    - tooltip 공통화
    - treemap wrapper를 더 크게 잡고 square ratio로 고정
  - `frontend/src/components/common/CardPeriodBadgeGroup.tsx`
  - `frontend/src/components/ui/badge.tsx`
    - 범위형 badge 2개가 줄바꿈되지 않도록 nowrap 처리
  - `frontend/src/pages/SpendingPage.tsx`
    - `일별 지출액` 카드에서 기준 기간 badge 제거
  - `frontend/src/components/ui/popover.tsx`
    - 내부 padding을 기존 대비 절반 수준으로 축소
  - `frontend/src/components/common/cardGroupSurface.ts`
  - `frontend/src/components/common/StatusCard.tsx`
  - `frontend/src/index.css`
    - KPI card group border를 same-family darker soft variant로 보강
- 테스트/회귀 방지:
  - 추가:
    - `frontend/src/components/charts/ChartTooltipContent.test.tsx`
    - `frontend/src/components/charts/MerchantTreemapChart.test.tsx`
    - `frontend/src/components/common/CardPeriodBadgeGroup.test.tsx`
    - `frontend/src/components/ui/popover.test.tsx`
  - 수정:
    - `frontend/src/components/charts/CategoryTimelineAreaChart.test.tsx`
    - `frontend/src/components/common/StatusCard.test.tsx`
    - `frontend/src/pages/__tests__/OverviewPage.test.tsx`
    - `frontend/src/pages/__tests__/SpendingPage.test.tsx`
- 검증:
  - targeted:
    - `cd frontend && npm test -- --runInBand src/components/ui/popover.test.tsx src/components/charts/MerchantTreemapChart.test.tsx src/pages/__tests__/SpendingPage.test.tsx`
  - final:
    - `cd frontend && npm test -- --runInBand`
    - `cd frontend && npm run lint`
    - `cd frontend && npm run typecheck`
- 결과:
  - frontend test: `37 files, 89 tests passed`
  - lint/typecheck: 통과
  - Recharts `ResponsiveContainer` zero-size warning은 jsdom 한계로 stderr에 계속 남았지만 실패는 없었다.

## Chart And Control Density Refresh
- 사용자 요청으로 지출 `월별 카테고리 추이` 를 stacked area 에서 stacked bar 로 바꾸고 y축을 제거했다.
- tooltip / popover depth와 공통 control / table primitive도 함께 정리했다.
- TDD 순서:
  - 먼저 `frontend/src/components/charts/CategoryTimelineAreaChart.test.tsx` 를 추가해 `BarChart` 미적용, y축 제거 미반영, tooltip indicator 부재를 실패로 잡았다.
  - 기존 테스트도 요구사항에 맞게 red 로 바꿨다:
    - `frontend/src/components/ui/controlSizing.test.tsx`
    - `frontend/src/components/ui/table.test.tsx`
    - `frontend/src/components/charts/chartTheme.test.ts`
- 구현 파일:
  - `frontend/src/components/charts/CategoryTimelineAreaChart.tsx`
  - `frontend/src/components/charts/chartTheme.ts`
  - `frontend/src/components/charts/HorizontalBarChart.tsx`
  - `frontend/src/components/charts/BreakdownPieChart.tsx`
  - `frontend/src/components/charts/MerchantTreemapChart.tsx`
  - `frontend/src/components/charts/CategoryDonutChart.tsx`
  - `frontend/src/components/ui/button.tsx`
  - `frontend/src/components/ui/input.tsx`
  - `frontend/src/components/ui/select.tsx`
  - `frontend/src/components/ui/table.tsx`
  - `frontend/src/components/ui/popover.tsx`
- 구현 내용:
  - `CategoryTimelineAreaChart`
    - `AreaChart` → `BarChart`
    - `Area` → stacked `Bar`
    - `YAxis` 제거
    - custom tooltip content 추가
    - tooltip entry 앞에 line indicator 추가
  - tooltip / popover shadow
    - `chartTooltipStyle.boxShadow` 를 더 깊은 shadow 로 교체
    - custom tooltip div 들도 같은 shadow depth 적용
    - `PopoverContent`, `SelectContent` shadow도 같이 상향
  - control sizing
    - `Button` default size를 `small` 수준(`h-8`)으로 통일
    - `Input`, `SelectTrigger` 높이를 `h-8` 로 정렬
    - icon button도 `h-8 w-8` 로 축소
  - table
    - `TableHeader`, `TableBody`, `TableRow` 의 border 관련 class 제거
    - hover / selected background 만 유지
- 검증:
  - red:
    - `cd frontend && npm test -- --runInBand src/components/charts/CategoryTimelineAreaChart.test.tsx src/components/ui/controlSizing.test.tsx src/components/ui/table.test.tsx src/components/charts/chartTheme.test.ts`
  - green:
    - `cd frontend && npm test -- --runInBand src/components/charts/CategoryTimelineAreaChart.test.tsx src/components/ui/controlSizing.test.tsx src/components/ui/table.test.tsx src/components/charts/chartTheme.test.ts src/components/charts/HorizontalBarChart.test.tsx`
  - final:
    - `cd frontend && npm test -- --runInBand`
    - `cd frontend && npm run lint`
    - `cd frontend && npm run typecheck`
- 비고:
  - full test 중 Recharts `ResponsiveContainer` zero-size stderr warning은 기존 jsdom 한계로 계속 보이지만, 테스트 결과 자체는 모두 green 이었다.

## Card Group Gradient Expansion
- 사용자 요청으로 기존 `개요 KPI` / `자산 요약`에만 넣었던 저채도 gradient surface를 프로젝트 전반의 card group으로 확장했다.
- 공통 규칙:
  - 일반 본문 카드 전체가 아니라 `요약 정보를 묶어 보여주는 카드 그룹`에만 적용
  - 그림자나 강한 색면 대신 `primary / secondary / accent` 저채도 gradient만 사용
  - 기존 small control sizing(`Button`, `Input`, `Select`, `Checkbox`)은 그대로 유지
- 구현 방식:
  - `frontend/src/components/common/cardGroupSurface.ts` 추가
  - `getCardGroupSurfaceClass()` helper로 `primary / secondary / accent` surface를 공통화
- 적용 파일:
  - `frontend/src/components/common/StatusCard.tsx`
  - `frontend/src/components/insights/InsightSummaryCards.tsx`
  - `frontend/src/pages/OverviewPage.tsx`
  - `frontend/src/pages/AssetsPage.tsx`
  - `frontend/src/pages/InsightsPage.tsx`
  - `frontend/src/components/operations/OperationsAccordions.tsx`
- 적용 범위:
  - 개요 KPI 카드
  - 개요 `주의 신호`
  - 자산 상단 KPI 카드
  - 자산 `투자 요약` / `대출 요약` 내부 mini cards와 대출 item list
  - 인사이트 상단 summary cards
  - 인사이트 `핵심 인사이트`, `거래처 소비 Top N`, `카테고리 증감 요약`
  - 운영 `최근 업로드 상태`, `거래`, `스냅샷` 요약 카드
- 테스트:
  - `frontend/src/components/common/StatusCard.test.tsx`
  - `frontend/src/pages/__tests__/OverviewPage.test.tsx`
  - `frontend/src/pages/__tests__/AssetsPage.test.tsx`
  - `frontend/src/pages/__tests__/InsightsPage.test.tsx`
- 검증:
  - targeted: `cd frontend && npm test -- --runInBand src/components/common/StatusCard.test.tsx src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx`
  - final:
    - `cd frontend && npm test -- --runInBand`
    - `cd frontend && npm run lint`
    - `cd frontend && npm run typecheck`

## Monetary Axis Compaction
- 사용자 요청으로 `개요 > 월간 현금흐름`, `지출 > 월별 카테고리 추이`, `지출 > 월별 고정비/변동비 추이`, 그리고 같은 공통 chart를 재사용하는 금액 추세 차트들의 축 표기를 `천원` 단위로 줄였다.
- TDD 순서:
  - 먼저 `frontend/src/components/charts/moneyFormat.test.ts` 를 추가하고 import 실패 상태를 확인했다.
  - 이후 `frontend/src/components/charts/moneyFormat.ts` 를 추가해 `formatAxisMoneyInThousands()` helper를 구현했다.
- 적용 파일:
  - `frontend/src/components/charts/moneyFormat.ts`
  - `frontend/src/components/charts/CategoryTimelineAreaChart.tsx`
  - `frontend/src/components/charts/LineTrendChart.tsx`
  - `frontend/src/pages/OverviewPage.tsx`
- 구현 내용:
  - axis tick formatter는 `₩13,500,000` 대신 `13,500` 형태로 출력
  - tooltip과 카드 내부 금액 표기는 기존 full KRW 형식을 유지
  - y-axis width는 `92` 에서 `56` 으로 줄여 모바일에서 plot 영역이 더 확보되도록 조정
- 검증:
  - red: `cd frontend && npm test -- --runInBand src/components/charts/moneyFormat.test.ts` 에서 `moneyFormat` 미존재로 실패 확인
  - green:
    - `cd frontend && npm test -- --runInBand src/components/charts/moneyFormat.test.ts`
    - `cd frontend && npm test -- --runInBand src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/SpendingPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx src/components/charts/LineTrendChart.test.tsx`
  - final:
    - `cd frontend && npm test -- --runInBand`
    - `cd frontend && npm run lint`
    - `cd frontend && npm run typecheck`
- 실화면 검토:
  - `output/playwright/review/overview-axis-mobile.png`
  - `output/playwright/review/spending-axis-mobile.png`
  - 모바일 차트에서 y축 라벨이 `13,500`, `9,000` 같은 짧은 숫자로 줄어 첫 plot column이 덜 눌리는 것을 확인했다.

## Color Token Refresh
- 사용자 요청에 맞춰 전체 컬러 체계를 `navy / orange / red` 축으로 재정의했다.
  - `primary`: navy
  - `secondary`: orange
  - `accent`: red
- `frontend/src/index.css` 에서 전역 토큰과 dashboard background gradient를 새 팔레트로 교체했고, `*-soft` tint는 이전보다 훨씬 덜 채도 높은 계열로 낮췄다.
- `positive` 계열은 실제 성공 상태용으로만 남기고, 일반 인터랙션 surface는 `primary` / `secondary` / `accent` 위주로 재정리했다.
  - `frontend/src/components/ui/button.tsx`: outline/ghost hover를 `primary`, secondary variant를 `secondary` 기준으로 변경
  - `frontend/src/components/ui/select.tsx`: item focus 배경을 `primary-soft`로 정리
  - `frontend/src/components/ui/table.tsx`: row hover/selected surface를 `primary-soft`로 변경
  - `frontend/src/components/ui/badge.tsx`: secondary badge를 `secondary-soft` 기준으로 변경
  - `frontend/src/components/operations/OperationsAccordions.tsx`: file input trigger tint를 `secondary`로 변경
  - `frontend/src/components/tables/CategoryBreakdownTable.tsx`, `frontend/src/components/tables/TransactionsTable.tsx`, `frontend/src/components/dashboard/CategoryBreakdownCard.tsx`: generic informational accent 사용처를 secondary 중심으로 재배치
  - `frontend/src/components/filters/TimelineRangeSlider.tsx`: base track은 `primary-soft`, active track/thumb은 accent 기준 유지하되 old teal shadow를 red 계열 shadow로 교체
  - `frontend/src/components/charts/chartTheme.ts`: chart palette도 새 색축으로 동기화
- 검증:
  - `cd frontend && npm test -- --runInBand`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`
- 실화면 검토:
  - `output/playwright/review/overview-color-desktop.png`
  - `output/playwright/review/overview-color-mobile.png`
  - navy base, orange secondary badge, muted soft tint, red accent 대비는 안정적이었고 추가 보정은 넣지 않았다.

## Heroicon Density Refresh Completion
- 사용자 후속 요청으로 Heroicon 적용 범위를 sidebar에서 page section/card title까지 확장했고, 아이콘은 배경 chip 없이 inline glyph만 남기도록 정리했다.
- `frontend/src/components/common/IconTitle.tsx` 를 추가해 큰 섹션 제목과 주요 카드 제목에서 같은 icon-title 패턴을 재사용하게 만들었다.
- `frontend/src/components/data/EditableTransactionsTable.tsx` 에서는 동작 열을 `ButtonGroup` + icon-only action button 조합으로 바꿔 `수정/삭제/저장/취소/복원` 폭을 줄였다.
- 사용자 정정에 맞춰 `frontend/src/components/ui/table.tsx` 공통 primitive spacing을 전역으로 한 단계 더 축소했다.
  - default: `TableHead h-9 px-1.5`, `TableCell px-1.5 py-3`
  - compact: `TableHead h-8 px-1`, `TableCell px-1 py-2`
- 검증:
  - `cd frontend && npm test -- --runInBand`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`
- 실화면 검토:
  - 기존 Playwright launch는 sandbox/crashpad 제약으로 불안정해 Chrome headless fallback(`--no-sandbox --disable-dev-shm-usage`)으로 `/operations/workbench` desktop/mobile live screenshot을 다시 수집했다.
  - 최종 검토 이미지:
    - `output/playwright/review/workbench-desktop-live-2.png`
    - `output/playwright/review/workbench-mobile-live-2.png`
  - 추가 레이아웃 깨짐은 보이지 않아 후속 patch 없이 종료했다.

## Heroicon Density Refresh Task 1-2
- `frontend/src/components/icons/HeroIcons.tsx` 를 새로 추가해 local Heroicons-style outline SVG 컴포넌트와 navigation icon map을 정의했다.
- `frontend/src/app/navigation.ts` 에 icon metadata를 붙이고, `AppSidebar` / `MobileSidebarDrawer` 에서 아이콘 렌더링과 한 단계 조밀한 spacing을 적용했다.
- sidebar collapse flyout, active route styling, mobile drawer close/focus behavior는 유지했고, 다음 단계는 focused frontend test 실행이다.

## Summary
- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋을 먼저 확인했다.
- 사용자 제보대로 "API 직접 업로드는 되는데 거래 작업대 업로드가 안 되는 것 같다"는 경로를 systematic-debugging 순서로 재현했다.
- local dev 기준으로는 workbench upload가 실제 브라우저에서도 성공함을 확인했고, 원인은 프론트 코드 자체보다 build-time API key 고정 구조가 운영에서 stale key mismatch를 만들 수 있다는 점으로 좁혔다.

## Investigation
- 확인한 파일:
  - `frontend/src/api/client.ts`
  - `frontend/src/api/upload.ts`
  - `frontend/src/hooks/useDataManagement.ts`
  - `frontend/src/pages/OperationsWorkbenchPage.tsx`
  - `frontend/src/components/operations/OperationsAccordions.tsx`
  - `frontend/Dockerfile`
  - `frontend/nginx.conf`
  - `docker-compose.yml`
- 재현 및 증거:
  - backend 직접 업로드:
    - `curl -X POST http://127.0.0.1:8000/api/v1/upload -H "X-API-Key: $API_KEY" -F "file=@tmp/finance_sample.xlsx" -F "snapshot_date=2026-03-24"` → `200`
  - frontend dev proxy 업로드:
    - `curl -X POST http://127.0.0.1:4173/api/v1/upload -H "X-API-Key: replace-me" -F "file=@tmp/finance_sample.xlsx" -F "snapshot_date=2026-03-24"` → `200`
  - Playwright CLI headless flow:
    - `/operations/workbench` 진입
    - 업로드 accordion 열기
    - `finance_sample.xlsx` 선택
    - `snapshot_date=2026-03-24` 입력
    - 업로드 실행
    - network log 기준 `POST /api/v1/upload => 200`

## Root Cause
- local dev에서 workbench upload는 정상 동작했다. 즉, `useDataManagement -> uploadWorkbook -> apiRequest` 연결 자체는 깨져 있지 않았다.
- 다만 frontend가 write API key를 build 시점의 `VITE_API_KEY`에 의존하고 있었다.
- 이 구조에서는 다음 상황에서 작업대만 실패할 수 있다:
  - backend `API_KEY`는 갱신됐는데 frontend static bundle은 예전 키로 빌드된 상태
  - direct API 호출은 최신 키로 성공
  - workbench는 stale key를 헤더로 보내 401/403
- 기존 frontend error message는 `API request failed with status 403` 수준이라 원인 파악도 어려웠다.

## Changes
- runtime config 도입:
  - `frontend/public/runtime-config.js`
  - `frontend/index.html` 에 runtime config script 추가
  - `frontend/docker-entrypoint.d/40-runtime-config.sh`
  - `frontend/Dockerfile` 에 entrypoint script 복사
  - `docker-compose.yml` frontend service에 runtime `API_KEY`, `API_BASE_URL` 전달
- client 개선:
  - `frontend/src/api/client.ts`
    - API key / API base URL 을 `window.__MY_LEDGE_RUNTIME_CONFIG__` 우선, `import.meta.env` fallback 순서로 해석
    - 401/403 시 backend detail을 포함한 명확한 에러 메시지 생성
- UI 문구 정리:
  - `frontend/src/pages/OperationsWorkbenchPage.tsx`
    - warning 문구를 `VITE_API_KEY` 중심 표현에서 runtime API key 표현으로 변경
- 테스트 추가:
  - `frontend/src/api/client.test.ts`
    - runtime config 우선순위
    - runtime window config read
    - 403 detail surfaced

## Verification
- targeted red/green:
  - `cd frontend && npm test -- src/api/client.test.ts`
- full frontend verification:
  - `cd frontend && npm test`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`
- browser flow:
  - Playwright CLI network log에서 `/api/v1/upload` 200 재확인

## Notes
- backend dev server는 `uv` cache 권한 문제를 피하기 위해 `UV_CACHE_DIR=/tmp/uv-cache` 로 기동했다.
- Playwright CLI는 headed 모드가 아니라 headless + `/tmp` cache override(`NPM_CONFIG_CACHE`, `XDG_CACHE_HOME`)로 사용했다.
- 이번 수정 이후 compose 환경에서 `API_KEY` 변경은 frontend rebuild 대신 container restart로 반영된다.

## Follow-up UI Adjustment
- 사용자 요청 기준으로 개발 서버에서는 docker 재기동/검증을 생략하고 frontend workbench UI만 조정했다.
- `frontend/src/components/data/EditableTransactionsTable.tsx`
  - desktop 테이블에 `분류` 열을 추가해 `고정비/변동비`, `고정비 필수 여부`를 직접 표시
  - mobile 카드에도 같은 분류 정보를 노출
  - 상태 셀에서 `업로드` source badge를 제거하고 `삭제됨` / `사용자 수정` / `원본 상태`만 남김
- `frontend/src/components/data/EditableTransactionsTable.test.tsx`
  - 분류 정보 노출과 `업로드` badge 제거 회귀 테스트 추가

## Follow-up Verification
- `cd frontend && npm test -- src/components/data/EditableTransactionsTable.test.tsx`
- `cd frontend && npm test`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`

## Card Period Badge Standardization
- 사용자 요청으로 페이지별로 흩어져 있던 카드 헤더의 기간/기준일 메타데이터를 공통 helper로 통일했다.
- 추가 파일:
  - `frontend/src/components/common/CardPeriodBadgeGroup.tsx`
- 적용 범위:
  - `frontend/src/pages/SpendingPage.tsx`
    - 월별 카테고리 추이
    - 월별 고정비/변동비 추이
    - 카테고리별 지출
    - 하위 카테고리별 지출
    - 고정비 필수/비필수 비율
    - 변동비 비율
    - 거래처별 Tree Map
    - 일별 지출액
    - 거래 내역
  - `frontend/src/pages/InsightsPage.tsx`
    - 거래처 소비 Top N
    - 카테고리 증감 요약
  - `frontend/src/pages/AssetsPage.tsx`
    - 순자산 추이
    - 투자 요약
    - 대출 요약
  - `frontend/src/pages/OverviewPage.tsx`
    - 월간 현금흐름
    - 최근 거래
  - `frontend/src/components/dashboard/CategoryBreakdownCard.tsx`
    - 선택 기간 표시부를 공통 period badge group으로 교체

## Card Period Badge Verification
- targeted:
  - `cd frontend && npm test -- src/pages/__tests__/SpendingPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx src/pages/__tests__/OverviewPage.test.tsx src/components/dashboard/CategoryBreakdownCard.test.tsx`
- full:
  - `cd frontend && npm test`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`

## Frontend Documentation Pass
- 사용자 요청으로 현재 frontend 구조를 문서화하는 두 개의 별도 문서를 추가했다.
- 추가 파일:
  - `docs/frontend/components-and-design-token-inventory.md`
  - `docs/frontend/page-wireframes.md`
- `components-and-design-token-inventory.md` 에 정리한 내용:
  - `frontend/src/components/**/*`, `frontend/src/app/*` 기준 컴포넌트 분류
  - primitive / app shell / common state / filter / table / chart / insights / operations 별 역할
  - `frontend/src/index.css`, `components/charts/chartTheme.ts` 기준 디자인 토큰 연결
  - 현재 미사용 컴포넌트(`AsidePanel`, `WorkbenchSidebar`, `CategoryBreakdownTable`, `CategoryBreakdownCard`)와 page-local 미공통화 조합 목록
- `page-wireframes.md` 에 정리한 내용:
  - 현재 canonical route 목록과 legacy redirect
  - `개요`, `지출 분석`, `인사이트`, `자산 현황`, `거래 작업대` 각 페이지의 section 구조
  - 각 section/card가 담는 정보
  - 각 section/card를 구성하는 실제 컴포넌트

## Frontend Documentation Verification
- 문서 작업이라 별도 테스트는 추가로 실행하지 않았다.
- 저장소 구현과의 정합성 확인을 위해 아래 파일들을 다시 읽고 문서와 대조했다.
  - `frontend/src/index.css`
  - `frontend/src/app/AppLayout.tsx`
  - `frontend/src/app/router.tsx`
  - `frontend/src/pages/OverviewPage.tsx`
  - `frontend/src/pages/SpendingPage.tsx`
  - `frontend/src/pages/InsightsPage.tsx`
  - `frontend/src/pages/AssetsPage.tsx`
  - `frontend/src/pages/OperationsWorkbenchPage.tsx`
  - `frontend/src/components/**/*` 주요 구현 파일

## Review Server Startup
- 사용자 리뷰를 위해 backend/frontend 개발 서버를 Tailscale 접근 가능하게 `0.0.0.0` 바인딩으로 기동했다.
- 실행 명령:
  - `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
  - `cd frontend && npm run dev -- --host 0.0.0.0 --port 4173`
- 확인 결과:
  - backend health: `curl http://127.0.0.1:8000/api/v1/health` → `{"status":"ok"}`
  - frontend root: `curl -I http://127.0.0.1:4173/` → `200 OK`
- Tailscale IPv4:
  - `100.69.156.40`
- 리뷰 접속 주소:
  - frontend: `http://100.69.156.40:4173`
  - backend: `http://100.69.156.40:8000`
- 장기 실행 세션:
  - backend session id: `92050`
  - frontend session id: `73292`

## Compact Table Density
- 사용자 피드백 기준으로 현재 table surface가 너무 성기게 보여, 새 데이터그리드 라이브러리 추가 없이 기존 shadcn-style primitive를 더 조밀하게 쓰는 방향으로 정리했다.
- 변경 파일:
  - `frontend/src/components/ui/table.tsx`
  - `frontend/src/components/ui/table.test.tsx`
  - `frontend/src/components/tables/TransactionsTable.tsx`
  - `frontend/src/components/tables/TransactionsTable.test.tsx`
  - `frontend/src/components/data/EditableTransactionsTable.tsx`
  - `frontend/src/components/insights/RecurringPaymentsTable.tsx`
  - `frontend/src/components/insights/SpendingAnomaliesTable.tsx`
  - `frontend/src/components/tables/CategoryBreakdownTable.tsx`
- 구현 내용:
  - 공통 `Table` primitive에 `density="compact"` variant 추가
  - compact 모드에서 `TableHead`는 `h-8 px-3`, `TableCell`은 `px-3 py-2` 로 축소
  - 실사용 표 중 데이터 밀도가 중요한 화면에 우선 적용
    - `최근 거래`
    - `거래 작업대`
    - `반복 결제`
    - `이상 지출`
    - `CategoryBreakdownTable` 도 동일 대응
- 참고:
  - 모바일 card stack 레이아웃은 이번 변경 범위에서 건드리지 않았다
  - 현재 프로젝트의 기본 UI는 별도 grid 라이브러리보다 `Card`, `Button`, `Input`, `Select`, `Accordion`, `Table`, `Badge`, `Alert` 같은 shadcn-style primitive 위에 쌓여 있다

## Compact Table Verification
- targeted:
  - `cd frontend && npm test -- src/components/ui/table.test.tsx src/components/tables/TransactionsTable.test.tsx src/components/data/EditableTransactionsTable.test.tsx`
- full:
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`

## Sidebar Shell Redesign Spec
- 사용자 요구가 단순 스타일 조정이 아니라 IA 표현 방식 전환에 가까워, `brainstorming` 흐름으로 새 shell 설계를 먼저 고정했다.
- 확정된 요구:
  - desktop: `collapsible sidebar`
  - mobile: `sidebar drawer`
  - content width: 넓은 `max-width`
  - IA: 현재 grouping 유지
  - sidebar: lean navigation only
  - page chrome: 설명형 hero 대신 thin top header
  - 구현 후 frontend 관련 문서도 새 구조에 맞게 갱신
- 작성한 spec:
  - `docs/superpowers/specs/2026-04-03-frontend-sidebar-shell-redesign-design.md`
- spec 내용:
  - `AppLayout`을 사실상 새 shell로 재작성
  - `AppSidebar`, `MobileSidebarDrawer`, `AppTopbar`, `PageBreadcrumb`, `ContentFrame` 계층 정의
  - grouped nav를 disclosure/flyout trigger로 고정
  - breadcrumb/title source of truth를 shell navigation config로 고정
  - `PageHeader` 제거 규칙, description/meta 이동 규칙, breakpoint/state persistence 정의

## Sidebar Shell Foundation Implementation
- 사용자 요청으로 설계/계획 확인 뒤 즉시 프론트엔드 재구현을 시작했고, 멀티 에이전트로 첫 shell foundation 배치를 진행했다.
- 사용한 흐름:
  - main agent: `navigation.ts`, `AppShellState`, `AppTopbar`, `PageBreadcrumb`, `ContentFrame`, `AppLayout` cutover
  - subagent: `AppSidebar`, `MobileSidebarDrawer`, 각 전용 테스트
- TDD 순서:
  - `frontend/src/app/router.test.tsx`
    - breadcrumb/title 파생 규칙
    - desktop sidebar localStorage restore
  - `frontend/src/components/layout/__tests__/AppTopbar.test.tsx`
    - breadcrumb/title 렌더
    - mobile trigger, compact meta slot
  - `frontend/src/app/AppLayout.test.tsx`
    - top nav 제거
    - sidebar shell / breadcrumb / current page heading 노출
- 추가/수정 파일:
  - `frontend/src/app/navigation.ts`
  - `frontend/src/components/layout/AppShellState.tsx`
  - `frontend/src/components/layout/AppSidebar.tsx`
  - `frontend/src/components/layout/MobileSidebarDrawer.tsx`
  - `frontend/src/components/layout/AppTopbar.tsx`
  - `frontend/src/components/layout/PageBreadcrumb.tsx`
  - `frontend/src/components/layout/ContentFrame.tsx`
  - `frontend/src/app/AppLayout.tsx`
  - `frontend/src/app/router.test.tsx`
  - `frontend/src/app/AppLayout.test.tsx`
  - `frontend/src/components/layout/__tests__/AppSidebar.test.tsx`
  - `frontend/src/components/layout/__tests__/MobileSidebarDrawer.test.tsx`
  - `frontend/src/components/layout/__tests__/AppTopbar.test.tsx`
- 구현 내용:
  - shell navigation source of truth를 `navigation.ts` 로 고정
  - `AppShellState` 에서 desktop sidebar expansion state를 localStorage로 복원/저장
  - desktop sidebar는 grouped disclosure / collapsed flyout 구조로 구현
  - mobile drawer는 `role="dialog"` / `aria-modal="true"` / 명시적 close button / `Escape` close / trigger focus restore 동작을 구현
  - `AppLayout` 은 기존 hero + primary/section nav를 제거하고 sidebar + thin topbar + wide content frame 조합으로 전환
- 아직 남겨둔 것:
  - 각 page 본문의 `PageHeader` 는 이번 배치에서 제거하지 않았다
  - topbar meta slot은 아직 페이지별 실제 메타와 연결하지 않았다

## Sidebar Shell Foundation Verification
- targeted shell tests:
  - `cd frontend && npm test -- --runInBand src/app/router.test.tsx src/app/AppLayout.test.tsx src/components/layout/__tests__/AppSidebar.test.tsx src/components/layout/__tests__/MobileSidebarDrawer.test.tsx src/components/layout/__tests__/AppTopbar.test.tsx`
  - 결과: `5 passed`, `13 passed`
- static checks:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`
  - shell rewrite에 필요한 접근성/키보드/ESC/scroll-lock 테스트 범위 정의

## Sidebar Shell Spec Review Loop
- 사용자 허용에 따라 subagent를 사용해 spec review를 수행했다.
- 1차 리뷰에서 지적된 문제:
  - collapsed grouped navigation 동작 모호성
  - breadcrumb/title source 미정
  - `PageHeader` migration 범위 모호성
  - breakpoint/state persistence 미정
  - 접근성/interaction 테스트 범위 부족
- 보강 후 2차/3차 검토에서 최종 `APPROVED`를 받았다.
- 승인 요약:
  - grouped nav link/button 역할이 충분히 명시됨
  - breadcrumb/title derivation이 정의됨
  - mobile drawer / collapsed flyout 접근성 계약이 구현 가능한 수준으로 고정됨

## Sidebar Shell Implementation Plan
- `writing-plans` 흐름으로 구현계획 문서를 작성했다.
- 추가 파일:
  - `docs/superpowers/plans/2026-04-03-frontend-sidebar-shell-redesign-implementation.md`
- 문서 내용:
  - navigation config / shell state / sidebar / drawer / topbar / content frame 파일 구조
  - `AppLayout` shell cutover 단계
  - canonical page들의 `PageHeader` 제거/축소 migration 단계
  - 접근성 회귀 테스트와 문서 갱신 범위
  - 단계별 테스트 명령과 커밋 메시지 제안

## Sidebar Shell Plan Review Loop
- subagent reviewer로 plan 문서를 별도 검토했다.
- 1차 리뷰에서 `sidebarExpanded` localStorage 복원 회귀 테스트가 빠져 있다는 지적을 받았다.
- plan에 아래 항목을 추가했다.
  - Task 1에 desktop sidebar expansion state restore failing test
  - Task 1 구현 단계에 initial restore + write-through persistence 명시
- 2차 검토에서는 `Approved`를 받았다.
- reviewer 권고도 함께 반영했다.
  - legacy `PrimarySectionNav` / `SectionTabNav` 의 제거 또는 unused 처리 방침 명시
  - shell cutover 시 skip-link 행동을 보존/이전하도록 명시

## Pre-commit Verification
- 계획 문서 승인 후 현재 워킹트리 전체를 커밋하기 전에 frontend 전체 검증을 다시 실행했다.
- 실행:
  - `cd frontend && npm test`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`
- 결과:
  - `25 files, 66 tests` 통과
  - `typecheck` 통과
  - `lint` 통과
- 비고:
  - Recharts responsive container 관련 width/height 경고는 테스트 환경 stderr에 남지만, 이번 실행에서도 실패로 승격되지는 않았다.

## Frontend Reimplementation Completion
- 사용자 요청에 맞춰 남아 있던 frontend 재구현 범위를 끝까지 마감했다.
- subagent 분담:
  - `Leibniz`: sidebar / mobile drawer foundation 구현
  - `Hypatia`: `OverviewPage`, `InsightsPage`, `OperationsWorkbenchPage` 의 page header 제거
  - `Fermat`: `SpendingPage`, `AssetsPage` 의 page header 제거
- main session 구현:
  - `frontend/src/components/layout/AppChromeContext.tsx`
    - page-level meta를 shell topbar로 올리는 context/hook 추가
  - `frontend/src/app/AppLayout.tsx`
    - shell state/provider와 chrome provider를 조합해 topbar meta slot 연결
  - `frontend/src/pages/OverviewPage.tsx`
  - `frontend/src/pages/AssetsPage.tsx`
  - `frontend/src/pages/InsightsPage.tsx`
  - `frontend/src/pages/OperationsWorkbenchPage.tsx`
  - `frontend/src/pages/SpendingPage.tsx`
    - `PageHeader` 제거
    - topbar meta badge 연결
    - `일별 지출액` 카드에 내부 독립 dropdown filter(`지출만` / `수입 포함`) 추가
  - `frontend/src/components/layout/AppTopbar.tsx`
    - mobile에서 breadcrumb를 숨기고 header 높이를 줄여 first viewport 밀도 개선

## Browser Review
- Playwright CLI로 실브라우저 캡처를 수집했다.
- 저장 경로:
  - `output/playwright/desktop/overview-desktop.png`
  - `output/playwright/desktop/spending-desktop.png`
  - `output/playwright/desktop/assets-desktop.png`
  - `output/playwright/desktop/insights-desktop.png`
  - `output/playwright/desktop/operations-desktop.png`
  - `output/playwright/mobile/overview-mobile.png`
  - `output/playwright/mobile/spending-mobile.png`
  - `output/playwright/mobile/assets-mobile.png`
  - `output/playwright/mobile/insights-mobile.png`
  - `output/playwright/mobile/operations-mobile.png`
  - `output/playwright/mobile/overview-mobile-viewport.png`
  - `output/playwright/mobile/overview-mobile-drawer.png`
  - `output/playwright/mobile/spending-mobile-viewport.png`
  - `output/playwright/mobile/operations-mobile-viewport.png`
- 검토 결과:
  - desktop canonical route 5종은 sidebar/topbar/content frame 비율과 카드 간격이 정상
  - mobile에서는 기능성 깨짐은 없었고, 가장 큰 문제는 breadcrumb + title 이 중복돼 상단 공간을 과하게 쓰는 점이었다
  - 해당 문제는 `AppTopbar` compact patch로 수정 후 mobile viewport를 다시 촬영해 확인했다
- 중간 이슈:
  - Playwright CLI는 기본 npm/cache 경로 권한 문제가 있어 `/tmp/npm-cache`, `/tmp/ms-playwright`, `XDG_CACHE_HOME=/tmp` 로 우회했다
  - 브라우저 점검 중 `/api/*` 500이 한 차례 보였는데, 원인은 frontend regression이 아니라 polling 중 종료된 backend dev server였다
  - backend를 재기동한 뒤 최종 mobile viewport 캡처에서 200 응답과 정상 렌더를 다시 확인했다

## Final Verification
- targeted regression:
  - `cd frontend && npm test -- --runInBand src/components/layout/__tests__/AppTopbar.test.tsx src/app/AppLayout.test.tsx src/app/router.test.tsx src/pages/__tests__/OverviewPage.test.tsx src/pages/__tests__/InsightsPage.test.tsx src/pages/__tests__/OperationsWorkbenchPage.test.tsx src/pages/__tests__/SpendingPage.test.tsx src/pages/__tests__/AssetsPage.test.tsx src/components/layout/__tests__/AppSidebar.test.tsx src/components/layout/__tests__/MobileSidebarDrawer.test.tsx`
  - 결과: `10 files, 30 tests` 통과
- full frontend sweep:
  - `cd frontend && npm test`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`
  - 결과: `28 files, 77 tests` 통과 / lint 통과 / typecheck 통과

## Manual Review Server Relaunch
- 사용자 요청으로 수동 확인용 dev server를 다시 기동했다.
- 실행:
  - `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`
  - `cd frontend && npm run dev -- --host 0.0.0.0 --port 4173`
- 확인:
  - `curl http://127.0.0.1:8000/api/v1/health` → `{"status":"ok"}`
  - `curl -I http://127.0.0.1:4173` → `HTTP/1.1 200 OK`

## Card Table Surface Cleanup
- 사용자 피드백대로 `table` 자체가 아니라 카드 안에서 table을 한 번 더 감싸던 wrapper border를 제거했다.
- 수정 파일:
  - `frontend/src/components/tables/TransactionsTable.tsx`
  - `frontend/src/components/tables/CategoryBreakdownTable.tsx`
  - `frontend/src/components/insights/RecurringPaymentsTable.tsx`
  - `frontend/src/components/insights/SpendingAnomaliesTable.tsx`
  - `frontend/src/components/data/EditableTransactionsTable.tsx`
- 테스트 추가/보강:
  - `frontend/src/components/tables/TransactionsTable.test.tsx`
  - `frontend/src/components/data/EditableTransactionsTable.test.tsx`
  - `frontend/src/components/tables/tableSurfaceWrappers.test.tsx`
- 검증:
  - targeted regression:
    - `cd frontend && npm test -- --runInBand src/components/tables/TransactionsTable.test.tsx src/components/data/EditableTransactionsTable.test.tsx src/components/tables/tableSurfaceWrappers.test.tsx`
    - 결과: `3 files, 6 tests` 통과
  - full verification:
    - `cd frontend && npm test -- --runInBand`
    - `cd frontend && npm run lint`
    - `cd frontend && npm run typecheck`
    - 결과: `33 files, 84 tests` 통과 / lint 통과 / typecheck 통과
- 메모:
  - Recharts responsive container 관련 jsdom warning은 여전히 stderr에 남지만, 이번 변경과 무관하며 실패로 승격되지는 않았다.

## Editable Transactions Workbench Data Table Impact Review
- `shadcn/ui` 의 `Data Table`은 독립 컴포넌트라기보다 `TanStack Table` 위에 얹는 패턴이라 drop-in replacement는 아니다.
- 현재 거래 작업대 기준 영향 범위:
  - 상단 필터 bar는 이미 server-driven query state라 구조를 유지할 수 있다.
  - row selection / bulk action toolbar는 TanStack row selection으로 옮기기 쉬운 편이다.
  - 단건 수정/삭제/복원 버튼과 inline editor cell은 custom cell renderer + row-local editing state로 다시 엮어야 해서 refactor 비용이 있다.
  - mobile card 레이아웃은 Data Table이 대체하지 못하므로 현재 분기 렌더 구조를 계속 유지해야 한다.
- 결론:
  - 필터 구조에는 큰 영향이 없지만, 수정/삭제/복원과 inline edit 구조는 꽤 직접적인 영향이 있다.
  - 이번 visual density 조정 목적만으로는 교체 이점이 작고, 정렬/선택/정렬 기능을 본격적으로 늘릴 때 검토하는 편이 합리적이다.

## Table Separator Rollback + Recurring Merchant Truncation
- 사용자 피드백에 맞춰 공통 `Table`의 row/header separator는 복구하고, 카드 내부 table wrapper border 제거만 유지했다.
- 수정 파일:
  - `frontend/src/components/ui/table.tsx`
  - `frontend/src/components/insights/RecurringPaymentsTable.tsx`
  - `frontend/src/components/ui/table.test.tsx`
  - `frontend/src/components/tables/tableSurfaceWrappers.test.tsx`
- 구현:
  - `TableHeader`, `TableRow`, `TableCell`에 `border-b` 기반 separator 복구
  - 카드 내부 wrapper border 제거는 그대로 유지
  - `RecurringPaymentsTable`은 `table-fixed`로 전환하고 거래처 컬럼에 고정 폭을 부여
  - 거래처 셀은 `max-w-0` + 내부 `truncate`로 긴 문자열이 컬럼 폭을 밀지 않게 처리
- 검증:
  - targeted:
    - `cd frontend && npm test -- --runInBand src/components/ui/table.test.tsx src/components/tables/tableSurfaceWrappers.test.tsx`
    - 결과: `2 files, 4 tests` 통과
  - full:
    - `cd frontend && npm test -- --runInBand`
    - `cd frontend && npm run lint`
    - `cd frontend && npm run typecheck`
    - 결과: `33 files, 85 tests` 통과 / lint 통과 / typecheck 통과
