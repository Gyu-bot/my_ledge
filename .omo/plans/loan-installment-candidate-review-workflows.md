# loan-installment-candidate-review-workflows - Work Plan

## TL;DR (For humans)

**What you'll get:** `/data/inbox`의 대출 연결 후보마다 `대출 후보 아님`을 선택할 수 있고, 선택한 거래는 새로고침 뒤에도 인박스 기본 목록에서 사라집니다. 할부 페이지는 등록된 할부 항목을 기준으로 거래 후보와 예상 회차를 제안하고, 사용자가 확인해서 연결할 수 있게 됩니다.

**Why this approach:** 두 요구사항 모두 프론트 버튼만으로는 해결되지 않습니다. 인박스 목록과 후보 개수는 백엔드 쿼리에서 오기 때문에 대출 후보 제외 상태를 DB/API에 저장해야 하고, 할부 제안도 기존 수동 연결 목록과 분리된 읽기 전용 추천 API가 있어야 합니다.

**What it will NOT do:**
- 거래 원본을 삭제하거나 대출/할부 연결을 자동 생성하지 않습니다.
- 대출 계좌 숨김 기능으로 거래 후보 제외를 흉내 내지 않습니다.
- 이미 `main`에 반영된 지출 MoM 수정은 회귀 검증만 하며, 새 분석 로직 변경은 묶지 않습니다.

**Effort:** Large
**Risk:** Medium - DB migration, candidate filtering, matching heuristics, and UI verification all touch separate surfaces.
**Decisions to sanity-check:** `대출 후보 아님`은 영구적이되 되돌릴 수 있는 리뷰 상태로 저장합니다. 할부 추천은 기존 활성 할부 계획에 대한 거래 연결 제안만 만들고 자동 연결하지 않습니다.

Your next move: approve execution with `$start-work`, or ask for one more high-accuracy plan review before implementation. Full execution detail follows below.

---

> TL;DR (machine): Large/Medium plan for backend-backed loan candidate dismissal, installment transaction suggestions with proposed 회차, frontend surfaces, docs, and full QA evidence.

## Scope
### Must have
- Add persistent, reversible loan candidate review state for transaction-backed loan candidates.
- Hide `not_candidate` loan candidates from default `GET /api/v1/loan-transaction-links?linked=unlinked` results and therefore from `/data/inbox`.
- Expose a write-protected API action to mark or restore a loan candidate review state.
- Add an inbox action labelled `대출 후보 아님`; after success, the row and count update without requiring a manual refresh.
- Add a read-only installment transaction suggestion API for existing active installment plans.
- Suggest installment candidates using plan input and/or existing linked rows: merchant, same or near amount, expected billing day, and proposed installment number.
- Surface suggested 회차, confidence/reasons, and conflicts in `/data/installments`.
- Keep the existing manual installment link flow; suggestions prefill the number but never auto-link.
- Preserve the current spending category MoM fix with regression tests for percent scaling and signed previous-month delta amount.
- Update backend/API docs and the user-facing roadmap when behavior becomes real.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not delete, hide, merge, or mutate raw transactions when a loan candidate is dismissed.
- Do not use loan account `is_hidden` as candidate dismissal.
- Do not create loan links or installment links automatically.
- Do not introduce ML/LLM matching, a new chart library, broad analytics rewrites, or unrelated UI redesign.
- Do not change transfer, settlement, asset, investment, insurance, or upload workflows.
- Do not overwrite unrelated `.omo/evidence/*` or other untracked files already in the shared worktree.
- Do not push directly to `main` unless the user explicitly requests direct-main publishing again during execution.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD for backend/API and frontend behavior, tests-after only for documentation and final browser evidence.
- Evidence directory: `.omo/evidence/loan-installment-candidate-review-workflows/`
- Required backend checks:
  - `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_loan_mapping_service.py tests/api/test_loan_mapping_api.py tests/services/test_installment_service.py tests/api/test_installments_api.py tests/api/test_schema_api.py`
  - `cd backend && UV_CACHE_DIR=.uv-cache uv run alembic upgrade head`
  - `cd backend && UV_CACHE_DIR=.uv-cache uv run ruff check .`
