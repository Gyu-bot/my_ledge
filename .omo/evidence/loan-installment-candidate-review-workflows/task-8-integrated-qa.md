# Task 8 Integrated QA Evidence

Date: 2026-06-27
Branch: `codex/loan-installment-candidate-review-workflows`
Scope: final integrated verification and browser evidence pass for `.omo/plans/loan-installment-candidate-review-workflows.md` todo 8.

## Safety Inspection

Before service/browser work:

```text
Invocation: docker ps --format '{{.Names}} {{.Ports}}'
Result:
kinlayer-web 0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp
kinlayer-api 0.0.0.0:8765->8765/tcp, [::]:8765->8765/tcp
kinlayer-postgres 127.0.0.1:15432->5432/tcp
honcho-api-1 127.0.0.1:8000->8000/tcp
honcho-deriver-1 8000/tcp
honcho-redis-1 127.0.0.1:6379->6379/tcp
honcho-database-1 127.0.0.1:5432->5432/tcp
```

```text
Invocation: lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174)\b'
Result:
com.docke  1628 gyurin  154u  IPv4 ... TCP 127.0.0.1:8000 (LISTEN)
com.docke  1628 gyurin  158u  IPv4 ... TCP 127.0.0.1:6379 (LISTEN)
com.docke  1628 gyurin  159u  IPv4 ... TCP 127.0.0.1:5432 (LISTEN)
```

Sandbox note: the first Docker socket read failed with `permission denied while trying to connect to the docker API`; the same required inspection was rerun with escalation and succeeded. No `honcho-*` service was stopped, restarted, or mutated.

## Automated Verification

### Backend

```text
Invocation:
cd backend && DATABASE_URL=sqlite+aiosqlite:///./test.db API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_loan_mapping_service.py tests/api/test_loan_mapping_api.py tests/services/test_installment_service.py tests/services/test_installment_suggestion_service.py tests/api/test_installments_api.py tests/api/test_installment_suggestions_api.py tests/api/test_schema_api.py

Exit: 0
Result:
collected 44 items
tests/services/test_loan_mapping_service.py ...............              [ 34%]
tests/api/test_loan_mapping_api.py ..............                        [ 65%]
tests/services/test_installment_service.py ..                            [ 70%]
tests/services/test_installment_suggestion_service.py ..                 [ 75%]
tests/api/test_installments_api.py .....                                 [ 86%]
tests/api/test_installment_suggestions_api.py ...                        [ 93%]
tests/api/test_schema_api.py ...                                         [100%]
44 passed, 388 warnings in 1.24s
```

```text
Invocation: cd backend && UV_CACHE_DIR=.uv-cache uv run ruff check .
Exit: 0
Result: All checks passed!
```

Alembic migration check:

```text
Invocation:
cd backend && DATABASE_URL=sqlite+aiosqlite:///./alembic-check.db API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run alembic upgrade head

Exit: 1
Blocker:
sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here.
```

```text
Invocation:
cd backend && DATABASE_URL=sqlite:///./alembic-check.db API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run alembic upgrade head

Exit: 1
Blocker:
backend/alembic/versions/20260326_0002_canonical_views.py blocks SQLite upgrade before this task's migration.
sqlite3.OperationalError: unrecognized token: ":"
Failing SQL excerpt uses PostgreSQL-specific syntax:
SUM(amount)::integer AS amount
```

Interpretation: full `alembic upgrade head` was not feasible on isolated SQLite because older migrations are PostgreSQL-specific and async SQLite also conflicts with the sync Alembic env. Operational Postgres was intentionally not used because honcho owns `127.0.0.1:5432`.

### Frontend

```text
Invocation:
cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx src/test/features/InstallmentsPage.test.tsx src/test/features/SpendingPage.test.tsx src/test/ds/charts.test.tsx src/test/api/contracts.test.ts

Exit: 0
Result:
Test Files  5 passed (5)
Tests       24 passed (24)
```

