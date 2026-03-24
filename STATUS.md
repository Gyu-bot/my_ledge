# STATUS.md

## Current State
- **Phase:** Phase 1 — 기반 구축 (MVP)
- **Last Worker:** codex (2026-03-24T15:25+0900, Task 4A.1 PostgreSQL smoke test 재검증)
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

## In Progress
- [ ] Phase 1 MVP 진행 중
  - 계획 문서: `docs/superpowers/plans/2026-03-24-transaction-import-first.md`
  - 마지막 완료 작업: Task 4A.1 `PostgreSQL smoke test`
  - 현재 상태: `docker-compose.yml`, `.env.example`, `backend/scripts/smoke_import_transactions.py` 추가. `docker compose up -d db` + `uv run alembic upgrade head` + sample workbook 1회 적재/재적재까지 PostgreSQL에서 검증 완료

## Blocked
- 없음

## Next Up
- [ ] Task 4B 실행: snapshot 적재 + `partial` 정책 확장
  - 목표: transaction-only import를 snapshot/investments/loans 적재까지 확장하고 `partial` 상태를 실제로 기록
  - 우선 파일: `backend/app/services/upload_service.py`, `backend/app/parsers/snapshots.py`, 관련 모델 upsert 로직, `backend/tests/services/test_upload_service.py`
  - 성공 기준: transaction/snapshot 한쪽 실패 시 `upload_logs.status` 가 `partial` 또는 `failed` 로 정확히 기록되고, 성공분 유지 정책이 테스트로 검증됨
- [ ] Task 5 실행: upload/schema/assets API
- [ ] Task 6 실행: 거래 조회/편집 API (`merge`는 501 stub)
- [ ] Task 7 실행: frontend 최소 스캐폴딩 + Docker Compose
- [ ] Task 8 실행: 검증 + STATUS 갱신

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

## Known Issues
- 엑셀 암호 미제공 상태 — `.env`에 `EXCEL_PASSWORD` 설정 필요
- openpyxl read_only 모드에서 `ws.max_row`가 None 반환될 수 있음 — iter_rows 순회 필수
- 현재 제공된 샘플 `./tmp/finance_sample.xlsx` 는 비암호화 파일이며, 실제 암호화 BankSalad 샘플 검증은 별도 필요
- worktree에는 ignored `tmp/` 디렉터리가 자동 체크아웃되지 않으므로 parser 테스트는 루트 저장소의 `tmp/finance_sample.xlsx` 를 탐색해 사용
- PostgreSQL smoke test는 `DB_PASSWORD=my_ledge_dev` / `DATABASE_URL=postgresql+asyncpg://my_ledge:my_ledge_dev@127.0.0.1:5432/my_ledge` 기준으로 검증했다. 실제 개발 환경에서는 `.env` 복사 후 비밀번호를 로컬 값으로 맞춰야 한다
- 로컬 5432 포트를 이미 다른 PostgreSQL이 사용 중이면 `docker compose up -d db` 가 포트 충돌로 실패할 수 있다
- `docker compose up -d db` 직후에는 Postgres healthcheck가 아직 `starting` 일 수 있어, 이때 바로 `uv run alembic upgrade head` 를 치면 연결 reset/거부가 날 수 있다. `docker compose ps` 또는 health 상태 확인 후 migration/smoke test를 실행하는 게 안전하다