- Required frontend checks:
  - `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx src/test/features/InstallmentsPage.test.tsx src/test/features/SpendingPage.test.tsx src/test/ds/charts.test.tsx`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run build`
- Required service/port safety before browser QA:
  - `docker ps --format '{{.Names}} {{.Ports}}'` and `lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174)\b'`
  - Preserve active `honcho-*` services and avoid `127.0.0.1:8000`, `127.0.0.1:5432`, and `127.0.0.1:6379`.
- Required browser evidence:
  - Use the Codex in-app browser against an explicit `http://127.0.0.1:<port>/data/inbox` URL.
  - Use a disposable seeded backend/database or documented isolated fixture path, not the user's operational honcho database.
  - Capture before/after evidence that `대출 후보 아님` is visible, clicking it removes the candidate from default inbox, and restore/status-filter path can recover it.
  - Capture `/data/installments` evidence showing a suggested transaction with proposed 회차 and a successful link using that proposed number.

## Execution strategy
### Parallel execution waves
- Wave 1 Backend contracts: todos 1, 2, and 3 can begin together after a branch/worktree is prepared, but todos 1 and 3 should land before frontend integration depends on them.
- Wave 2 Frontend surfaces: todos 4, 5, and 6 run after backend response shapes are stable.
- Wave 3 Docs and evidence: todos 7 and 8 run after behavior is implemented.
- Final verification wave: F1-F4 run only after all todos pass their own acceptance checks.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. Loan candidate review model/API | current branch based on latest `origin/main` | 2, 4, 5, 7, 8 | 3 |
| 2. Loan candidate filtering/tests | 1 | 4, 5, 8 | 3 |
| 3. Installment suggestion API | current branch based on latest `origin/main` | 4, 6, 7, 8 | 1, 2 |
| 4. Frontend API/types/hooks | 1, 2, 3 | 5, 6 | 7 |
| 5. Inbox UI dismissal | 4 | 8 | 6, 7 |
| 6. Installment suggestion UI | 4 | 8 | 5, 7 |
| 7. Docs/roadmap updates | 1, 3 | F1 | 5, 6 |
| 8. End-to-end QA evidence | 5, 6, 7 | F1-F4 | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Add persistent loan candidate review state and write API
  What to do / Must NOT do: Create a dedicated `loan_candidate_reviews` model, Alembic migration, schemas, and protected review endpoint. Use `candidate_type='loan_transaction'`, `transaction_id`, derived `candidate_key='loan_transaction:{transaction_id}'`, `review_status='pending'|'not_candidate'`, optional memo, and `reviewed_at`. Do not reuse `purchase_gate_reviews`; it is purchase-gate specific.
  Parallelization: Wave 1 | Blocked by: branch/worktree from latest `origin/main` | Blocks: 2, 4, 5, 7, 8
  References (executor has NO interview context - be exhaustive): `backend/app/models/purchase_gate_review.py:9`, `backend/app/api/v1/endpoints/loan_mapping.py:54`, `backend/app/api/v1/endpoints/loan_mapping.py:93`, `backend/app/schemas/loan_mapping.py:1`, `backend/app/models/__init__.py`, `backend/alembic/versions/20260530_0021_add_purchase_gate_reviews.py`, `backend/alembic/versions/20260530_0023_add_installment_management.py`
  Acceptance criteria (agent-executable): Add failing tests first in `backend/tests/api/test_loan_mapping_api.py` for unauthenticated rejection, idempotent dismiss, idempotent restore, and conflict when a linked transaction is marked `not_candidate`. Then pass `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py`.
  QA scenarios (name the exact tool + invocation): API test client asserts `PATCH /api/v1/loan-transaction-links/{transaction_id}/review` with `X-API-Key` returns review state, while missing API key is rejected. Evidence `.omo/evidence/loan-installment-candidate-review-workflows/task-1-backend-loan-review-api.md`.
  Commit: N | feat(api): add loan candidate review state

