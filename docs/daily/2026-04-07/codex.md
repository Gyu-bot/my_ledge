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