```text
Invocation: cd frontend && npm run typecheck
Exit: 0
Result: tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit
```

```text
Invocation: cd frontend && npm run lint
Exit: 1
Result:
frontend/src/features/data/InstallmentsPage.tsx
  12:19  error  'formatSignedWon' is defined but never used  @typescript-eslint/no-unused-vars
```

This was the initial lint failure found during integrated QA. It was fixed in the lint blocker section below and is no longer a current blocker.

## Lint Blocker Fix

```text
Scope:
- Remove the unused `formatSignedWon` import from `frontend/src/features/data/InstallmentsPage.tsx`.
- No UI, API, or behavior change.
```

```text
Invocation: apply_patch on frontend/src/features/data/InstallmentsPage.tsx
Result: removed unused `formatSignedWon` import from the `../../ds/format` import list
```

```text
Invocation: cd frontend && npm run lint
Exit: 0
Result:
> my_ledge-frontend@0.1.0 lint
> eslint . --max-warnings 0
```

```text
Invocation: cd frontend && npm run typecheck
Exit: 0
Result:
> my_ledge-frontend@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit
```

```text
Invocation: git diff --check
Exit: 0
Result: no whitespace errors
```

## Adversarial QA

```text
stale_state:
- Branch already had extensive unrelated modified and untracked files before this fix.
- This task changed only `frontend/src/features/data/InstallmentsPage.tsx` and this evidence file.

dirty_worktree:
- Yes. Existing worktree was dirty on entry; no unrelated files were reverted or cleaned.

misleading_success_output:
- `npm run lint` success prints only the npm script banner and no explicit "passed" line.
- Treated as success because the command exited with code 0.
```

```text
Invocation: cd frontend && npm run build
Exit: 0
Result:
vite v5.4.21 building for production...
✓ 1927 modules transformed.
✓ built in 1.41s
Warning: Some chunks are larger than 500 kB after minification.
```

```text
Invocation: git diff --check
Exit: 0
Result: no whitespace errors
```

## Isolated Browser Fixture

Created an isolated SQLite browser QA DB at:

```text
.omo/evidence/loan-installment-candidate-review-workflows/task-8-browser-qa.db
```

Seed harness:

```text
.omo/evidence/loan-installment-candidate-review-workflows/task-8-seed-db.py
```

Seed command:

```text
Invocation:
cd backend && DATABASE_URL=sqlite+aiosqlite:////Users/gyurin/dev/my_ledge/.omo/evidence/loan-installment-candidate-review-workflows/task-8-browser-qa.db API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run python ../.omo/evidence/loan-installment-candidate-review-workflows/task-8-seed-db.py

Exit: 0
```

The fixture contains one loan candidate, one loan account, one active installment plan, three installment candidate transactions, and May/June spending rows for MoM verification. It does not use or mutate the operational honcho Postgres database.

Local QA services:

```text
FastAPI:
cd backend && DATABASE_URL=sqlite+aiosqlite:////Users/gyurin/dev/my_ledge/.omo/evidence/loan-installment-candidate-review-workflows/task-8-browser-qa.db API_KEY=test-api-key CORS_ORIGINS=http://127.0.0.1:4174 UV_CACHE_DIR=.uv-cache uv run uvicorn app.main:app --host 127.0.0.1 --port 8018

Vite:
cd frontend && VITE_PROXY_TARGET=http://127.0.0.1:8018 API_KEY=test-api-key npm run dev -- --host 127.0.0.1 --port 4174
```

Sandbox note: starting FastAPI on 8018 failed without escalation with `operation not permitted`; the isolated non-honcho local bind was rerun with escalation. Sandboxed `curl` could not connect to the escalated local server, so API probes against 8018 were also run with escalation.

## API Probes With `curl -i`

Default loan candidate:

```text
Invocation:
curl -i 'http://127.0.0.1:8018/api/v1/loan-transaction-links?linked=unlinked&page=1&per_page=20'

Exit: 0
Result: HTTP/1.1 200 OK
Body excerpt:
{"total":1,...,"merchant":"국민은행 대출이자 QA","amount":-350000,"link":null}
```

Dismissed loan candidate recovery filter:

```text
Invocation:
curl -i 'http://127.0.0.1:8018/api/v1/loan-transaction-links?linked=unlinked&review_status=not_candidate&page=1&per_page=20'

Exit: 0
Result: HTTP/1.1 200 OK
Body excerpt:
{"total":1,...,"transaction_id":1,"merchant":"국민은행 대출이자 QA"}
```

Restore candidate:

```text
Invocation:
curl -i -X PATCH 'http://127.0.0.1:8018/api/v1/loan-transaction-links/1/review' -H 'Content-Type: application/json' -H 'X-API-Key: test-api-key' --data '{"review_status":"pending"}'

Exit: 0
Result: HTTP/1.1 200 OK
Body:
{"candidate_key":"loan_transaction:1","candidate_type":"loan_transaction","transaction_id":1,"review_status":"pending","memo":null,"reviewed_at":"2026-06-27T13:28:09.036656"}
```

Installment suggestions before link:

```text
Invocation:
curl -i 'http://127.0.0.1:8018/api/v1/installment-transaction-suggestions?page=1&per_page=40'

Exit: 0
Result: HTTP/1.1 200 OK
Body excerpt:
{"total":3,...,"suggested_installment_number":1,"confidence":"high","reason_labels":["same_merchant","similar_amount","same_billing_day","same_payment_method"],"is_usable":true}
```

Installment suggestions after link:

```text
Invocation:
curl -i 'http://127.0.0.1:8018/api/v1/installment-transaction-suggestions?page=1&per_page=40'

Exit: 0
Result: HTTP/1.1 200 OK
Body excerpt:
{"total":2,...,"suggested_installment_number":2,...}
```

Linked installment list after suggestion link:

```text
Invocation:
curl -i 'http://127.0.0.1:8018/api/v1/installment-transaction-links?linked=linked&page=1&per_page=40'

Exit: 0
Result: HTTP/1.1 200 OK
Body excerpt:
{"total":1,...,"transaction_id":2,...,"installment_number":1,"total_installments":3}
```

Spending MoM API:

```text
Invocation:
curl -i 'http://127.0.0.1:8018/api/v1/analytics/category-mom?start_date=2026-05-01&end_date=2026-06-30&type=%EC%A7%80%EC%B6%9C'

Exit: 0
Result: HTTP/1.1 200 OK
Body excerpt:
{"category":"식비","current_amount":150000,"previous_amount":100000,"delta_amount":50000,"delta_pct":0.5}
```

## Browser QA

Surface: Codex in-app browser.
Base URL: `http://127.0.0.1:4174`

Observed route checks:

1. `/data/inbox` showed loan candidate row `국민은행 대출이자 QA` and visible button `대출 후보 아님`.
2. Clicking `대출 후보 아님` removed the row from the default inbox and changed tabs to `전체 0`, `대출 연결 0`.
3. Recovery API filter showed the dismissed candidate; restore API returned `review_status:"pending"`; browser reload showed the candidate and button again with `전체 1`, `대출 연결 1`.
4. `/data/installments`, tab `거래 연결`, showed `추천 연결 제안`, `제안 회차`, `1회차`, confidence `높음`, and reason labels including `same_merchant`, `similar_amount`, `same_billing_day`, `same_payment_method`.
5. Clicking first suggestion's `애플 추천 연결` succeeded. UI changed suggestion count from `3 / 3건` to `2 / 2건`, showed toast `연결 저장 완료`, refreshed forecast summary from `잔여 예정 ₩30만 / 누락 ₩20만` to `잔여 예정 ₩20만 / 누락 ₩10만`, and showed linked list row `QA 맥북 3개월 할부 1 / 3회차`.
6. `/spending?from=2026-05&to=2026-06` showed `카테고리 전월 대비`, category `식비`, signed delta `+₩5만`, and scaled percent `+50.0%`.