- [x] 2. Filter dismissed loan candidates out of default loan mapping results
  What to do / Must NOT do: Extend `list_loan_transaction_mappings` and `_build_loan_transaction_mapping_query` so default `review_status=pending` excludes `not_candidate`, while `review_status=not_candidate` or `all` supports recovery/audit. Do not filter linked rows incorrectly; link state and review state are separate.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4, 5, 8
  References (executor has NO interview context - be exhaustive): `backend/app/services/loan_mapping_service.py:113`, `backend/app/services/loan_mapping_service.py:438`, `backend/app/services/loan_mapping_service.py:455`, `backend/app/api/v1/endpoints/loan_mapping.py:54`, `backend/app/schemas/loan_mapping.py:41`
  Acceptance criteria (agent-executable): Add service tests in `backend/tests/services/test_loan_mapping_service.py` proving a dismissed unlinked candidate is absent from the default list, appears under `review_status=not_candidate`, and reappears after restore. Run `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_loan_mapping_service.py tests/api/test_loan_mapping_api.py`.
  QA scenarios (name the exact tool + invocation): API test client lists candidates before dismiss, after dismiss, under recovery filter, and after restore; save response excerpts to `.omo/evidence/loan-installment-candidate-review-workflows/task-2-loan-filtering.md`.
  Commit: N | feat(api): filter reviewed loan candidates

- [x] 3. Add installment transaction suggestion API and deterministic matching
  What to do / Must NOT do: Add `GET /api/v1/installment-transaction-suggestions` with optional `installment_plan_id`, pagination, and conflict visibility. Suggest only for existing active installment plans. Query unlinked, non-deleted, non-merged expense transactions; do not alter the existing manual `installment-transaction-links` list semantics.
  Parallelization: Wave 1 | Blocked by: branch/worktree from latest `origin/main` | Blocks: 4, 6, 7, 8
  References (executor has NO interview context - be exhaustive): `backend/app/api/v1/endpoints/installments.py:37`, `backend/app/api/v1/endpoints/installments.py:101`, `backend/app/services/installment_service.py:34`, `backend/app/services/installment_service.py:151`, `backend/app/services/installment_service.py:336`, `backend/app/schemas/installment.py:1`, `backend/tests/services/test_installment_service.py:1`, `backend/tests/api/test_installments_api.py:1`
  Acceptance criteria (agent-executable): Add service/API tests proving same merchant + same billing day + near amount suggests the expected 회차, amount/date outliers are excluded or low-confidence by contract, occupied numbers expose `conflict_reason`, and already linked transactions are not suggested as usable duplicates. Run `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_installment_service.py tests/api/test_installments_api.py`.
  QA scenarios (name the exact tool + invocation): API test client creates a plan with `first_payment_date`, seeded candidate transactions for months 1-3, and asserts suggested 회차 values 1-3 with reasons. Evidence `.omo/evidence/loan-installment-candidate-review-workflows/task-3-installment-suggestions-api.md`.
  Commit: N | feat(api): suggest installment transaction links

- [x] 4. Wire frontend API types, query keys, and mutations
  What to do / Must NOT do: Add typed client functions and hooks for loan candidate review and installment suggestions. Invalidate loan mapping and inbox-related query keys after review updates. Keep strict TypeScript; no `any`, `@ts-ignore`, or broad query invalidation beyond the affected surfaces unless existing patterns require it.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 5, 6
  References (executor has NO interview context - be exhaustive): `frontend/src/types/transaction.ts:123`, `frontend/src/types/transaction.ts:241`, `frontend/src/api/transactions.ts:157`, `frontend/src/api/transactions.ts:178`, `frontend/src/api/transactions.ts:198`, `frontend/src/hooks/useTransactions.ts:29`, `frontend/src/hooks/useTransactions.ts:273`, `frontend/src/hooks/useTransactions.ts:294`, `frontend/src/AGENTS.md`
  Acceptance criteria (agent-executable): Add/update frontend API contract tests or hook tests so request paths, payloads, and invalidations are asserted. Run `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx src/test/features/InstallmentsPage.test.tsx`.
  QA scenarios (name the exact tool + invocation): Vitest spies verify `PATCH /loan-transaction-links/{id}/review` and `GET /installment-transaction-suggestions` are called with typed params. Evidence `.omo/evidence/loan-installment-candidate-review-workflows/task-4-frontend-contracts.md`.
  Commit: N | feat(frontend): add candidate review and suggestion hooks

