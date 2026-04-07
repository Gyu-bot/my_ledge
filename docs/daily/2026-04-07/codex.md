# 2026-04-07 Codex Log

## Review Server Bring-up + Tailnet Access

- 사용자 요청: 현재 구현물을 직접 리뷰할 수 있도록 frontend/backend 서버를 다시 띄우고, Tailscale로 접근 가능하게 정리

### 확인 순서

- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 10개 확인
- 기존 런타임 상태 점검
  - `docker compose ps` 로 DB health 확인
  - `.env`, `frontend/vite.config.ts`, `backend/app/core/config.py` 확인
  - `tailscale ip -4`, `tailscale status --json` 으로 Tailnet 연결 상태 확인

### 원인 조사

- backend
  - `uv run ...` 실행이 `/home/gyurin/.cache/uv` 권한 문제로 실패
  - 원인: 현재 샌드박스에서 `uv` cache 경로 접근 권한이 막혀 있음
  - 대응: `backend/.venv/bin/uvicorn` 직접 실행으로 우회
- frontend
  - Vite와 Vitest가 `@heroicons/react/24/outline` import 해석 실패
  - 확인 근거:
    - `frontend/package-lock.json` 에는 패키지가 있으나 실제 `frontend/node_modules/@heroicons/react` 디렉터리는 없음
    - 기존 `AppSidebar` 테스트가 import-analysis 단계에서 동일 오류로 실패
  - 대응: review용 runtime 복구를 위해 layout chrome icon을 `lucide-react` 로 교체

### 코드 변경

- layout chrome icon import 교체
  - `frontend/src/components/layout/AppSidebar.tsx`
  - `frontend/src/components/layout/AppTopbar.tsx`
  - `frontend/src/components/layout/MobileDrawer.tsx`
- sidebar prop 정리
  - `frontend/src/components/layout/AppLayout.tsx`
  - `frontend/src/components/layout/AppSidebar.tsx`
- 회귀 테스트 추가
  - 신규: `frontend/src/test/components/layout/AppLayout.test.tsx`
  - 수정: `frontend/src/test/components/layout/AppSidebar.test.tsx`
  - 정리: `frontend/src/test/lib/utils.test.ts`

### 검증

- 통과
  - `cd frontend && npm test -- src/test/components/layout/AppSidebar.test.tsx src/test/components/layout/AppLayout.test.tsx src/test/lib/utils.test.ts`
  - `cd frontend && npm run typecheck`
- 참고
  - `cd frontend && npm run lint` 는 기존 경고 7건 때문에 실패 상태 유지
  - 이번 턴에서 추가한 lint error는 모두 제거

### 런타임 상태

- backend
  - 실행 세션: `88118`
  - 명령: `cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000`
- frontend
  - 실행 세션: `67279`
  - 명령: `cd frontend && __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=moltbot.tailbe7385.ts.net npm run dev -- --host 0.0.0.0 --port 4173 --strictPort`

### 접속 확인

- Tailnet IP: `100.69.156.40`
- 정상 응답
  - `http://100.69.156.40:4173/`
  - `http://100.69.156.40:4173/api/v1/health`
  - `http://100.69.156.40:8000/api/v1/health`
- 제한사항
  - `http://moltbot.tailbe7385.ts.net:4173/` 는 현재도 Vite host check로 `403 Forbidden`
  - backend의 `http://moltbot.tailbe7385.ts.net:8000/api/v1/health` 는 응답 가능

### 메모

- 현재 노드에는 이미 다른 용도의 `tailscale serve` 설정(`127.0.0.1:18789` 프록시)이 있어, 이번 턴에서는 그 설정을 건드리지 않음
- review는 우선 Tailnet IP 기준으로 진행하는 것이 안전함

## Codex Skill Install

- 사용자 요청: `skill-installer` 로 `playwright` 스킬 설치

### 확인 순서

- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 10개 확인
- `skill-installer` / `using-superpowers` 지침 확인
- 기존 설치 여부 점검: `/home/gyurin/.codex/skills/playwright` 부재 확인

### 실행

- 설치 명령
  - `python3 /home/gyurin/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py --repo openai/skills --path skills/.curated/playwright`

### 검증

- 설치 결과
  - `/home/gyurin/.codex/skills/playwright` 생성 확인
  - `SKILL.md`, `scripts/playwright_cli.sh`, `references/` 포함 여부 확인

### 메모

- 새 스킬 반영에는 Codex 재시작이 필요함

## Codex Skill Install 2

- 사용자 요청: `skill-installer` 로 `frontend-skill` 설치

### 확인 순서

- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 10개 확인
- curated skill 목록 조회로 `frontend-skill` 존재 여부 확인
- 기존 설치 여부 점검: `/home/gyurin/.codex/skills/frontend-skill` 부재 확인

### 실행

- 목록 조회
  - `python3 /home/gyurin/.codex/skills/.system/skill-installer/scripts/list-skills.py`
- 설치 명령
  - `python3 /home/gyurin/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py --repo openai/skills --path skills/.curated/frontend-skill`

### 검증

- 설치 결과
  - `/home/gyurin/.codex/skills/frontend-skill` 생성 확인
  - `SKILL.md`, `agents/openai.yaml`, `LICENSE.txt` 포함 여부 확인

### 메모

- 새 스킬 반영에는 Codex 재시작이 필요함

## Frontend Audit

- 사용자 요청: 현재 프론트엔드 수정 필요사항 정리

### 확인 순서

- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 10개 확인
- frontend 문서/페이지 구현/API layer 대조
  - `docs/frontend/page-wireframes.md`
  - `docs/frontend/components-and-design-token-inventory.md`
  - `frontend/src/pages/*`
  - `frontend/src/api/*`
  - `frontend/src/hooks/*`
- backend 실제 계약 확인
  - `backend/app/api/v1/endpoints/transactions.py`
  - `backend/app/api/v1/endpoints/analytics.py`