Browser limitation observed:

- `/data/inbox` also triggers `GET /api/v1/canonical-views/dashboard`, which returned 500 on the minimal SQLite fixture because metadata-created SQLite does not create canonical SQL views such as `vw_monthly_cashflow`.
- This did not block the loan-candidate route check because `/api/v1/loan-transaction-links`, `/api/v1/loan-accounts`, and `/api/v1/analytics/discretionary-velocity` succeeded and rendered the target loan row/action.
- The failure is isolated to the test fixture shape, not operational honcho DB, and was not hidden.

## Manual QA Matrix

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| T8-S1 | Browser route check 1 | Browser UI `/data/inbox` | Codex in-app browser `goto('http://127.0.0.1:4174/data/inbox')` | PASS | A1, A2 |
| T8-S2 | Browser route check 2 | Browser UI `/data/inbox` | Click unique button `대출 후보 아님` | PASS | A3 |
| T8-S3 | Browser route check 3 | HTTP API + Browser UI | `curl -i ...review_status=not_candidate`; `curl -i -X PATCH .../loan-transaction-links/1/review`; browser reload | PASS | A4, A5 |
| T8-S4 | Browser route check 4 | Browser UI `/data/installments` | Codex in-app browser `goto('http://127.0.0.1:4174/data/installments')`, click tab `거래 연결` | PASS | A6 |
| T8-S5 | Browser route check 5 | Browser UI + HTTP API | Click first row `애플 추천 연결`; `curl -i ...installment-transaction-links?linked=linked` | PASS | A7, A8 |
| T8-S6 | Browser route check 6 | Browser UI `/spending` | Codex in-app browser `goto('http://127.0.0.1:4174/spending?from=2026-05&to=2026-06')` | PASS | A9 |
| T8-S7 | Automated backend | CLI | `cd backend && DATABASE_URL=sqlite+aiosqlite:///./test.db API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run pytest ...` | PASS | A10 |
| T8-S8 | Automated frontend tests | CLI | `cd frontend && npm test -- --run ...` | PASS | A10 |
| T8-S9 | Frontend lint after blocker fix | CLI | `cd frontend && npm run lint` | PASS | A10 |
| T8-S10 | Alembic check | CLI | `cd backend && DATABASE_URL=sqlite:///./alembic-check.db ... uv run alembic upgrade head` | FAIL | A10 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| T8-A1 | Safety first | stale_state | Inspect current branch/worktree and ports before QA; do not assume earlier state. | PASS | A10 |
| T8-A2 | Safety first | dirty_worktree | Preserve pre-existing dirty/untracked files and write evidence-only artifacts. | PASS | A10 |
| T8-A3 | Automated verification | misleading_success_output | Record exact nonzero exits instead of summarizing as green. | PASS | A10 |
| T8-A4 | Prior test summaries | malformed_input summary from prior tests | Rely on rerun backend/frontend suites that include 422/malformed input contract tests. | PASS | A10 |
| T8-A5 | Command execution | long_commands | Let full pytest/build/typecheck/lint complete; no command left running. | PASS | A10 |
| T8-A6 | Test reliability | flaky_tests | Rerun integrated suites once; no automated test flake observed. Browser locator ambiguity was corrected by scoping to the suggestions table. | PASS | A6, A7, A10 |
| T8-A7 | Browser evidence | stale_cache/browser refresh | After restore API, browser reload showed candidate again; after link, query invalidation refreshed suggestions/list/forecast. | PASS | A5, A7 |
| T8-A8 | Cleanup | cleanup | Close browser tab, stop Vite 4174, stop FastAPI 8018, remove temp `backend/alembic-check.db`, confirm honcho-only protected ports remain. | PASS | A10 |

### artifactRefs