- [x] 5. Add inbox `대출 후보 아님` action and visible state handling
  What to do / Must NOT do: Update `LoanCandidateCard` so each loan candidate has a clear `대출 후보 아님` action near the link action. On success, refetch/invalidate so the row and count disappear. Show pending/error state using existing DS patterns and write-access behavior. Do not bury the action in a hidden menu.
  Parallelization: Wave 2 | Blocked by: 4 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `frontend/src/features/data/InboxPage.tsx:150`, `frontend/src/features/data/InboxPage.tsx:206`, `frontend/src/test/features/InboxPage.test.tsx:46`, `frontend/src/ds/README.md` if present, `frontend/src/AGENTS.md`
  Acceptance criteria (agent-executable): Add a failing test that renders a loan candidate and asserts `대출 후보 아님` is visible; clicking it calls the mutation with `review_status: 'not_candidate'`; a successful refetch removes the row/count from the inbox fixture. Run `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx`.
  QA scenarios (name the exact tool + invocation): Codex in-app browser at `http://127.0.0.1:<port>/data/inbox` with seeded candidate; screenshot before click, after click, and recovery filter/API response. Evidence `.omo/evidence/loan-installment-candidate-review-workflows/task-5-inbox-dismissal.png` plus notes.
  Commit: N | feat(frontend): dismiss loan candidates from inbox

- [x] 6. Add installment suggestion UI with proposed 회차 linking
  What to do / Must NOT do: Add a suggestion section/table in `/data/installments` that fetches suggestion rows, shows plan name, merchant, amount/date delta, confidence/reasons, proposed 회차, and conflict status. The connect action must call the existing installment link mutation with the suggested number, while still allowing user override. After creating a plan, guide the user to the linked suggestion surface without auto-linking.
  Parallelization: Wave 2 | Blocked by: 4 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `frontend/src/features/data/InstallmentsPage.tsx:49`, `frontend/src/features/data/InstallmentsPage.tsx:135`, `frontend/src/features/data/InstallmentsPage.tsx:151`, `frontend/src/features/data/InstallmentsPage.tsx:240`, `frontend/src/test/features/InstallmentsPage.test.tsx`, `frontend/src/AGENTS.md`
  Acceptance criteria (agent-executable): Add tests proving a suggested transaction displays `제안 회차`/`N회차`, the default link input uses the suggested number, conflict rows are disabled or labelled, and successful link invalidates suggestion/list/forecast queries. Run `cd frontend && npm test -- --run src/test/features/InstallmentsPage.test.tsx`.
  QA scenarios (name the exact tool + invocation): Codex in-app browser at `http://127.0.0.1:<port>/data/installments` with seeded plan/candidates; capture suggestion row with proposed 회차 and post-link state. Evidence `.omo/evidence/loan-installment-candidate-review-workflows/task-6-installment-suggestions.png` plus notes.
  Commit: N | feat(frontend): show installment link suggestions

- [x] 7. Update API docs, roadmap, and MoM regression references
  What to do / Must NOT do: Document the new loan review endpoint, loan list review-status filter, and installment suggestion endpoint in the backend API SSOT/reference docs. Update `Implentation-plan.md` only for the user-visible status/task graph. Note that spending MoM remains under regression coverage and is not reworked unless a test fails.
  Parallelization: Wave 3 | Blocked by: 1, 3 | Blocks: F1
  References (executor has NO interview context - be exhaustive): `docs/backend-api-ssot.md:131`, `docs/backend-api-ssot.md:133`, `docs/backend-api-ssot.md:135`, `docs/backend-api-ssot.md:194`, `docs/backend-api-and-metrics-reference.md:602`, `docs/backend-api-and-metrics-reference.md:704`, `docs/backend-api-and-metrics-reference.md:761`, `docs/backend-api-and-metrics-reference.md:1051`, `Implentation-plan.md:285`, `Implentation-plan.md:778`, `Implentation-plan.md:821`
  Acceptance criteria (agent-executable): `rg -n "loan-transaction-links/.+review|installment-transaction-suggestions|review_status|대출 후보 아님|제안 회차" docs Implentation-plan.md` finds the new contracts/status. Docs do not resurrect deprecated `docs/STATUS.md`.
  QA scenarios (name the exact tool + invocation): Read docs with `sed -n` around modified sections and save excerpts to `.omo/evidence/loan-installment-candidate-review-workflows/task-7-docs.md`.
  Commit: N | docs(plan): document candidate review workflows

