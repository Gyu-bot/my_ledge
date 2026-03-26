# STATUS.md

## Current State
- **Phase:** Phase 2 — 핵심 화면 구현
- **Last Worker:** codex (2026-03-26T18:04+0900, Phase 2 Task 3-5 핵심 화면 구현 완료)
- **Branch:** main

## Completed
- [x] PRD 작성 (`PRD.md`)
- [x] AGENTS.md 작성
- [x] STATUS.md 초기화
- [x] 구현 전 요구사항 공백 점검 및 의사결정 반영
- [x] Phase 1 구현계획 문서 작성 (`docs/superpowers/plans/2026-03-23-phase1-mvp-foundation.md`)
- [x] Task 1 완료: backend 스캐폴딩 + `/api/v1/health` + 설정/보안 뼈대
- [x] Task 2 완료: SQLAlchemy 모델 + Alembic 초기 마이그레이션 추가
- [x] Task 3 완료: 엑셀 복호화 헬퍼 + 거래/스냅샷 파서 + 샘플 기반 parser 테스트
- [x] Task 4A 완료: transaction-only 업로드 서비스 + incremental import + upload_logs 기록
- [x] Task 4A.1 완료: Docker Compose 기반 PostgreSQL 기동 + migration/import smoke test
- [x] Task 4B 완료: snapshot 적재 + `partial`/`failed` 업로드 정책 구현
- [x] Task 5 완료: upload/schema/assets API + 인증/응답 스키마 구현
- [x] Task 6 완료: 거래 조회/편집 API 구현 (`merge`는 501 stub)
- [x] Task 8 일부 완료: 샘플 workbook 원본 대조 검증 자동화
- [x] Task 7 완료: frontend 최소 스캐폴딩 + Docker runtime
- [x] Task 8 완료: 최신 workbook `fs_260326.xlsx` 기준 PostgreSQL parity + `finance_sample.xlsx -> sample_260324.xlsx -> fs_260326.xlsx` rolling-window 연속 업로드 검증
- [x] Task 9 완료: canonical view(`vw_transactions_effective`, `vw_category_monthly_spend`) 추가 + `/api/v1/schema` raw/view 병행 문서화 + 거래 read path canonical shared query 정렬
- [x] Phase 1 마감 정리: `seeded_finance_data` fixture 날짜 고정 + backend 전체 테스트 sweep 통과 (`31 passed`)
- [x] Phase 2 착수 준비: dashboard core 설계/계획 문서 작성 + UI baseline 확정
- [x] Phase 2 Task 1 완료: frontend app shell + data foundation
- [x] Phase 2 Task 2 완료: 메인 대시보드 구현
- [x] Phase 2 Task 3 완료: 자산 현황 페이지 구현
- [x] Phase 2 Task 4 완료: 지출 분석 페이지 구현
- [x] Phase 2 Task 5 완료: 데이터 관리 페이지 구현

## In Progress
- [ ] Phase 2 frontend 마감 정리 진행 중
  - 계획 문서: `docs/superpowers/plans/2026-03-26-phase2-dashboard-core.md`
  - 마지막 완료 작업: `Phase 2 Task 3-5: 자산/지출/데이터 관리 화면 구현`
  - 현재 상태: `/assets`, `/spending`, `/data` route가 모두 실제 화면으로 대체되었다. `assets`는 빈 스냅샷일 때 empty-state를 표시하고, `spending`은 지출 거래만 기준으로 결제수단 차트를 다시 그룹핑하며 월별 카테고리 stacked area chart를 추가했다. `data`는 업로드 카드와 거래 편집 작업대를 연결했고, 쓰기 API용 `VITE_API_KEY`가 없으면 read-only 경고를 표시한다. Playwright headless 캡처와 이미지 직접 검토까지 완료했으며, 현재 다음 작업은 `Phase 2 Task 6: 프론트 통합 polish / write flow 실검증`이다

## Blocked
- 없음

## Next Up
- [ ] Phase 2 Task 6: 프론트 통합 polish / write flow 실검증
  - 목표: 데이터 관리 화면의 업로드/수정/삭제/복원 write flow를 실제 API 키 환경에서 수동 검증하고, 화면 polish와 chunk 분할 등 마감 정리를 수행
  - 우선 파일: `frontend/src/pages/DataPage.tsx`, `frontend/src/hooks/useDataManagement.ts`, `frontend/src/app/router.tsx`, 필요 시 backend upload log 조회 endpoint
  - 성공 기준: write flow 실검증 기록이 남고, 남은 Phase 2 polish 항목과 성능/번들 경고 대응 방향이 정리됨

