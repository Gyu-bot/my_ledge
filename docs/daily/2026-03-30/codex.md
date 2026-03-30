# 2026-03-30 Codex Log

## Summary
- `AGENTS.md`, 루트 `STATUS.md`, `README.md`, 최근 커밋을 재확인했다.
- 현재 최우선 작업이 Phase 3 실제 연동 작업임을 다시 정리했다.
- 상위 지침 호환을 위해 `docs/STATUS.md`를 생성했다.

## Current Priority
1. OpenClaw skill 패키징/배포
2. OpenClaw -> `schema` API / readonly DB / `upload` API end-to-end 검증
3. 데이터 관리 초기화 기능
4. 거래 편집 고급 UX
5. Phase 2 polish

## Notes
- 루트 `STATUS.md`와 `docs/STATUS.md`를 함께 유지한다.
- 현재 blocker는 없고, 남은 일은 구현 우선순위 정리와 외부 연동 검증 성격이 강하다.

## Handoff Package
- OpenClaw에 넘길 최소 env: `MY_LEDGE_API_BASE_URL`, `MY_LEDGE_API_KEY`, `MY_LEDGE_DB_HOST`, `MY_LEDGE_DB_PORT`, `MY_LEDGE_DB_NAME`, `MY_LEDGE_DB_USER`, `MY_LEDGE_DB_PASSWORD`
- 함께 넘길 문서: `docs/openclaw/integration-guide.md`, `docs/openclaw/skill-handoff.md`, `README.md`
- 최소 검증 시나리오: `schema` 조회 -> readonly DB canonical view 조회 -> summary API 조회 -> upload -> upload_logs -> transaction patch/delete/restore

## Data Management Plan
- reset 기능과 bulk edit 기능을 분리해 구현하는 계획을 수립했다.
- reset 기능은 새 API/service/UI danger zone 추가로 처리하고, bulk edit은 기존 `bulk-update` 확장과 선택 UX 추가로 진행한다.
- 설명 일괄 수정은 현재 스키마에 사용자 override 컬럼이 없어 Alembic, canonical view, rolling import 보존 규칙까지 포함하는 별도 단계로 분리하는 것이 적절하다고 정리했다.
- 루트 `STATUS.md`의 데이터 관리 TODO를 `Track A reset`, `Track B bulk edit v1`, `Track C bulk edit v2` 작업 단위로 세분화했다.

## Reset Implementation
- backend에 `POST /api/v1/data/reset` endpoint, request/response schema, reset service를 추가했다.
- reset scope는 `transactions_only`, `transactions_and_snapshots` 두 가지로 구현했고, `upload_logs`는 유지하도록 고정했다.
- frontend 데이터 관리 화면에 Danger Zone 카드를 추가해 scope 선택, 확인 문구 입력, reset 실행을 연결했다.
- reset 후 `data-management`, `dashboard`, `assets`, `spending-*` query를 invalidate 하도록 훅을 확장했다.
- backend API test, frontend hook/page test 코드를 추가했다.
- 검증 제약:
  - `greenlet` 의존성을 backend에 추가했고 frontend `npm install`을 수행했다
  - frontend `npm test`, `npm run lint`, `npm run typecheck` 는 통과했다
  - backend `uv run pytest tests/api/test_data_management_api.py` 는 통과했다
  - 전체 backend `pytest` 는 저장소에 없는 workbook fixture(`tmp/finance_sample.xlsx`, `tmp/sample_260324.xlsx`) 때문에 여전히 실패한다

## OpenClaw Contract Fix
- OpenClaw 연동 테스트에서 `vw_transactions_effective` 문서/구현 불일치가 발견돼 root cause를 확인했다.
- 기존 상태는 문서상 canonical view가 삭제/병합 제외를 보장한다고 설명했지만, 실제 helper와 PostgreSQL view는 raw `transactions`를 그대로 노출하고 있었다.
- 수정 내용:
  - `build_transactions_effective_select()` 기본 계약을 삭제/병합 제외로 변경했다.
  - `/api/v1/transactions` 는 `include_deleted`, `include_merged` 플래그를 builder에 직접 전달해 opt-in 포함 조회를 유지하도록 정리했다.
  - Alembic migration `20260330_0004_filter_transactions_effective_view.py` 를 추가해 실제 DB view도 같은 계약으로 맞췄다.
  - `docs/openclaw/integration-guide.md`, `docs/openclaw/skill-handoff.md`, schema API 테스트 설명을 갱신했다.
- 검증:
  - `uv run ruff check app tests alembic` 통과
  - `uv run pytest tests/services/test_transactions_service.py tests/api/test_transactions_api.py tests/api/test_schema_api.py tests/api/test_data_management_api.py` 통과 (`13 passed`)

## Compose Note
- 이번 `vw_transactions_effective` 수정은 backend Alembic migration에 들어가 있으므로 운영/로컬 compose 환경에서는 루트에서 `docker compose up -d --build` 만 실행하면 된다.
- 이유는 `docker-compose.yml` 의 `migrate` one-shot 서비스가 `uv run alembic upgrade head` 를 먼저 수행하고, backend가 그 성공 이후에만 올라오도록 연결돼 있기 때문이다.
- 단, `docker-entrypoint-initdb.d` 기반 readonly role bootstrap 같은 초기화 스크립트는 기존 `pgdata` 볼륨에서 재빌드만으로 다시 실행되지 않는다.
