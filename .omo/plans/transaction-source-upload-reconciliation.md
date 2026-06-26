# transaction-source-upload-reconciliation - Work Plan

## TL;DR (For humans)

**What you'll get:** BankSalad 재업로드가 기존 사용자 수정값을 잃지 않도록 거래 source lifecycle을 만들고, 업로드 전에 변경 내용을 preview/apply로 확인하는 흐름을 만든다.

**Why this approach:** `T030`의 source lifecycle이 먼저 있어야 `T031`의 missing/replacement/source-changed 판단이 안정적이다. 그래서 backend lifecycle과 preview/apply contract를 같은 실행 계획에서 순서대로 묶는다.

**What it will NOT do:** frontend 전체 UX를 한 번에 완성하지 않는다. raw 거래를 hard delete하지 않는다. 사용자 카테고리, memo, 대출/할부 연결, spending review 상태를 재업로드로 덮어쓰지 않는다.

**Effort:** Large
**Risk:** High - 업로드/거래 보존 로직은 데이터 신뢰와 직결된다.
**Decisions to sanity-check:** 첫 PR은 backend contract 중심으로 끝내고 frontend preview 화면은 후속 PR로 분리할 수 있다.

Your next move: approve this plan for `$start-work`, or ask for a narrower split. Full execution detail follows below.

---

> TL;DR (machine): Implements roadmap T030-T031: transaction source lifecycle, no-write upload preview, explicit apply, tests, and contract docs.

## Scope
### Must have
- Roadmap items: `T030`, `T031`.
- Preserve imported/raw transaction evidence and all user-managed fields across re-import.
- Add lifecycle status for imported rows: `active`, `missing_from_latest_export`, `source_changed`, `superseded`, `duplicate_candidate`, `ambiguous` or equivalent.
- Add source lineage fields or tables for source hash, first/last import, first/last seen, supersession.
- Provide no-write upload preview and explicit apply flow.
- Keep `POST /api/v1/upload` compatibility documented.
- Add backend tests and contract docs.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not delete or reset existing transactions as part of reconciliation.
- Do not overwrite user fields from BankSalad source data.
- Do not mix settlement/refund netting from `T032` into this plan.
- Do not require frontend implementation in the first PR unless the backend contract is already stable.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after with backend pytest and focused service/API tests.
- Evidence: `.omo/evidence/task-<N>-transaction-source-upload-reconciliation.md`.
- Required commands:
  - `cd backend && UV_CACHE_DIR=.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db uv run pytest tests/services/test_upload_service.py tests/services/test_transactions_service.py tests/api/test_upload_api.py tests/api/test_transactions_api.py`
  - `cd backend && uv run ruff check .`
  - `git diff --check`

## Execution strategy
### Parallel execution waves
- Wave 1: DB/model/schema contract and source-hash matching service.
- Wave 2: upload preview/apply APIs and upload log/reconciliation log.
- Wave 3: docs, compatibility notes, regression coverage, final verification.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3 | docs discovery |
| 2 | 1 | 3 | 4 after API shape stabilizes |
| 3 | 1, 2 | 4 | none |
| 4 | 2, 3 | final | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Add transaction source lifecycle storage and source-hash matching.
  What to do / Must NOT do: Add Alembic migration plus SQLAlchemy/Pydantic support for transaction source lineage. Prefer a separate lineage table if the `transactions` table would become overloaded. Do not remove existing `source='import'|'manual'` compatibility.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:690`, `backend/app/models/transaction.py`, `backend/app/models/upload_log.py`, `backend/app/services/upload_service.py`, `backend/app/schemas/transaction.py`, `backend/tests/services/test_upload_service.py`, `backend/tests/services/test_transactions_service.py`.
  Acceptance criteria (agent-executable): pytest fixture proves a row missing from the latest export remains stored with missing lifecycle status and a changed source field does not erase user fields.
  QA scenarios (name the exact tool + invocation): happy: `cd backend && uv run pytest tests/services/test_upload_service.py -k source_lifecycle`, failure: fixture with changed BankSalad source field and user memo/category override preserved, Evidence `.omo/evidence/task-1-transaction-source-upload-reconciliation.md`.
  Commit: Y | `[backend] 거래 source lifecycle 추가 (codex)`

- [ ] 2. Add no-write upload preview service and API.
  What to do / Must NOT do: Split parse/compare from DB mutation. Preview must classify changes as `new`, `unchanged`, `source_fields_changed`, `time_shifted`, `possible_replacement`, `missing_from_latest_export`, `possible_duplicate`, `ambiguous` or equivalent. Do not mutate DB during preview.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:709`, `backend/app/api/v1/endpoints/upload.py`, `backend/app/services/upload_service.py`, `backend/app/schemas/upload.py`, `backend/tests/api/test_upload_api.py`.
  Acceptance criteria (agent-executable): API test asserts preview call leaves transaction count, upload logs, and user fields unchanged.
  QA scenarios (name the exact tool + invocation): happy: preview returns safe and review-required buckets, failure: ambiguous replacement is never auto-applied, Evidence `.omo/evidence/task-2-transaction-source-upload-reconciliation.md`.
  Commit: Y | `[backend] 업로드 preview contract 추가 (codex)`