## Key Decisions
- 2026-03-23: my_ledge v1을 리셋/확장하는 방향으로 결정 (완전 새 프로젝트 X)
- 2026-03-23: 중복 처리는 복합 유니크 대신 시간 커서 기반 증분 적재 방식 채택
- 2026-03-23: OpenClaw 연동은 하이브리드 (DB readonly + 업로드 API)
- 2026-03-23: 소분류 자동 분류는 다음 버전으로 미룸, 이번 버전은 수동 편집만
- 2026-03-23: 뱅샐현황은 스냅샷 시계열 누적 (덮어쓰기 X)
- 2026-03-23: 이체 타입은 수입/지출 분석에서 제외, 별도 '자산이동' tracking
- 2026-03-23: `snapshot_date`는 API 입력값 우선, 없으면 서버 업로드 날짜 사용
- 2026-03-23: 업로드는 부분 성공(`partial`) 허용, 성공분은 유지하고 실패 정보는 `upload_logs`에 기록
- 2026-03-23: 카테고리/결제수단 선택지는 `transactions` distinct 값 기반으로 조회
- 2026-03-23: 조회 API는 `is_edited`, `include_deleted`, `include_merged`, `search` 필터 포함
- 2026-03-23: 비공개/쓰기성 API는 `X-API-Key` 인증 방식 사용
- 2026-03-23: 원본 업로드 파일은 최근 5개만 보관
- 2026-03-23: 거래 병합 기능은 MVP 범위에서 제외
- 2026-03-24: PRD 부록은 실데이터 원문 대신 익명화된 분포/규모 예시만 유지
- 2026-03-24: AGENTS.md의 도메인 지식 예시는 실명 금융사/정확 금액 대신 일반화된 설명만 유지
- 2026-03-24: 비암호화 개발 샘플 경로는 시스템 `/tmp` 가 아니라 저장소 내부 `./tmp/finance_sample.xlsx` 로 고정해 다음 세션 혼선을 방지
- 2026-03-24: AGENTS.md에 Codex의 무확인 서브에이전트 스폰 허용 조건과 금지 조건을 명시해 매 세션 해석 차이를 줄임
- 2026-03-24: Task 4는 한 번에 끝내지 않고 `transaction-only import` 를 4A로 먼저 완료한 뒤 snapshot 적재를 4B로 분리
- 2026-03-24: transaction import 검증은 먼저 sqlite async DB로 고정해 서비스 로직을 안정화하고, PostgreSQL smoke test는 `.env`/실DB 준비 후 별도로 수행
- 2026-03-24: 로컬 migration/smoke script는 컨테이너 내부가 아니라 호스트에서 실행하므로 `.env.example` 의 `DATABASE_URL` 기본값은 `db` 가 아니라 `127.0.0.1:5432` 기준으로 둔다
- 2026-03-24: snapshot 샘플에는 스키마 unique 키와 충돌하는 중복 `product_name` 이 있어, 적재 시 같은 key 반복분은 결정론적 suffix (`(2)`, `(3)`) 를 붙여 보존한다
- 2026-03-24: assets/investments/loans API의 금액 응답은 DB `NUMERIC(15,2)` 저장 정밀도를 그대로 따라 소수 둘째 자리 문자열로 직렬화한다
- 2026-03-24: 거래 summary/by-category/payment-methods 집계는 MVP 단계에서 SQLite/PostgreSQL 일관성을 우선해 필터된 transaction row를 Python에서 그룹핑하는 방식으로 구현한다
- 2026-03-24: 원본 대조 검증은 transaction 전건 비교 대신 전체 행 수 + seed 고정 랜덤 샘플 비교로 수행하고, snapshot/investment/loan은 전건 비교로 수행한다
- 2026-03-24: Task 7 compose는 호스트 실행용 `.env.example` 의 `127.0.0.1:5432` `DATABASE_URL` 을 유지하고, 컨테이너 내부 `backend` 서비스에는 compose에서 `db:5432` 기준 값을 별도 주입한다
- 2026-03-24: 실제 BankSalad 소스는 현재 비암호화 workbook 기준으로 검증되었고, 기존 복호화 코드는 호환용 fallback으로만 유지한다
- 2026-03-24: `sample_260324.xlsx` 검증 결과 최신 export는 strict cumulative snapshot이 아니라 rolling window + 일부 중간 구간 변경이 섞일 수 있어, 단순 max(date,time) 커서 방식만으로는 최종 상태 동기화를 보장하지 못한다
- 2026-03-24: rolling-window transaction import는 workbook의 `[min(datetime), max(datetime)]` 범위 안 `source='import'` 행을 최신 workbook 상태로 재동기화하고, manual row는 유지하며 logically matching row의 사용자 수정 필드(`category_*_user`, `memo`, `is_deleted`, `merged_into_id`)를 이월한다
- 2026-03-25: 거래 사용자 수정 보존을 최신 export와의 완전 동기화보다 우선한다. rolling-window 재업로드 시 겹치는 기존 imported row는 수정/삭제하지 않고 유지하며, workbook datetime window 안에서 exact signature로 아직 없는 거래만 append한다
- 2026-03-25: Task 9 canonical analysis layer 1차 범위는 view 생성과 문서화에 그치지 않고, 기존 거래 조회/분석 런타임이 `vw_transactions_effective` / `vw_category_monthly_spend` 또는 그와 정의상 동일한 shared read path를 실제로 사용하도록 맞추는 것까지 포함한다
- 2026-03-26: Task 8 운영 검증은 메인 개발 데이터셋을 건드리지 않도록 임시 PostgreSQL DB `my_ledge_task8_verify` 에 마이그레이션 후 수행한다
- 2026-03-26: `/api/v1/schema` 는 AI 에이전트 기본 조회 경로로 canonical view를 먼저 노출하되, 원본 정합성 점검을 위해 raw table 문서도 함께 유지한다
- 2026-03-26: 테스트 fixture에서 `snapshot_date=None` 을 쓰면 실행일에 따라 assets API 기대값이 흔들리므로, 공통 seed fixture는 고정 날짜를 명시한다
- 2026-03-26: Phase 2 frontend 구현 순서는 `dashboard -> assets -> spending -> data` 로 고정하고, UI 디자인 작업마다 `ui-ux-pro-max` 를 기본 스킬로 사용한다
- 2026-03-26: 메인 대시보드의 `카테고리 비중` 카드는 항상 펼쳐진 제어 패널 대신 compact filter 패턴을 사용하고, 월 단위 범위 선택만 허용한다
- 2026-03-26: 데이터 관리 화면의 write API는 `X-API-Key`가 필요하므로 프론트는 선택적 `VITE_API_KEY` 헤더 지원을 넣고, 키가 없으면 read-only 경고를 먼저 노출한다
- 2026-03-26: 지출 분석의 `결제수단별 지출`은 백엔드 endpoint가 아직 `type=지출` 필터를 지원하지 않아, 프론트에서 필터된 지출 거래 rows를 다시 그룹핑해 의미를 맞춘다
- 2026-03-26: 지출 분석의 월별 카테고리 시계열은 `vw_category_monthly_spend` 계열 read path를 노출하는 `/transactions/by-category/timeline` endpoint로 내리고, 프론트에서는 상위 카테고리만 stacked area로 보여주고 나머지는 `기타`로 묶는다
- 2026-03-26: 외부 리뷰용 dev server에서 direct API base URL을 쓸 수 있도록 backend 앱에 `CORS_ORIGINS` 기반 CORSMiddleware를 실제 적용한다