- 검증
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`

### 확인 결과

- 런타임 설정 계약 불일치
  - nginx/runtime-config 는 `window.__MY_LEDGE_RUNTIME_CONFIG__.{apiKey, apiBaseUrl}` 를 주입하지만
  - frontend `apiClient.ts` 는 `window.__RUNTIME_CONFIG__.API_KEY` 와 고정 `/api/v1` 만 참조
- frontend 전용 query contract 잔존
  - `start_month`, `end_month`, `months`, `include_income`, `/transactions/daily-spend`
  - backend 실제 계약은 `start_date`, `end_date`, 기존 analytics params 중심이며 `daily-spend` endpoint 없음
- 라우트 커버리지 공백
  - PRD/AGENTS 라우트 목록의 `/income`, `/transfers` 가 현재 router에 없음
- 검증 실패 재현
  - lint: `AppSidebar` unused prop, 여러 페이지의 `useEffect` deps warning
  - typecheck: `AppSidebar.test.tsx` 가 필수 prop `onMobileOpen` 누락
- 토큰 정리 미완
  - `frontend/src/index.css`, `SegmentedBar.tsx`, `DailyCalendar.tsx`, 일부 페이지에 raw hex / palette class 잔존

### 메모

- 이번 턴은 코드 수정 없이 상태 문서와 로그만 갱신

## Frontend Docs Refresh + Token Sweep

- 사용자 요청: 현재 디자인은 유지한 채 프론트엔드 전체 컴포넌트/디자인 토큰을 대조하고, 토큰화되지 않은 부분을 토큰화한 뒤 `/docs` 의 프론트엔드 관련 문서를 현재 기준으로 먼저 갱신

### 확인 순서

- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 10개 확인
- current source-of-truth 후보와 historical 프론트 문서 분류
  - `docs/frontend-design-tokens.md`
  - `docs/frontend/components-and-design-token-inventory.md`
  - `docs/frontend/page-wireframes.md`
  - `docs/frontend-reimplementation-wireframe-functional-requirements.md`
  - `docs/superpowers/plans/*frontend*`
  - `docs/superpowers/specs/*frontend*`
- frontend 컴포넌트/토큰 실제 사용처 대조
  - `frontend/src/components/**/*`
  - `frontend/src/pages/**/*`
  - `frontend/src/index.css`
  - `frontend/tailwind.config.js`

### 문서 정리

- current source-of-truth 문서 전면 갱신
  - `docs/frontend-design-tokens.md`
  - `docs/frontend/components-and-design-token-inventory.md`
  - `docs/frontend/page-wireframes.md`
  - `docs/frontend-reimplementation-wireframe-functional-requirements.md`
- historical 문서 archive
  - `docs/archive/frontend/plans/`
  - `docs/archive/frontend/specs/`
  - `docs/archive/frontend/README.md`
- archive 대상 문서 상단에 historical 경고 추가
  - `Historical document. Do not use this file as the current frontend source of truth.`

### 코드 변경

- token source 정리
  - `frontend/src/index.css`
  - `frontend/tailwind.config.js`
  - semantic surface / border / accent / info / text / chart token 추가
- chart token 공통화
  - 신규: `frontend/src/lib/chartTheme.ts`
  - 신규 테스트: `frontend/src/test/lib/chartTheme.test.ts`
- layout chrome 정리
  - 신규: `frontend/src/components/layout/chromeContext.ts`
  - 수정: `frontend/src/components/layout/AppLayout.tsx`
  - 수정: `frontend/src/components/layout/AppSidebar.tsx`
  - 수정: `frontend/src/components/layout/MobileDrawer.tsx`
- raw hex / palette class 제거
  - `frontend/src/components/charts/DualBarChart.tsx`
  - `frontend/src/components/charts/HorizontalBarList.tsx`
  - `frontend/src/components/charts/LineAreaChart.tsx`
  - `frontend/src/components/charts/MoMBarList.tsx`
  - `frontend/src/components/charts/StackedBarChart.tsx`
  - `frontend/src/components/ui/DailyCalendar.tsx`
  - `frontend/src/pages/AssetsPage.tsx`
  - `frontend/src/pages/InsightsPage.tsx`
  - `frontend/src/pages/OverviewPage.tsx`
  - `frontend/src/pages/SpendingPage.tsx`
  - `frontend/src/pages/WorkbenchPage.tsx`

### 검증

- 통과
  - `cd frontend && npm test -- src/test/lib/chartTheme.test.ts src/test/components/layout/AppSidebar.test.tsx src/test/components/layout/AppLayout.test.tsx`
  - `cd frontend && npm test`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`

### 메모

- 이번 턴은 디자인 변경 없이 현재 색/간격/시각 방향을 유지한 상태에서 semantic token 연결만 정리
- 남은 프론트 이슈는 runtime config contract, frontend-backend query contract, `/income`·`/transfers` route coverage, MagicDNS host allowlist

## Frontend Contract Alignment

- 사용자 요청: 계약 정합성 관련 부분 모두 수정

### 설계

- runtime config는 backend/nginx가 이미 주입하는 `window.__MY_LEDGE_RUNTIME_CONFIG__.{ apiKey, apiBaseUrl }` 를 frontend source-of-truth로 사용
- month 기반 UI 입력은 유지하고, API layer에서 backend 계약인 `start_date` / `end_date` 로 변환
- backend에 없는 `/transactions/daily-spend` 는 추가하지 않고, 기존 `/transactions` 목록 응답을 월 단위로 읽어 클라이언트에서 일별 합산
- `/income`, `/transfers` 는 live page를 되살리지 않고 overview(`/`) redirect로 명시

### TDD

- failing test 추가
  - 신규: `frontend/src/test/lib/apiClient.test.ts`
  - 신규: `frontend/src/test/api/contracts.test.ts`
  - 신규: `frontend/src/test/router.test.tsx`
- red 확인
  - `cd frontend && npm test -- src/test/lib/apiClient.test.ts src/test/api/contracts.test.ts src/test/router.test.tsx`
  - 초기 실패:
    - `apiClient` 가 `/api/v1` 와 `__RUNTIME_CONFIG__` 를 고정 사용
    - analytics/transactions API layer 가 `months`, `start_month`, `end_month`, `/transactions/daily-spend` 를 그대로 사용
    - legacy route fallback 명시 부재

### 코드 변경

- runtime config contract 정렬
  - `frontend/src/lib/apiClient.ts`
- month/date adapter 추가
  - 신규: `frontend/src/lib/dateRange.ts`
- transactions API 계약 정렬
  - `frontend/src/api/transactions.ts`
  - `start_month` / `end_month` → `start_date` / `end_date`
  - `categoryBreakdown(include_income)` → backend `type=all|지출`
  - `dailySpend` → `/transactions` 기반 client aggregation
- analytics API 계약 정렬
  - `frontend/src/api/analytics.ts`
  - `months` → 최근 N개월 `start_date` / `end_date`
  - `fixedCostSummary` month range adapter
  - `merchantSpend` month range adapter + `type=지출`
- route 정렬
  - `frontend/src/router.tsx`
  - `/income` → `/`
  - `/transfers` → `/`
  - `routes` export 추가로 route contract 테스트 가능화
- 화면/문서 정합화
  - `frontend/src/pages/OverviewPage.tsx`
  - `docs/frontend/page-wireframes.md`
  - `docs/frontend-reimplementation-wireframe-functional-requirements.md`
  - `AGENTS.md`
  - `docs/STATUS.md`

### 검증

- focused red/green
  - `cd frontend && npm test -- src/test/lib/apiClient.test.ts src/test/api/contracts.test.ts src/test/router.test.tsx`