- [ ] 3. Add explicit apply flow with auditable reconciliation result.
  What to do / Must NOT do: Apply only selected preview changes after explicit confirmation. Record judgment basis in upload log or reconciliation log. Keep legacy upload behavior either as documented compatibility path or internally routed through safe apply defaults.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 4
  References (executor has NO interview context - be exhaustive): `backend/app/api/v1/endpoints/upload.py`, `backend/app/services/upload_service.py`, `backend/app/models/upload_log.py`, `docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`.
  Acceptance criteria (agent-executable): tests prove safe apply inserts new rows, marks missing rows, preserves overrides, and records basis.
  QA scenarios (name the exact tool + invocation): happy: apply selected safe changes, failure: apply ambiguous change without explicit selection returns validation error, Evidence `.omo/evidence/task-3-transaction-source-upload-reconciliation.md`.
  Commit: Y | `[backend] 업로드 reconciliation apply 추가 (codex)`

- [ ] 4. Update contract docs and run final backend verification.
  What to do / Must NOT do: Document lifecycle status, preview/apply flow, legacy upload relation, and agent interpretation. Do not revive `docs/STATUS.md`.
  Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: final
  References (executor has NO interview context - be exhaustive): `docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`, `docs/agents/canonical-read-surface-reference.md`, `docs/agent-integration/integration-guide.md`, `Implentation-plan.md:690`.
  Acceptance criteria (agent-executable): docs explain each lifecycle/preview status and tests plus `git diff --check` pass.
  QA scenarios (name the exact tool + invocation): happy: `rg -n "missing_from_latest_export|reconciliation preview|source_changed" docs backend/app`, failure: `rg -n "hard delete" docs/backend-api-ssot.md` does not imply lifecycle deletion, Evidence `.omo/evidence/task-4-transaction-source-upload-reconciliation.md`.
  Commit: Y | `[docs] 거래 source lifecycle 문서화 (codex)`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: verify every `T030` and `T031` acceptance item is either complete or explicitly deferred.
- [ ] F2. Code quality review: inspect migrations, services, and API schemas for destructive update paths.
- [ ] F3. Real manual QA: run preview/apply against `tmp/2025-05-21~2026-05-21.xlsx` or a derived fixture and record row-count/user-field preservation evidence.
- [ ] F4. Scope fidelity: confirm no `T032` settlement netting or unrelated frontend work slipped in.

## Commit strategy
- Prefer two or three focused commits if the diff is large: lifecycle storage, preview/apply API, docs/tests.
- Keep migrations with the backend behavior that requires them.
- Do not commit `.DS_Store` or local evidence files unless the evidence is intentionally tracked.

## Success criteria
- Re-import can identify missing, changed, duplicate, and ambiguous source rows without deleting user work.
- Upload preview is no-write.
- Apply is explicit and auditable.
- Backend tests and contract docs prove the behavior.