## Known Issues
- openpyxl read_only 모드에서 `ws.max_row`가 None 반환될 수 있음 — iter_rows 순회 필수
- 현재 제공된 샘플 `./tmp/finance_sample.xlsx` 와 `./tmp/sample_260324.xlsx` 는 비암호화 파일이다. 복호화 코드는 fallback으로 유지하지만 현재 운영 검증 전제는 비암호화 workbook이다
- worktree에는 ignored `tmp/` 디렉터리가 자동 체크아웃되지 않으므로 parser 테스트는 루트 저장소의 `tmp/finance_sample.xlsx` 를 탐색해 사용
- PostgreSQL smoke test는 `DB_PASSWORD=my_ledge_dev` / `DATABASE_URL=postgresql+asyncpg://my_ledge:my_ledge_dev@127.0.0.1:5432/my_ledge` 기준으로 검증했다. 실제 개발 환경에서는 `.env` 복사 후 비밀번호를 로컬 값으로 맞춰야 한다
- 로컬 5432 포트를 이미 다른 PostgreSQL이 사용 중이면 `docker compose up -d db` 가 포트 충돌로 실패할 수 있다
- `docker compose up -d db` 직후에는 Postgres healthcheck가 아직 `starting` 일 수 있어, 이때 바로 `uv run alembic upgrade head` 를 치면 연결 reset/거부가 날 수 있다. `docker compose ps` 또는 health 상태 확인 후 migration/smoke test를 실행하는 게 안전하다
- frontend 개발 의존성 기준 `npm audit` 에서 moderate 취약점 5건이 보고된다. 현재 Task 7 범위에서는 빌드/런타임을 우선했고 의존성 업그레이드는 후속 정리 과제로 남겨둔다
- 메인 대시보드의 `월별 지출 추이` 와 `카테고리 비중` 카드 높이는 현재 실사용 가능 수준까지 맞췄지만, 픽셀 단위 완전 정렬은 후속 polish 항목으로 남겨둔다
- Vitest + Recharts 조합에서 `ResponsiveContainer` 가 jsdom 크기를 계산하지 못해 width/height warning을 stderr에 출력한다. 브라우저 렌더링과 Playwright 캡처는 정상이다
- 데이터 관리 화면의 `최근 업로드 결과`는 현재 세션 내 마지막 업로드 결과만 보여준다. 서버 저장 `upload_logs` 조회 API는 아직 없어 과거 이력 타임라인은 후속 작업이다