- full verification 통과
  - `cd frontend && npm test`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`

### 메모

- 계약 정합성 이슈는 정리됐고, 남은 프론트 운영 이슈는 MagicDNS host allowlist 와 운영 배포본 smoke capture다

## Frontend Follow-up TODO Intake

- 사용자 요청: 아래 8개 항목을 우선 TODO list에만 추가

### 추가된 TODO

- 지출 분석 페이지 조회 범위 슬라이더 시작 구간 동작 복구
- 월별 카테고리 추이에서 Top 5만 개별 표시, 나머지는 `기타` 로 묶기
- 거래처별 지출 비중 TreeMap 기간을 월별 상세필터와 동기화
- 일별 지출 달력 hover/popover 금액 표시 추가
- 프로젝트 전체 pagination 폰트 토큰화 및 크기 축소
- 인사이트 거래처 소비 Top 5 기간 선택지 추가: 1개월 / 3개월 / 6개월 / 1년
- 인사이트 카테고리 전월 대비 기준월 선택 UI 추가
- dark theme 에서 가독성이 낮은 soft 계열 font color 전역 조정

### 반영 위치

- `docs/STATUS.md`
  - `Next Up > Frontend UI/UX 후속 개선 묶음`

### 메모

- 이번 턴은 TODO 반영만 수행했고 구현은 시작하지 않음

## Frontend Review + Direction Proposal

- 사용자 요청: `frontend-developer`, `ui-designer` 관점으로 현재 프론트엔드와 향후 수정/구현 계획 검토 후 수정 방향 제안

### 확인 순서

- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 10개 확인
- frontend source-of-truth 문서/구현 대조
  - `docs/frontend-design-tokens.md`
  - `docs/frontend/components-and-design-token-inventory.md`
  - `docs/frontend/page-wireframes.md`
  - `docs/frontend-reimplementation-wireframe-functional-requirements.md`
  - `frontend/src/pages/*`
  - `frontend/src/components/layout/*`
  - `frontend/src/components/ui/*`
  - `frontend/src/api/*`
  - `frontend/src/hooks/*`
- 병렬 검토
  - `frontend-developer`: 구조/계약/테스트/우선순위 검토
  - `ui-designer`: IA/UX/visual system 검토 시도

### 핵심 확인 결과

- `SpendingPage` 정합성 우선
  - `조회 범위` slider는 `RangeSlider` 내부 draft state와 겹친 input 구조 때문에 controlled component로 보장되지 않음
  - `거래처별 지출 비중`은 여전히 최근 3개월 고정
  - `소분류별 지출`은 실제 minor-category 집계가 아니라 기존 category breakdown 재사용 구조라 기능 정의와 불일치
- section state contract 누락
  - 문서상 `loading / empty / error` 분리가 요구되지만 Spending / Insights / Workbench 일부 section은 error를 empty처럼 삼키는 경로가 남아 있음
- shell source-of-truth 분산
  - router / sidebar / mobile drawer / topbar metadata가 분산 정의돼 route 추가/변경 시 drift 리스크 존재
  - topbar meta badge도 raw node 주입 방식이라 page unmount 정리가 일관되지 않음
- Workbench 상태 밀집도 과다
  - filter draft/applied, selection, inline edit, bulk edit, upload, reset, alert, accordion state가 단일 page component에 집중
- 테스트 기준선은 정상
  - 현재 작업 트리 기준 `cd frontend && npm test`, `npm run lint`, `npm run typecheck` 모두 통과

### 제안한 우선순위

1. Spending correctness batch
   - slider controlled 재구성
   - real subcategory breakdown 구현
   - treemap/detail-range 동기화
2. shared section-state boundary 도입
   - `loading / error / empty / ready` 공통화
3. shell manifest 통합
   - route / nav / breadcrumb / title / meta source-of-truth 단일화
4. behavior test 보강
   - Spending interaction
   - Workbench read-only / bulk flow
   - topbar meta lifecycle

### 메모

- `ui-designer` agent는 종료 전에 결과를 반환하지 못했고, UX/IA 판단은 메인 세션에서 직접 보강해 정리
- `docs/STATUS.md` 에 이번 리뷰 결과를 반영해 구조/정합성 작업을 UI polish보다 상위로 재배치

## UI Designer Follow-up Clarification

- 사용자 질문: `ui-designer` 가 왜 결과를 못 줬는지, 그리고 UI polishing 필요성 재확인

### 정리

- `ui-designer` agent는 문서/컴포넌트 전체를 읽는 중 timeout 안에 완료 응답을 반환하지 못함
- 중간 요약을 강제로 요청했지만 추가 timeout 안에도 응답이 없어서 stray agent를 남기지 않기 위해 shutdown 처리
- 즉, 원인은 분석 실패가 아니라 `응답 완료 전 종료` 에 가까움

### 판단 보강

- UI polishing 필요성 자체는 인정
- 다만 순서는 아래가 적절
  1. Spending correctness / shell manifest / section state boundary
  2. 그 직후 UI polish batch
- 이유
  - 현재는 같은 화면 안에서도 시간 기준과 state 표현이 분산돼 있어 시각 polish만 먼저 하면 표면만 좋아지고 interaction 일관성은 그대로 남음

### 추가로 명시한 UI polish 방향

- sidebar/topbar hierarchy 강화
- card header / badge / filter row 밀도 정리
- dense table 와 mobile card 정보 우선순위 재정렬
- chart tooltip / legend / annotation 대비와 가독성 보강

## UI Designer Partial Review Recovered

- 후속 실행: `ui-designer` scope를 현재 화면 리뷰로 좁혀 재실행하고 partial findings를 회수

### 회수된 핵심 결과

- shell IA 선결정 필요
  - desktop sidebar 는 icon-only
  - mobile drawer 는 labeled grouped links
  - topbar 는 hardcoded route metadata
  - 이 split model을 유지한 채 route가 늘어나면 nav/topbar를 다시 손보게 될 가능성이 큼
- `SpendingPage` filter hierarchy 불안정
  - timeline range / detail range / calendar month / income toggle / category drill-down 이 한 화면에 공존하지만 global vs local 경계가 명확하지 않음
- `WorkbenchPage` task hierarchy 과밀
  - filtering / bulk edit / row edit / upload / history / reset 이 한 화면에 집중돼 향후 기능 확장 시 IA 재조정 가능성 큼
- shared primitive 가 시각 스타일은 맞추지만 interaction contract 까지는 통일하지 못함
  - `SectionCard`, `KpiCard`, `Pagination` 만으로는 header action, explanatory text, responsive state placement를 강제하지 못함
- interaction debt 후보
  - hidden stacked range input
  - daily calendar 의 color 의존 표현
  - glyph/emoji action 일부
  - mobile drawer focus-management 의도 미표현

### 이번 턴 결론

- 구현 전 선결정이 필요한 항목 3개를 `docs/STATUS.md` 최상단 `Next Up` 으로 승격
  1. shell contract
  2. page filter ownership
  3. shared interaction spec

### 메모

- 사용자 우려대로, 이 3가지를 먼저 정하지 않으면 correctness batch 이후 UI 재구현이 한 번 더 발생할 가능성이 높음

## UI Decision Clarification

- 사용자 질문: 지금 직접 결정해야 하는 UI/IA 항목이 무엇인지 명확히 정리 요청

### 정리한 결정 항목

1. shell contract
   - desktop sidebar를 icon-only로 유지할지, label이 보이는 standard sidebar로 바꿀지
   - topbar는 breadcrumb + title + meta까지만 맡길지, page action/filter도 일부 올릴지
2. filter ownership
   - `SpendingPage` 에서 어떤 필터가 page-global인지, 어떤 컨트롤이 section-local인지 확정
3. shared interaction spec
   - card header action, accordion, pagination, empty/loading/error, mobile overflow, dense table/card 규칙을 공통 기준으로 고정

### 메모

- 나머지 세부 polishing은 위 3개가 고정된 뒤 구현/보정하는 편이 재작업을 줄임

## User Decision Applied

- 사용자 결정 반영
  - shell contract: `B` 선택
    - desktop sidebar는 label이 보이는 standard sidebar 방향
    - topbar는 breadcrumb + title + meta 중심 유지
  - `SpendingPage` filter ownership: 제안안 채택
    - page-global: `detail range`, `income toggle`
    - section-local: `calendar month`, `category drill-down`
    - timeline range: 상단 추이 section 전용

### 문서 반영

- `docs/STATUS.md`
  - `Next Up > Frontend UI/IA 선결정` 1, 2번 완료 처리
  - `Key Decisions` 에 shell/filter ownership 결정 추가

## Shared Interaction Spec Direction Fixed

- 사용자 결정
  - shared interaction spec은 공통 규칙으로 강하게 묶는 방향 채택

### 의미

- page별 예외를 늘리기보다 아래를 공통 규칙으로 고정
  - card header action 수와 배치
  - accordion 사용 기준
  - pagination 위치와 크기
  - empty/loading/error 상태 배치
  - mobile table-card fallback 기준
  - destructive action 표현 규칙

### 문서 반영

- `docs/STATUS.md`
  - `Next Up > Frontend UI/IA 선결정` 3번 완료 처리
  - `Key Decisions` 에 shared interaction spec 방향 추가

## Frontend UI/IA Spec Draft Upgrade

- 사용자 요청: 현재 spec 초안이 실제 `frontend-developer` handoff 문서로 충분한지 점검 요청

### 판단

- 기존 초안은 방향 문서로는 충분했지만 handoff 문서로는 부족
- 부족했던 항목
  - 구현자가 바로 따라갈 acceptance criteria
  - component/surface별 적용 범위
  - 구현 순서
  - non-goal 경계

### 보강 내용

- `docs/superpowers/specs/2026-04-07-frontend-ui-ia-decision-design.md` 확장
  - shell contract handoff requirement 추가
  - `SpendingPage` filter ownership acceptance criteria 추가
  - shared interaction spec의 card/table/state/mobile/destructive rule을 handoff requirement로 구체화
  - `frontend-developer` 기준 구현 순서 명시
  - non-goals 추가

### 메모

- 현재 spec은 이제 “결정 메모”가 아니라 구현 handoff 초안으로 사용할 수 있는 수준
- 아직 implementation task breakdown 자체는 별도 plan 문서가 더 적합하지만, 구현자가 이 문서만 읽고도 해석 없이 시작할 수 있게는 정리됨

## Frontend Rollout + Backend/API SSOT

- 사용자 요청
  - `frontend-developer` 기준 implementation plan 작성 및 실제 구현 진행
  - backend/API 구현 상태를 문서화해 SSOT로 만들고 PRD/기타 문서를 현재 코드 기준으로 정리

### 계획/위임

- 구현 계획 작성
  - `docs/superpowers/plans/2026-04-07-frontend-ui-ia-rollout-implementation.md`
  - `docs/superpowers/plans/2026-04-07-backend-api-ssot-documentation-implementation.md`
- 병렬 위임
  - `frontend-developer`: shell/Spending/shared interaction 구현 검토 및 착수
  - `documentation-engineer` 역할 worker: backend/API 실구현 대조, SSOT 문서/PRD/README 정리 범위 조사

### 서브에이전트 결과

- `frontend-developer`
  - read-only 분석까지만 진행하고 편집 없이 종료
  - route manifest, Spending correctness, topbar meta lifecycle 테스트가 다음 작업 포인트라고 정리
- `documentation-engineer`
  - 편집 없이 종료했지만 중요한 불일치 목록 반환
  - 핵심 발견
    - PRD의 snapshot 적재 설명은 UPSERT지만 실제 구현은 `snapshot_date` 단위 delete + re-insert
    - `merchant`, `cost_kind`, `fixed_cost_necessity`, `GET /api/v1/transactions/filter-options` 가 PRD에 충분히 반영되지 않음
    - `assets/snapshots` query param, `snapshot_date=latest`, 업로드 파일 recent-5 retention 문구가 live code와 불일치 가능

### 직접 구현한 frontend 변경

- shell/source-of-truth
  - `frontend/src/navigation.ts` 추가
  - `frontend/src/router.tsx`, `AppSidebar.tsx`, `MobileDrawer.tsx`, `AppTopbar.tsx` 를 단일 route metadata 기준으로 정렬
- `SpendingPage`
  - `detail range` 기반 treemap badge 유지
  - 누락된 accordion state 복구
  - `category drill-down` 을 실제 selected major 기준 subcategory aggregate로 재구성
- transaction adapter/hook
  - `transactionApi.subcategoryBreakdown()` 추가
  - `useSubcategoryBreakdown()` 추가
  - range adapter를 이용해 transactions list 기반 subcategory 집계 구현
- 테스트
  - `AppTopbar`, `RangeSlider`, `SpendingPage`, API contract test 보강
  - `AppLayout` 테스트를 labeled sidebar 기준으로 보정

### 직접 문서화한 backend/API 변경

- 신규 SSOT 문서 작성
  - `docs/backend-api-ssot.md`
- 참조 구조 정리
  - `README.md` 에 `docs/STATUS.md` 와 `docs/backend-api-ssot.md` 링크 반영
  - `PRD.md` 를 live backend/API contract 기준으로 보정
  - `docs/additional_feature.md` 상단에 historical/non-SSOT 경고 추가

### 검증

- frontend focused red -> green
  - `cd frontend && npm test -- src/test/api/contracts.test.ts src/test/components/ui/RangeSlider.test.tsx src/test/pages/SpendingPage.test.tsx`
- frontend shell/spending regression
  - `cd frontend && npm test -- src/test/router.test.tsx src/test/components/layout/AppSidebar.test.tsx src/test/components/layout/AppTopbar.test.tsx src/test/api/contracts.test.ts src/test/components/ui/RangeSlider.test.tsx src/test/pages/SpendingPage.test.tsx`
- frontend full verification
  - `cd frontend && npm test`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`

### 결과

- frontend 전체 검증 통과
  - `15` test files, `37` tests passed
  - lint 0
  - typecheck 0
- shell contract, Spending filter ownership, backend/API 문서 SSOT가 현재 코드 기준으로 맞춰짐

### 남은 작업 메모

- shared interaction spec의 본격 rollout은 아직 남음
  - `SectionCard` slot model 정리
  - `InsightsPage` / `WorkbenchPage` 상태 경계 통일
  - Workbench bulk/read-only behavior test 확장

## Repo Snapshot Commit

- 사용자 요청
  - 이번 세션에서 남아 있던 변경사항을 우선 한 번에 커밋

### 포함 범위

- frontend source-of-truth 문서 갱신본
- `docs/archive/frontend/**` 로 이동한 historical spec/plan
- chart/theme/date-range/runtime adapter 관련 frontend 코드
- canonical route test, api client test, chart theme test 등 남아 있던 테스트 파일
- `AGENTS.md`, `.gitignore` 후속 정리

### 제외 범위

- `.playwright-mcp/`
  - 로컬 브라우저 실행 artifact라서 `.gitignore`에 추가하고 커밋에서는 제외

## PRD / Code / Data Review

- 사용자 요청
  - `PRD.md`, live 코드/문서, 현재 적재 데이터 기준으로 현행 기능을 리뷰하고 추가 기능 후보를 정리

### 확인 순서

- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 10개 확인
- 제품/계약 문서 대조
  - `PRD.md`
  - `docs/backend-api-ssot.md`
  - `docs/additional_feature.md`
- backend 구현/테스트 확인
  - `backend/app/api/v1/endpoints/*.py`
  - `backend/app/services/{upload_service,transactions_service,analytics_service,assets_service,canonical_views}.py`
  - `backend/tests/services/test_{upload,analytics}_service.py`
- frontend surface 확인
  - `frontend/src/pages/*`
  - `frontend/src/api/*`
- PostgreSQL 적재 상태 확인
  - `transactions`, `asset_snapshots`, `investments`, `loans`, `upload_logs`

### 점검 결과

- 구현 범위
  - core upload/read/edit flow는 live
  - advisor analytics는 P0/P1 8종까지 live
  - `POST /api/v1/transactions/merge` 는 여전히 `501` stub
  - Phase 4C(`net-worth-breakdown`, `investment-performance`, `debt-burden`, `emergency-fund`)는 아직 미구현
- 계약/문서
  - review 기준 SSOT는 `backend code -> docs/backend-api-ssot.md -> PRD.md`
  - 업로드 원본 recent-5 retention은 문서에 남아 있지만 live code에는 아직 없음
- 실데이터
  - `transactions`: 2219건, `2025-03-12 ~ 2026-03-11`
  - `is_deleted=true`: 3건, `source='manual'`: 0건
  - `asset_snapshots`: 45건 / `investments`: 11건 / `loans`: 5건
  - 세 snapshot 테이블 모두 `snapshot_date=2026-03-24` 1개만 존재
  - 지출 실데이터에서 `cost_kind`, `fixed_cost_necessity` 채워진 건수는 0
  - merchant alias 분산 다수 확인
    - `쿠팡(쿠페이)` / `쿠팡_쿠페이`
    - `신세계 사우스시티` / `신세계사우스시티`
    - `KT통신요금 납부` / `KT통신요금납부`

### 검증

- 통과
  - `cd frontend && npm test -- --runInBand`
  - `cd frontend && npm run lint && npm run typecheck`
- 실패
  - `cd backend && uv run pytest`
  - 실패 상세
    - `tests/services/test_analytics_service.py::test_get_recurring_payments_detects_monthly`
    - `tests/services/test_analytics_service.py::test_get_recurring_payments_filters_by_min_occurrences`
    - `tests/services/test_analytics_service.py::test_get_spending_anomalies_detects_spike`
    - `tests/services/test_analytics_service.py::test_get_spending_anomalies_filters_by_threshold`
  - 원인
    - `get_recurring_payments`, `get_spending_anomalies` 서비스 함수가 `page`, `per_page` required 인자를 받도록 바뀌었지만 서비스 테스트 호출부는 그 계약을 반영하지 못함

### 메모

- 후속 사용자 가정 반영
  - snapshot은 동일 기준으로 계속 적재된다고 보고, 현재 단일 snapshot 상태 자체는 우선 blocker로 보지 않음
  - `cost_kind` / `fixed_cost_necessity` 공백은 추후 사용자가 직접 분류할 예정이므로 현재 결함 우선순위에서는 제외
- 그 전제 이후에도 남는 핵심 리스크
  - backend analytics regression 미복구
  - `SpendingPage` 거래처 treemap query가 사용자가 선택한 상세 기간과 어긋남
  - reset 이후 `upload_logs` retained 로 current state와 history가 분리될 수 있음
  - PRD의 `이체=자산이동` separate tracking 요구는 아직 redirect-only

## Advisor Analytics Plan Follow-up

- 사용자 요청
  - merchant normalization과 merchant 기반 fixed/variable classification은 deferred 항목으로 구현계획에 명시
  - transfer tracking slice 추가 설명
  - irregular snapshot compare의 유용성 판단
  - liquidity/debt health 상세 로직을 `fintech-engineer` 검토 후 구현계획에 반영

### fintech-engineer 검토 요약

- transfer tracking
  - `이체`를 단순 제외가 아니라 별도 자금 이동 slice로 해석
  - domain model: `transfer_candidate`, `matched_transfer_pair`, `unmatched_transfer`, `loan_principal_movement`, `investment_funding_or_withdrawal`
  - MVP endpoint:
    - `GET /api/v1/transfers/summary`
    - `GET /api/v1/transfers`
    - `GET /api/v1/transfers/unmatched`
- irregular snapshot compare
  - 유효함
  - 단, `latest_vs_previous_available` 또는 `selected_vs_previous_available` 기준으로 비교해야 하고 `comparison_days`를 반드시 노출
  - 속도형 지표는 `daily_change_est`, `monthly_change_est` 같은 추정치로만 노출
- liquidity health
  - input: latest snapshot + 최근 3개월 평균 지출 + 가능하면 essential spend
  - output: `liquid_assets`, `near_liquid_assets`, `monthly_burn_est`, `essential_monthly_burn_est`, `emergency_fund_months_est`, `total_runway_months_est`, `liquidity_ratio_est`
  - essential 분류가 없으면 총지출 기반 fallback + `confidence=low`
- debt health
  - input: latest loans + 최근 평균 월수입 + latest asset snapshot
  - output: `total_debt_balance`, `secured_debt_balance`, `unsecured_debt_balance`, `weighted_avg_interest_rate`, `debt_to_asset_ratio`, `monthly_debt_service_est`, `debt_service_to_income_est`
  - 만기일 없으면 `interest-only floor`, loan type별 fallback term 적용

### 문서 반영

- 수정
  - `docs/superpowers/plans/2026-03-31-advisor-analytics-expansion.md`
- 반영 내용
  - `Transfer Tracking MVP` workstream 추가
  - `Snapshot Compare` 로직과 guardrail 추가
  - `liquidity-health`, `debt-health` 상세 지표/추정 규칙 추가
  - deferred schema enrichment에 `merchant_normalized`, merchant 기반 fixed/variable classification rules 명시
  - heuristic contract 공통 규칙에 `confidence`, `assumptions`, `*_est`, `comparison_days` 추가

## Debt Principal Classification Follow-up

- 사용자 질문
  - 현재 적재 데이터에서 대출원금상환이 실제로 `이체`가 아니라 `지출`로 들어와 있는지 확인 요청

### 확인 결과

- 맞음
  - 현재 live 데이터에서 대출 관련 상환 row는 raw `type='이체'`가 아니라 `type='지출'`로 적재됨
  - 대표 분포
    - `원금·이자 자동이체(8640)` / `원금·이자 자동이체(5070)` / `원금·이자 갚음(8640)`
    - `category_major='금융'`, `category_minor='미분류'`
  - 별도 `대출상환` 카테고리 row는 현재 0건
- 보조 관찰
  - `대출이자원가`도 동일하게 `지출`/`금융`으로 적재됨
  - 따라서 transfer tracking은 raw `type='이체'`만 모아서는 불완전함

### 계획 반영

- `docs/superpowers/plans/2026-03-31-advisor-analytics-expansion.md`
  - transfer tracking MVP에 expense-side 재분류 레이어 추가
  - debt movement 후보 패턴(`원금·이자 자동이체`, `원금·이자 갚음`) 탐지 메모 추가
  - 가능하면 `estimated_principal_component` / `estimated_interest_component` 를 추정치로 분리하고, 아니면 debt-movement candidate로 남기도록 명시

### 사용자 의도 반영

- 사용자 의도
  - 대출 상환금은 일부러 고정비 지출로 보려는 목적이 있음
- 반영 원칙
  - raw transaction의 `type='지출'` 는 유지
  - transfer tracking은 raw type 변경이 아니라 파생 태그/파생 view로 제공
  - 기본 지출 분석에서는 대출 상환 row를 계속 포함
  - 추후 필요할 때만 별도 `원금 제외 보기` 같은 opt-in slice를 검토

### 지표별 정책 정리

- spending / fixed-cost 관점
  - 월 지출, 고정비 합계, 카테고리 지출에는 대출 상환액을 기본 포함
- debt-health 관점
  - `monthly_debt_service_est` 는 상환 총액 기준
  - 가능할 때만 `estimated_principal_component`, `estimated_interest_component` 를 별도 파생
- transfer / debt movement 관점
  - raw transaction 제거 없이 동일 row를 debt-movement candidate로 병행 표시
- 향후 opt-in 가능 항목
  - `원금 제외 소비`
  - `이자만 금융비용`
  - `부채 감소 속도`

### 우선순위 조정

- 사용자 요청
  - 위 정책은 문서화하되, 대출상환의 expense-side 원금/이자 파생 해석 구현은 나머지 analytics가 안정화된 뒤로 우선순위를 미뤄달라고 요청
- 반영
  - advisor analytics plan의 transfer tracking MVP 범위를 raw `type='이체'` 중심의 안정화 범위로 축소
  - 대출상환 파생 해석은 `Post-stabilization follow-up` 및 deferred additions로 이동
  - rollout order를 `Transfer Tracking MVP -> P2 asset/liability health -> analytics 안정화 -> debt principal derivation 재평가` 순서로 수정

## Stability-First Reprioritization

- 사용자 요청
  - 신규 기능 구현의 우선순위는 모두 뒤로 미루고, 현재 기능에서 잘못된 부분 수정과 안정적 구현을 최우선으로 둘 것
  - 현재 API, backend, frontend 정합성을 맞추는 것이 1순위

### 반영

- `docs/STATUS.md`
  - `Review follow-up triage` 를 실질적인 최우선 묶음으로 유지
  - `Next Up` 을 안정화 순서로 재정렬:
    - backend analytics regression fix
    - frontend analytics date-range contract fix
    - `upload_logs` semantics 정리
    - backend/API 문서와 live contract 정렬
    - 수정 후 system validation
  - `merchant normalization`, `transfers/*`, `liquidity-health`, `debt-health`, `snapshot-compare`, 대출상환 파생 해석은 모두 후순위 보류로 명시
- `docs/superpowers/plans/2026-03-31-advisor-analytics-expansion.md`
  - rollout order 최상단에 `Freeze new analytics feature work until current API/backend/frontend contract is green end-to-end` 를 추가
  - 신규 analytics workstream 재개 조건을 `existing surfaces are stable in code, tests, and docs` 로 명시

## Stability Batch 1

- 사용자 요청
  - 현재까지 내용은 커밋/푸시한 뒤, 신규 기능보다 현행 기능의 정합성과 오류 수정부터 시작

### 배포/정리

- 실행
  - `git commit -m "[docs] advisor review and stability priority sync (codex)"`
  - `git push origin main`
- 결과
  - `171b4f8 [docs] advisor review and stability priority sync (codex)` 가 `origin/main` 까지 push 완료

### root cause 확인

- backend
  - `get_recurring_payments`, `get_spending_anomalies` service 함수가 API endpoint와 달리 `page`, `per_page` 기본값이 없어 service test와 계약 drift 발생
- frontend
  - `SpendingPage` 의 거래처 treemap는 badge만 상세 범위를 보여주고, 실제 API query는 여전히 `months -> recentMonthsToDateRange()` 로 변환돼 relative 최근 N개월 기준으로 조회
- backend full regression
  - analytics 수정 후 전체 `pytest`를 다시 돌리니 추가로 workbook fixture 이름 drift 확인
  - 테스트는 `finance_sample.xlsx`, `sample_260324.xlsx` 를 찾지만 저장소 `tmp/` 에는 `fs_260311.xlsx`, `fs_260324.xlsx` 만 존재
  - 확인 결과 `finance_sample.xlsx` 와 `fs_260311.xlsx` 는 파일 크기가 동일했고 workbook 구조도 일치

### 수정

- backend
  - `backend/app/services/analytics_service.py`
    - `get_recurring_payments(page=1, per_page=10)`
    - `get_spending_anomalies(page=1, per_page=10)`
  - `backend/tests/services/test_analytics_service.py`
    - recurring test를 `merchant` 필드 기준으로 정렬
    - default pagination 응답값 검증 추가
  - `backend/tests/conftest.py`
    - fixture alias fallback 추가
    - `finance_sample.xlsx -> fs_260311.xlsx`
    - `sample_260324.xlsx -> fs_260324.xlsx`
- frontend
  - `frontend/src/api/analytics.ts`
    - `merchantSpend` 가 `start_month` / `end_month` 입력을 우선 사용하도록 수정
  - `frontend/src/hooks/useAnalytics.ts`
    - `useMerchantSpend` 파라미터 타입 확장
  - `frontend/src/pages/SpendingPage.tsx`
    - treemap query를 `detailStart` / `detailEnd` month span 기준으로 변경
  - `frontend/src/test/api/contracts.test.ts`
    - `merchantSpend` month-span contract test 추가
  - `frontend/src/test/pages/SpendingPage.test.tsx`
    - 상세 범위 기준 query 인자 검증 추가
    - system time 고정으로 test nondeterminism 제거

### 검증

- 통과
  - `cd backend && uv run pytest tests/services/test_analytics_service.py -q` → `12 passed`
  - `cd frontend && npm test -- --runInBand src/test/api/contracts.test.ts src/test/pages/SpendingPage.test.tsx` → `6 passed`
  - `cd backend && uv run pytest -q` → `62 passed`
  - `cd frontend && npm test -- --runInBand` → `38 passed`
  - `cd frontend && npm run lint && npm run typecheck` → 통과

### 남은 안정화 과제

- `upload_logs` retained contract를 운영 문서와 UI copy에 명시할지 결정
- upload retention(`/data/uploads/` recent 5) 문서와 live code 일치 여부 정리
- 수정 후 upload/read/edit/reset 운영 플로우 재검증

## Real Workbook Sweep

- 사용자 요청
  - 현재 DB를 비우고 `tmp/fs_*.xlsx` 실제 샘플을 파일명 기반 `snapshot_date` 로 적재한 뒤, backend 기능과 rolling window / snapshot 시계열 동작을 실데이터로 점검
  - 별도 reviewer 에이전트 결과까지 반영

### reviewer 요약

- `Archimedes` 리뷰 결과:
  - 실제 workbook 체인이 cumulative full export가 아니라 rolling window 라는 점을 다시 확인해야 함
  - later workbook(`fs_260326`, `fs_260407`) 이 자동 테스트에 포함되지 않음
  - `verify_import_parity` 는 sampled transaction presence 중심이라 extra stale row 검증은 하지 못함
  - snapshot API는 single-date fixture 위주라 multi-date ordering/latest default coverage가 부족함

### 실DB 초기화 및 순차 적재

- 실행
  - local Postgres 테이블 `transactions`, `asset_snapshots`, `investments`, `loans`, `upload_logs` 전체 삭제
  - `fs_260311.xlsx` → `2026-03-11`
  - `fs_260324.xlsx` → `2026-03-24`
  - `fs_260326.xlsx` → `2026-03-26`
  - `fs_260407.xlsx` → `2026-04-07`
- 결과
  - `fs_260311.xlsx`
    - `tx_total=2219`, `tx_new=2219`, `tx_skipped=0`
    - snapshots `45 / 11 / 5`
  - `fs_260324.xlsx`
    - `tx_total=2226`, `tx_new=68`, `tx_skipped=2158`
    - DB import total `2286`
    - snapshots `44 / 11 / 4`
  - `fs_260326.xlsx`
    - `tx_total=2227`, `tx_new=4`, `tx_skipped=2223`
    - DB import total `2290`
    - snapshots `44 / 11 / 4`
  - `fs_260407.xlsx`
    - `tx_total=2249`, `tx_new=136`, `tx_skipped=2113`
    - DB import total `2359`
    - snapshots `44 / 11 / 4`
  - snapshot date는 최종적으로 `2026-03-11`, `2026-03-24`, `2026-03-26`, `2026-04-07` 4점 적재

### root cause 재분석

- 실제 workbook 범위를 재계산한 결과:
  - `fs_260311.xlsx` 는 `2025-03-12 ~ 2026-03-11`
  - `fs_260324.xlsx` 는 `2025-03-24 ~ 2026-03-24`
  - `fs_260326.xlsx` 는 `2025-03-26 ~ 2026-03-25`
  - `fs_260407.xlsx` 는 `2025-04-07 ~ 2026-04-07`
- 결론
  - 이 샘플들은 “전체 누적 export”가 아니라 “약 1년 rolling window export”
  - 따라서 DB 최종 거래 건수가 최신 workbook row 수(`2249`)와 같지 않은 것은 기본적으로 정상
  - 올바른 계약은:
    - overlap window 내부는 최신 workbook 기준으로 reconcile
    - overlap window 밖 과거 history는 유지

### 수정

- `backend/app/services/upload_service.py`
  - `_reconcile_transaction_rows()` 가 `rows_to_insert` 뿐 아니라 `rows_to_delete` 도 반환하도록 변경
  - rolling window 내부에서 최신 workbook과 매칭되지 않은 기존 import row는 stale row로 보고 삭제
  - manual row는 기존처럼 대상으로 삼지 않음 (`source='import'` window only)
- `backend/app/services/source_verification.py`
  - exact signature 실패 시 import fallback signature + 60초 이내 시간 차 허용으로 parity false negative 제거
- `backend/tests/conftest.py`
  - fixture alias 확장
  - `sample_260326.xlsx -> fs_260326.xlsx`
  - `sample_260407.xlsx -> fs_260407.xlsx`
  - 추가 fixture `rolling_window_workbook_v2_bytes`, `latest_workbook_bytes`
- `backend/tests/services/test_upload_service.py`
  - rolling window contract를 “latest workbook 전체 일치”가 아니라 “window 내부 reconcile + out-of-window history 유지”로 고정
  - 실제 4개 workbook 체인 기준 cumulative history count 테스트 추가
- `backend/tests/api/test_assets_api.py`
  - multi-date snapshot history ordering
  - latest default summary
  - requested snapshot date semantics 테스트 추가
- `backend/tests/services/test_source_verification.py`
  - rolling window fallback parity 회귀 테스트 추가

### API smoke

- 실DB 기준 ASGI smoke 확인:
  - `GET /api/v1/assets/snapshots` → 200, snapshot date 4점 반환
  - `GET /api/v1/assets/net-worth-history` → 200, point 4개
  - `GET /api/v1/investments/summary` → 200, latest `2026-04-07`, 11 items
  - `GET /api/v1/loans/summary` → 200, latest `2026-04-07`, 4 items
  - `GET /api/v1/transactions/summary` → 200
  - `GET /api/v1/transactions/by-category` → 200
  - `GET /api/v1/transactions/by-category/timeline` → 200
  - `GET /api/v1/analytics/monthly-cashflow` → 200
  - `GET /api/v1/analytics/merchant-spend` → 200
  - `GET /api/v1/analytics/recurring-payments` → 200
  - `GET /api/v1/analytics/spending-anomalies` → 200
  - `GET /api/v1/upload/logs` → 200

### 검증

- 통과
  - `cd backend && uv run pytest tests/services/test_upload_service.py::test_import_transactions_reconciles_window_and_keeps_history_outside_latest_range tests/services/test_upload_service.py::test_import_transactions_reconciles_across_real_workbook_chain tests/api/test_assets_api.py::test_asset_endpoints_return_multi_snapshot_history_and_latest_defaults tests/services/test_upload_service.py::test_import_transactions_does_not_append_duplicate_when_later_window_only_changes_time_or_category tests/services/test_source_verification.py -q` → `7 passed`
  - `cd backend && uv run pytest -q` → `65 passed`

### 남은 과제

- `verify_import_parity` 를 sampled row presence checker로만 유지할지, overlap window extra stale row 검증까지 확장할지 결정
- `upload_logs` retained contract와 reset semantics를 문서/UI copy에 반영

## Snapshot Comparison Fallback

- 사용자 질문
  - 월별 비교 기능에서 현재월 snapshot이 아직 월말이 아니거나, 아직 전월 snapshot만 있는 경우 빈 데이터가 되는 문제를 어떻게 처리하는 게 좋은지 의견 요청

### fintech-engineer 의견

- 현재 구현은 snapshot summary/history 모두 `latest snapshot` 기준으로만 읽고 있고, irregular comparison metadata는 없다
- 권장 기본 비교 모드:
  - `latest_available_vs_previous_available`
  - `last_closed_month_vs_previous_closed_month`
- 권장 기본 정책:
  - 기본 화면은 항상 `latest_available_vs_previous_available`
  - month-end pair가 있을 때만 `last_closed_month_vs_previous_closed_month` 를 추가로 제공
  - 현재월 snapshot이 아직 월말이 아니면 `부분 기간` / `마감월 아님` 라벨을 붙여 latest comparison만 보여준다
  - 현재월 snapshot이 아예 없으면 현재월 비교를 억지로 만들지 않고, 마지막 마감월 기준 비교만 보여준다
- comparison metadata 권장:
  - `comparison_mode`
  - `current_snapshot_date`
  - `baseline_snapshot_date`
  - `comparison_days`
  - `is_partial`
  - `is_stale`
  - `can_compare`
  - `comparison_label`
- irregular snapshot에서도 안전한 지표:
  - 순자산 증감액
  - 총자산/총부채 증감액
  - 투자 평가액 / 대출 잔액 변화
  - 자산 구성비 변화
- 주의할 지표:
  - MoM 퍼센트
  - 월간 수익률처럼 읽히는 값
  - 기간이 다른 snapshot pair를 같은 `전월 대비`로 라벨링하는 것

### 이번 턴 결론

- “빈 데이터 방지”를 위해 전월 snapshot을 현재월 데이터처럼 조용히 fallback 하는 방식은 채택하지 않는다
- 이후 snapshot compare를 구현할 때는:
  - 기본값 `latest_available_vs_previous_available`
  - 보조 모드 `last_closed_month_vs_previous_closed_month`
  - irregular gap에서는 `comparison_days` 와 partial/stale 라벨 필수

### 문서 반영

- `docs/superpowers/plans/2026-03-31-advisor-analytics-expansion.md`
  - `snapshot-compare` 기본 모드를 `latest_vs_previous_available` 중심으로 재정리
  - closed-month 비교 모드, partial/stale labeling, safe vs risky metrics, `can_compare=false` edge case를 계획에 명시
  - 구현 직전 체크리스트 추가:
    - 영향 화면
    - fallback 규칙
    - required metadata
    - backend/frontend test matrix
    - acceptance criteria
- `docs/STATUS.md`
  - snapshot comparison fallback 정책 정리 완료로 상태 반영

### 후속 판단

- 사용자 피드백 기준으로 이 항목은 `신규 기능`보다 `기존 기능 안정화`로 분류
- 이유:
  - 이미 존재하는 월별/비교형 자산 surface가 snapshot cadence 차이 때문에 빈 값 또는 오해 소지가 있는 라벨을 만들 수 있음
  - 따라서 우선순위는 새 analytics endpoint 추가보다, 현재 비교형 화면/응답의 fallback 규칙과 labeling 안정화에 둠

## Irregular Snapshot Comparison Guidance

- 사용자 질문
  - 스냅샷 업로드 날짜가 월말이 아니거나, 현재월 스냅샷이 비어 있고 전월 스냅샷만 있을 때 월별 비교 기능을 어떻게 처리하는 게 좋은지 검토 요청

### 현재 구현 확인

- backend는 `assets` 계열 응답에서 `snapshot_date` 와 raw totals만 제공하고 비교 메타데이터는 없다
- frontend `AssetsPage` 는 latest snapshot 기준 카드/차트만 명시적으로 보여주며, irregular snapshot 비교에 대한 별도 fallback contract는 없다

### 설계 방향 메모

- 비교 모드는 하나로 강제하지 않고 분리하는 쪽이 안전:
  - `latest_available_vs_previous_available`
  - `last_closed_month_vs_previous_closed_month`
  - `selected_snapshot_vs_previous_available`
- partial 상태는 숨기지 말고 표시:
  - `partial`, `month-to-date`, `stale`, `no-comparable-baseline`
  - `comparison_days`, `current_snapshot_date`, `baseline_snapshot_date` 를 함께 노출
- fallback 원칙:
  - 현재월 월말 snapshot이 없지만 현재월 snapshot이 있으면 `latest available` 로 비교하되 `부분 기간`으로 명시
  - 현재월 snapshot 자체가 없으면 `전월 말`을 현재월 데이터처럼 가장하지 말고, `마지막 마감월 기준` 또는 `비교 불가`로 명시
- irregular snapshot에서도 안전한 지표:
  - 순자산/자산/부채 absolute delta
  - 포트폴리오 구성비, 대출 잔액 변화
  - 단순 as-of 상태 비교
- 추가 메타데이터 없이 위험한 지표:
  - 진짜 `전월 성과`처럼 읽히는 수익률/월간 변화율
  - 기간 길이가 다른 두 snapshot을 같은 month-over-month로 표시하는 퍼센트 지표

### 후속

- 이 내용은 아직 구현 결정이 아니라 design guidance 단계
- 다음 안정화 묶음에서 irregular snapshot comparison contract를 별도 정리 예정

## Backend Priority Check

- 사용자 요청
  - backend부터 다시 진행할 때 무엇부터 구현해야 하는지 우선순위 점검 요청

### 확인한 내용

- `docs/STATUS.md`
  - 현재 backend 안정화 잔여 항목은 `upload_logs` semantics, snapshot comparison fallback, 운영 문서/live contract 정렬
- `docs/backend-api-ssot.md`
  - 현재 live assets 계열 endpoint는 snapshot totals/history만 제공하고 comparison metadata contract는 없다
- `backend/app/api/v1/endpoints/assets.py`
  - 비교형 endpoint가 아직 없고 latest/history summary만 노출 중
- `backend/tests/api/test_data_management_api.py`
  - reset 이후 `upload_logs_retained=True` contract는 이미 테스트로 고정되어 있음

### 이번 턴 결론

- backend 첫 구현은 `upload_logs` semantics 정리보다 `irregular snapshot comparison contract` 가 우선이다
- 이유:
  - `upload_logs` retained 동작은 이미 코드와 테스트에서 고정돼 있고 남은 일은 문서/UI copy 정렬 비중이 크다
  - 반대로 snapshot comparison은 설계 가이드만 있고 live API/schema/test contract가 아직 없다
  - 자산 surface를 안정적으로 확장하려면 `comparison_mode`, `comparison_days`, `is_partial`, `is_stale`, `comparison_label`, `can_compare` 같은 메타데이터를 먼저 backend에서 고정해야 한다

### 다음 구현 제안

- 1단계
  - `backend/app/schemas/asset.py` 에 snapshot comparison response schema 추가
- 2단계
  - `backend/app/services/assets_service.py` 에 `latest_available_vs_previous_available` 기본 비교 계산 추가
- 3단계
  - `backend/app/api/v1/endpoints/assets.py` 에 비교 endpoint 추가
- 4단계
  - `backend/tests/services/test_assets_service.py`, `backend/tests/api/test_assets_api.py` 에 irregular/month-end/partial/stale 케이스 고정
- 5단계
  - 이후 `docs/backend-api-ssot.md`, `docs/STATUS.md`, frontend 소비 계약 정렬

## Snapshot Compare Implementation

- 구현 범위
  - `backend/app/schemas/asset.py`
    - `SnapshotComparisonMode`
    - `AssetSnapshotComparisonResponse`
    - `AssetSnapshotComparisonDeltaResponse`
  - `backend/app/services/assets_service.py`
    - snapshot totals loader 공용화
    - `get_asset_snapshot_comparison()`
    - latest / closed-month / selected pair 비교 규칙
    - `comparison_label`, `is_partial`, `is_stale`, `can_compare` 계산
  - `backend/app/api/v1/endpoints/assets.py`
    - `GET /api/v1/assets/snapshot-compare`
    - selected pair mode의 required query validation (`422`)
  - `backend/tests/services/test_assets_service.py`
    - latest available pair
    - closed month pair
    - stale labeling
    - baseline missing fallback
    - selected exact pair
  - `backend/tests/api/test_assets_api.py`
    - default compare contract
    - closed month mode
    - exact pair validation

### 구현 결정

- live endpoint는 `analytics` 가 아니라 `assets` namespace에 둠
  - 이유:
    - 현재 snapshot summary/history endpoint와 같은 도메인 surface에 붙는 편이 live contract 추적이 단순함
    - planning 문서의 `analytics/snapshot-compare` 는 historical reference로 남기고, SSOT는 코드 기준으로 정리
- 1차 mode는 세 가지만 열어 둠
  - `latest_available_vs_previous_available`
  - `last_closed_month_vs_previous_closed_month`
  - `selected_snapshot_vs_baseline_snapshot`
- stale threshold는 35일로 고정
  - 코드/문서에 명시적으로 남기고 암묵적 UI 판단에 맡기지 않음

### 검증

- `cd backend && uv run pytest tests/services/test_assets_service.py -q`
  - 결과: `5 passed`
- `cd backend && uv run pytest tests/api/test_assets_api.py -q -k snapshot_compare`
  - 결과: `3 passed`

### 남은 후속

- real workbook 4종 적재 상태에서 compare smoke 추가
- frontend assets surface가 새 metadata를 어떻게 소비할지 정리
- `upload_logs` retained semantics 정리로 안정화 배치 계속 진행

## Frontend Hookup And Semantics Alignment

- 구현 범위
  - `frontend/src/types/asset.ts`
    - snapshot compare response 타입 추가
  - `frontend/src/api/assets.ts`
    - `snapshotCompare()` API 추가
  - `frontend/src/hooks/useAssets.ts`
    - `useAssetSnapshotCompare()` query 추가
  - `frontend/src/pages/AssetsPage.tsx`
    - 기존 KPI 카드 subtext에 delta / pct 표시
    - topbar meta badge와 투자/대출 section badge에 `comparison_label + comparison_days` 표시
    - 새 route/page 없이 기존 자산 화면만 확장
  - `frontend/src/pages/WorkbenchPage.tsx`
    - reset 이후에도 upload history가 retained 된다는 문구 명시
  - `frontend/src/test/pages/AssetsPage.test.tsx`
    - compare metadata 렌더링 테스트 추가
  - `docs/backend-api-ssot.md`
    - reset / upload history semantics 명시
  - `backend/tests/api/test_assets_api.py`
    - real workbook chain 기준 compare smoke 추가

### 구현 결정

- frontend는 새 화면을 만들지 않고 기존 `AssetsPage` 에 compare contract를 붙였다
- comparison metadata는 새 대시보드 section보다:
  - topbar meta badge
  - KPI subtext
  - 투자/대출 summary badge
  에 흡수하는 편이 현재 IA와 더 맞는다
- reset semantics는 backend contract를 바꾸지 않고 UI copy를 맞췄다
  - reset은 current state를 비우지만 `upload_logs` history는 남는다는 뜻을 작업대 Danger Zone에서 직접 명시

### 검증

- `cd backend && uv run pytest tests/api/test_assets_api.py -q -k "snapshot_compare"`
  - 결과: `4 passed`
- `cd frontend && npm test -- --runInBand src/test/pages/AssetsPage.test.tsx`
  - 결과: `1 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과
