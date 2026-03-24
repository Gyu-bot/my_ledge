# STATUS.md

## Current State
- **Phase:** Phase 1 — 기반 구축 (MVP)
- **Last Worker:** codex (2026-03-25T00:32+0900, rolling-window import를 append-only exact dedupe로 재조정)
- **Branch:** feat/rolling-window-import-sync

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

## In Progress
- [ ] Phase 1 MVP 진행 중
  - 계획 문서: `docs/superpowers/plans/2026-03-23-phase1-mvp-foundation.md`
  - 마지막 완료 작업: `rolling-window transaction import 정책 재조정`
  - 현재 상태: `backend/app/services/upload_service.py` 는 workbook datetime window를 비교 범위로만 사용하고, 해당 범위 안 기존 `source='import'` 거래는 건드리지 않은 채 exact signature 중복만 skip하고 새 거래만 append한다. `finance_sample.xlsx -> sample_260324.xlsx` 순서 검증에서 두 번째 import는 `tx_new=100`, `tx_skipped=2126`, 최종 transaction row는 `2319`행이며, 시간만 달라진 논리적 동일 거래에서도 기존 사용자 수정 row는 유지된다. `backend/tests/services/test_upload_service.py` 와 `backend/tests/services/test_source_verification.py` focused tests 통과

## Blocked
- 없음

## Next Up
- [ ] Task 8 실행: 검증 + STATUS 갱신
  - 목표: 실제 최신 workbook 기준 end-to-end 검증과 PostgreSQL parity 확인
  - 우선 파일: `.env`, 실제 workbook 경로, `backend/scripts/verify_import_parity.py`
  - 성공 기준: 최신 workbook 단독 import parity 통과와, rolling-window 연속 업로드 시 기존 imported row 보존 + exact-new append 정책에 맞는 `tx_new/tx_skipped/final row count` 확인
- [ ] Task 9 후보: canonical analysis layer 1차 구현
  - 목표: `vw_transactions_effective`, `vw_category_monthly_spend` 추가와 `/api/v1/schema` 문서 반영
  - 우선 파일: `backend/alembic/versions/`, `backend/app/services/schema_service.py`, `backend/tests/api/test_schema_api.py`
  - 성공 기준: 두 canonical view가 마이그레이션과 schema 문서에 반영되고 focused schema/API 테스트 통과

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

## Known Issues
- openpyxl read_only 모드에서 `ws.max_row`가 None 반환될 수 있음 — iter_rows 순회 필수
- 현재 제공된 샘플 `./tmp/finance_sample.xlsx` 와 `./tmp/sample_260324.xlsx` 는 비암호화 파일이다. 복호화 코드는 fallback으로 유지하지만 현재 운영 검증 전제는 비암호화 workbook이다
- worktree에는 ignored `tmp/` 디렉터리가 자동 체크아웃되지 않으므로 parser 테스트는 루트 저장소의 `tmp/finance_sample.xlsx` 를 탐색해 사용
- PostgreSQL smoke test는 `DB_PASSWORD=my_ledge_dev` / `DATABASE_URL=postgresql+asyncpg://my_ledge:my_ledge_dev@127.0.0.1:5432/my_ledge` 기준으로 검증했다. 실제 개발 환경에서는 `.env` 복사 후 비밀번호를 로컬 값으로 맞춰야 한다
- 로컬 5432 포트를 이미 다른 PostgreSQL이 사용 중이면 `docker compose up -d db` 가 포트 충돌로 실패할 수 있다
- `docker compose up -d db` 직후에는 Postgres healthcheck가 아직 `starting` 일 수 있어, 이때 바로 `uv run alembic upgrade head` 를 치면 연결 reset/거부가 날 수 있다. `docker compose ps` 또는 health 상태 확인 후 migration/smoke test를 실행하는 게 안전하다
- frontend 개발 의존성 기준 `npm audit` 에서 moderate 취약점 5건이 보고된다. 현재 Task 7 범위에서는 빌드/런타임을 우선했고 의존성 업그레이드는 후속 정리 과제로 남겨둔다
- `backend/tests/api/test_assets_api.py` 는 `seeded_finance_data` fixture가 `snapshot_date=None` 으로 적재될 때 서버 현재 날짜를 사용한다는 사실을 반영하지 않아, 날짜가 `2026-03-24`로 고정된 기대값이 하루 지나면 실패한다. 현재 날짜 `2026-03-25` 기준 실제 응답은 `2026-03-25`를 반환한다