| id | kind | description | path |
| --- | --- | --- | --- |
| A1 | screenshot | Inbox before dismiss: candidate row and `대출 후보 아님` visible | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-before-dismiss.png` |
| A2 | fixture | Isolated browser QA SQLite DB | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-browser-qa.db` |
| A3 | screenshot | Inbox after dismiss: default row/count removed | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-after-dismiss.png` |
| A4 | API transcript | Recovery and restore `curl -i` excerpts recorded in this evidence file | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md` |
| A5 | screenshot | Inbox after restore: candidate and action visible again | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-after-restore.png` |
| A6 | screenshot | Installment suggestions before link with proposed 회차/reasons/confidence | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-installments-before-link.png` |
| A7 | screenshot | Installment suggestions after link with refreshed list/forecast | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-installments-after-link.png` |
| A8 | API transcript | Post-link suggestions/list `curl -i` excerpts recorded in this evidence file | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md` |
| A9 | screenshot | Spending MoM signed delta and scaled percent | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-spending-mom.png` |
| A10 | QA report | Command results, blockers, cleanup receipt, adversarial matrix | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md` |
| A11 | seed harness | Deterministic isolated fixture generator | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-seed-db.py` |

## Cleanup Receipt

Stopped/closed:

- Codex in-app browser QA tab: closed.
- Vite dev server on `127.0.0.1:4174`: stopped with `Ctrl-C`; session exited.
- FastAPI QA server on `127.0.0.1:8018`: stopped with `Ctrl-C`; session exited.

Removed:

```text
Invocation: rm backend/alembic-check.db
Exit: 0
```

Confirmed removed:

```text
Invocation: ls -lh backend/alembic-check.db backend/test.db 2>/dev/null || true
Exit: 0
Result: no output
```

Confirmed protected ports after cleanup:

```text
Invocation: lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018)\b'
Result:
com.docke  1628 gyurin ... TCP 127.0.0.1:8000 (LISTEN)
com.docke  1628 gyurin ... TCP 127.0.0.1:6379 (LISTEN)
com.docke  1628 gyurin ... TCP 127.0.0.1:5432 (LISTEN)
```

Confirmed Docker state after cleanup:

```text
Invocation: docker ps --format '{{.Names}} {{.Ports}}'
Result:
kinlayer-web 0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp
kinlayer-api 0.0.0.0:8765->8765/tcp, [::]:8765->8765/tcp
kinlayer-postgres 127.0.0.1:15432->5432/tcp
honcho-api-1 127.0.0.1:8000->8000/tcp
honcho-deriver-1 8000/tcp
honcho-redis-1 127.0.0.1:6379->6379/tcp
honcho-database-1 127.0.0.1:5432->5432/tcp
```

Evidence artifacts intentionally retained:

- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-browser-qa.db`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-seed-db.py`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-*.png`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md`

## Risks / Blockers

- Resolved: the initial `npm run lint` failure on unused `formatSignedWon` was fixed and the follow-up lint run passed.
- FAIL/BLOCKED AS PRACTICAL: full Alembic upgrade was not feasible on isolated SQLite because older migrations are PostgreSQL-specific (`SUM(amount)::integer`) and async SQLite also fails under the sync Alembic env. Operational honcho Postgres was not used to avoid mutating the user's DB.
- Browser fixture caveat: `GET /api/v1/canonical-views/dashboard` returned 500 in the minimal SQLite fixture because canonical SQL views were not created. The required route checks still passed via the target APIs and visible UI elements; this limitation is recorded rather than hidden.

## F1 Correction Note

F1 follow-up evidence supersedes the earlier SQLite Alembic blocker and strengthens the inbox browser proof:

- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible.png` now shows the visible `대출 후보 아님` action in the in-app browser.
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible-dom.txt` records browser DOM/accessibility proof for exact button text and candidate row text.
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-alembic-postgres-upgrade.md` records isolated PostgreSQL `alembic upgrade head` success on `127.0.0.1:15433`, without using honcho DB `127.0.0.1:5432`.