- [x] 8. Run final integrated verification and browser evidence pass
  What to do / Must NOT do: Run the full backend/frontend command set, then perform browser QA with deterministic seeded data. Preserve honcho services and avoid operational DB mutation. If an isolated seeded stack cannot be started, stop and report the exact blocker instead of claiming browser verification.
  Parallelization: Wave 3 | Blocked by: 5, 6, 7 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `AGENTS.md`, `frontend/src/AGENTS.md`, `.omo/drafts/loan-installment-candidate-review-workflows.md`, this plan's Verification strategy
  Acceptance criteria (agent-executable): All required backend/frontend commands exit 0, or any pre-existing unrelated failure is captured with command output and root cause. Browser evidence proves the exact user-visible flows.
  QA scenarios (name the exact tool + invocation): Codex in-app browser route checks:
    1. `/data/inbox`: candidate row contains `대출 후보 아님`.
    2. Click `대출 후보 아님`: row/count disappear from default inbox.
    3. Recovery API/filter shows the dismissed candidate and restore makes it visible again.
    4. `/data/installments`: suggested candidate displays proposed 회차 and reason/confidence.
    5. Link from suggestion succeeds and forecast/list refresh.
    6. `/spending`: MoM list still shows signed delta amount and correctly scaled percent.
  Evidence `.omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md` plus screenshots.
  Commit: Y | feat(data): add candidate review workflows

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit
  Verify every Must have and Must NOT have item above against the final diff and evidence. Reject if a loan candidate can only be hidden in frontend state, if installment suggestions auto-link, or if browser evidence is missing.
- [x] F2. Code quality review
  Inspect backend migrations/services/schemas and frontend types/hooks/components for strict typing, local patterns, query invalidation scope, and migration downgrade safety.
- [x] F3. Real manual QA
  Re-drive the in-app browser scenarios from todo 8. This is not replaceable by tests alone.
- [x] F4. Scope fidelity
  Confirm the diff contains only loan candidate review, installment suggestions, MoM regression/docs, and required OMO evidence/docs. Flag unrelated refactors or churn.

## Commit strategy
- Start execution from latest `origin/main` on a focused branch such as `codex/loan-installment-candidate-review-workflows`.
- Keep one final commit if the work remains cohesive: `feat(data): add candidate review workflows`.
- Include backend, frontend, docs, tests, and evidence references in the commit/PR summary.
- Do not merge or push to `main` without explicit user instruction at execution time.
- If work splits unexpectedly, keep loan candidate review and installment suggestions on one branch only if their shared inbox/data UX remains coupled by this user request; otherwise ask before splitting.

## Success criteria
- `/data/inbox` visibly offers `대출 후보 아님` for every loan connection candidate.
- Marking a candidate as not a loan candidate persists, removes it from the default inbox/list/count, and has a recovery/restore path.
- Installment plans produce transaction suggestions with proposed 회차 based on first billing date progression, merchant, amount, and billing-day heuristics.
- Suggestions are advisory: the user can link with the proposed 회차, override it, or ignore it; the app never auto-links.
- Conflicting installment numbers are not silently offered as usable links.
- Spending category MoM display remains correct: percent is scaled for display and amount is signed previous-month delta, not current-month total.
- Backend tests, frontend tests, typecheck/lint/build, migration upgrade, docs checks, and in-app browser QA all have saved evidence.
