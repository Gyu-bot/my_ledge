# Debug Runtime Audit: loan-installment-candidate-review-workflows

Date: 2026-06-27
Workspace: `/Users/gyurin/dev/my_ledge`
Verdict: PASS

## Scope And Safety

- Product code was not edited, staged, committed, deleted, reset, or reformatted by this audit.
- New audit artifacts were written only under `.omo/evidence/loan-installment-candidate-review-workflows/`.
- Temporary runtime DB `/tmp/myledge-audit-api.db` was removed after QA.
- Started services:
  - FastAPI: `127.0.0.1:8018`, isolated SQLite DB.
  - Vite: `127.0.0.1:4174`, proxy target `http://127.0.0.1:8018`.
- Cleanup confirmed: `listeners-after-cleanup-confirmed.log` reports `no listeners on 8018 or 4174`.
- Honcho remained undisturbed: `docker-after-cleanup.log` still shows `honcho-api-1 127.0.0.1:8000`, `honcho-redis-1 127.0.0.1:6379`, `honcho-database-1 127.0.0.1:5432`, and `honcho-deriver-1 8000/tcp`.

## Hypotheses And Distinguishing Checks

### H1. Inbox dismissal UI regression

Claim: `대출 후보 아님` may not be visible or may not remove the candidate/count.

Distinguishing checks:
- Vitest: `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx src/test/features/InstallmentsPage.test.tsx src/test/features/SpendingPage.test.tsx src/test/api/contracts.test.ts`
- Browser: open `http://127.0.0.1:4174/data/inbox`, confirm button and `대출 연결 1`, click `대출 후보 아님`, confirm `대출 연결 0` and no dismiss buttons.
- API: default unlinked list before dismiss `total:1`; after dismiss `total:0`; recovery filter `total:1`; restore returns default `total:1`.

Observed:
- Frontend targeted tests: `22 passed (22)`.
- Browser before: DOM contained `button "대출 후보 아님"` and tab `대출 연결 1`.
- Browser after click: text contained `전체 0`, `대출 연결 0`, `처리할 항목이 없습니다`; dismiss button count after click was `0`.
- API after dismiss default: `{"total":0,"page":1,"per_page":40,"items":[]}`.

Verdict: PASS.

### H2. Installment duplicate suggestion regression

Claim: the same transaction suggested for two plans may submit the wrong `installment_plan_id`.

Distinguishing checks:
- Vitest duplicate case in `InstallmentsPage.test.tsx`.
- API suggestions: `curl -i -sS 'http://127.0.0.1:8018/api/v1/installment-transaction-suggestions?page=1&per_page=20'`.
- Browser: open `http://127.0.0.1:4174/data/installments`, click `거래 연결`, verify two suggestions for transaction `9101`, click second row (`애플 스토어`, `2회차`), then read back `GET /api/v1/transactions/9101/installment-link`.

Observed:
- Frontend targeted tests: duplicate test included in `22 passed (22)`.
- API suggestions returned the same transaction `9101` twice:
  - `installment_plan_id:7102`, `suggested_installment_number:1`
  - `installment_plan_id:7101`, `suggested_installment_number:2`
- Browser second-row click read-back:
  - `transaction_id:9101`
  - `installment_plan_id:7101`
  - `installment_plan_display_name:"애플 스토어"`
  - `installment_number:2`

Verdict: PASS.

### H3. Spending MoM regression

Claim: category card may still show current-month amount or wrong percent instead of signed delta/percent.

Distinguishing checks:
- Frontend `SpendingPage.test.tsx` in targeted Vitest run.
- Backend category MoM tests:
  - `tests/api/test_analytics_api.py::test_category_mom_endpoint_returns_latest_month_comparison`
  - `tests/api/test_analytics_api.py::test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis`
- API: `curl -i -sS 'http://127.0.0.1:8018/api/v1/analytics/category-mom?base_month=2026-06'`.
- Browser: open `http://127.0.0.1:4174/spending`, inspect rendered MoM text.

Observed:
- Backend targeted tests: `38 passed`.
- Frontend targeted tests: `22 passed`.
- Browser `/spending` rendered:
  - `식비`
  - `▴ +80.5%`
  - `+₩33만`
- API returned signed deltas such as `delta_amount:-630000`, `delta_pct:-1.0` for a decrease and `delta_amount:0`, `delta_pct:0.0` for unchanged rows.

Verdict: PASS.

### H4. Backend silent failure on linked dismiss

Claim: dismissing an already-linked loan transaction may return success or persist a review instead of `409`/no-write.

Distinguishing checks:
- Backend targeted tests include `test_loan_candidate_review_endpoint_rejects_not_candidate_when_linked`.
- Real HTTP: `curl -i -sS -X PATCH http://127.0.0.1:8018/api/v1/loan-transaction-links/9001/review -H 'Content-Type: application/json' -H 'X-API-Key: audit-key' --data '{"review_status":"not_candidate"}'`.
- DB read-back: `debug_runtime_readback.py 9001`.

Observed:
- HTTP response: `HTTP/1.1 409 Conflict`.
- Body: `{"detail":"Linked loan transaction cannot be dismissed."}`.
- Read-back count for `loan_candidate_reviews.transaction_id=9001`: `0` before/after linked dismiss attempts.

Verdict: PASS.

## Command Results

- `docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'`: honcho ports observed before and after; preserved.
- `lsof -nP -iTCP -sTCP:LISTEN`: initial state showed honcho on `8000/6379/5432`; `8018/4174` were free before starting.
- `cd backend && env DATABASE_URL=sqlite+aiosqlite:////tmp/myledge-audit-config.db UV_CACHE_DIR=.uv-cache uv run pytest ...`: `38 passed, 343 warnings in 1.16s`.
- Initial backend pytest without `DATABASE_URL`: failed during import with Pydantic settings validation; treated as setup issue and rerun with dummy SQLite URL.
- `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx src/test/features/InstallmentsPage.test.tsx src/test/features/SpendingPage.test.tsx src/test/api/contracts.test.ts`: `Test Files 4 passed (4)`, `Tests 22 passed (22)`.
- `git diff --check`: exit 0.
- `curl -i` linked dismiss: `409 Conflict`, no review row persisted.
- Browser UI: screenshots captured before/after inbox dismiss, before/after installment link, and spending MoM.

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| S1 | H1 inbox dismissal visible/removes count | Browser UI | In-app browser Playwright: `goto('http://127.0.0.1:4174/data/inbox')`, screenshot, `getByRole('button', { name: '대출 후보 아님' }).click()` | PASS | A9, A10 |
| S2 | H1 backend dismissal persistence/filtering | HTTP API | `curl -i -sS -X PATCH http://127.0.0.1:8018/api/v1/loan-transaction-links/9002/review -H 'Content-Type: application/json' -H 'X-API-Key: audit-key' --data '{"review_status":"not_candidate"}'` plus default/recovery/restore GETs | PASS | A4, A5, A6, A7, A8 |
| S3 | H2 duplicate installment suggestions submit correct plan id | Browser UI + HTTP API | Browser click second suggestion row in `/data/installments`, then `curl -i -sS 'http://127.0.0.1:8018/api/v1/transactions/9101/installment-link'` | PASS | A11, A12, A13 |
| S4 | H3 Spending MoM signed delta/percent | Browser UI + HTTP API | In-app browser Playwright: `goto('http://127.0.0.1:4174/spending')`; `curl -i -sS 'http://127.0.0.1:8018/api/v1/analytics/category-mom?base_month=2026-06'` | PASS | A14, A15 |
| S5 | Targeted backend regression suite | CLI/test | `cd backend && env DATABASE_URL=sqlite+aiosqlite:////tmp/myledge-audit-config.db UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py tests/services/test_loan_mapping_service.py tests/api/test_installment_suggestions_api.py tests/services/test_installment_suggestion_service.py tests/services/test_installment_service.py tests/api/test_analytics_api.py::test_category_mom_endpoint_returns_latest_month_comparison tests/api/test_analytics_api.py::test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis` | PASS | A1 |
| S6 | Targeted frontend regression suite | CLI/test | `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx src/test/features/InstallmentsPage.test.tsx src/test/features/SpendingPage.test.tsx src/test/api/contracts.test.ts` | PASS | A2 |
| S7 | Whitespace/diff sanity | CLI/git | `git diff --check` | PASS | A3 |
| S8 | Cleanup and honcho preservation | OS/Docker | `lsof -nP -iTCP:8018 -iTCP:4174 -sTCP:LISTEN`; `docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'` | PASS | A16, A17, A18 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| ADV1 | H4 | Already-linked loan transaction dismissed as not_candidate | Return `409 Conflict`; persist no review row | PASS | A19, A20, A21 |
| ADV2 | H1 | Dismissed unlinked loan candidate remains in default inbox/list | Default list count becomes `0`; recovery filter shows candidate; restore returns it | PASS | A4, A5, A6, A7, A8, A10 |
| ADV3 | H2 | Same transaction appears as suggestion for two plans | Clicking the second suggestion submits/read-backs the second row's plan id/number, not the first row's | PASS | A11, A12, A13 |
| ADV4 | H2 | Suggestion endpoint accidentally auto-links transactions | Suggestions endpoint returns items but `GET /installment-transaction-links` remains separate; browser link only occurs after explicit click | PASS | A12, A13 |
| ADV5 | H3 | MoM UI shows current-month amount or unscaled ratio | UI shows `+₩33만` and `+80.5%`, not raw `0.8049` or current `₩74만` | PASS | A14 |
| ADV6 | Service safety | Temporary QA services collide with honcho or remain running | Use `8018/4174`; after cleanup no listeners; honcho containers still bound to `8000/6379/5432` | PASS | A16, A17, A18 |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | transcript | Backend targeted pytest rerun: `38 passed` | `.omo/evidence/loan-installment-candidate-review-workflows/backend-targeted-tests-rerun.log` |
| A2 | transcript | Frontend targeted Vitest: `22 passed` | `.omo/evidence/loan-installment-candidate-review-workflows/frontend-targeted-tests.log` |
| A3 | transcript | `git diff --check` exit 0 transcript | `.omo/evidence/loan-installment-candidate-review-workflows/git-diff-check.log` |
| A4 | HTTP transcript | Unlinked loan candidate before dismiss: `total:1` | `.omo/evidence/loan-installment-candidate-review-workflows/api-unlinked-before.log` |
| A5 | HTTP transcript | Unlinked candidate dismiss: `200 OK`, `review_status:not_candidate` | `.omo/evidence/loan-installment-candidate-review-workflows/api-dismiss-unlinked.log` |
| A6 | HTTP transcript | Default unlinked list after dismiss: `total:0` | `.omo/evidence/loan-installment-candidate-review-workflows/api-unlinked-after-dismiss-default.log` |
| A7 | HTTP transcript | Recovery filter after dismiss: `total:1` | `.omo/evidence/loan-installment-candidate-review-workflows/api-unlinked-after-dismiss-recovery.log` |
| A8 | HTTP transcript | Restore and default list after restore | `.omo/evidence/loan-installment-candidate-review-workflows/api-restore-unlinked.log`, `.omo/evidence/loan-installment-candidate-review-workflows/api-unlinked-after-restore-default.log` |
| A9 | screenshot | Browser inbox before dismiss | `.omo/evidence/loan-installment-candidate-review-workflows/browser-inbox-before-dismiss.png` |
| A10 | screenshot | Browser inbox after dismiss | `.omo/evidence/loan-installment-candidate-review-workflows/browser-inbox-after-dismiss.png` |
| A11 | HTTP transcript | Installment suggestions include duplicate transaction across two plans | `.omo/evidence/loan-installment-candidate-review-workflows/api-installment-suggestions.log` |
| A12 | screenshot | Browser installment suggestions before explicit link | `.omo/evidence/loan-installment-candidate-review-workflows/browser-installments-suggestions-before-link.png` |
| A13 | screenshot + HTTP transcript | Browser after second suggestion link and API read-back | `.omo/evidence/loan-installment-candidate-review-workflows/browser-installments-after-second-link.png`, `.omo/evidence/loan-installment-candidate-review-workflows/api-installment-link-readback-after-browser.log` |
| A14 | screenshot | Browser spending MoM display with `+80.5%` and `+₩33만` | `.omo/evidence/loan-installment-candidate-review-workflows/browser-spending-mom.png` |
| A15 | HTTP transcript | Category MoM API signed deltas | `.omo/evidence/loan-installment-candidate-review-workflows/api-spending-mom.log` |
| A16 | transcript | Temporary listeners before cleanup | `.omo/evidence/loan-installment-candidate-review-workflows/listeners-before-cleanup.log` |
| A17 | transcript | Temporary listeners after cleanup: no listeners | `.omo/evidence/loan-installment-candidate-review-workflows/listeners-after-cleanup-confirmed.log` |
| A18 | transcript | Docker after cleanup; honcho services preserved | `.omo/evidence/loan-installment-candidate-review-workflows/docker-after-cleanup.log` |
| A19 | HTTP transcript | Linked dismiss returns `409 Conflict` | `.omo/evidence/loan-installment-candidate-review-workflows/api-linked-dismiss-409.log` |
| A20 | transcript | Linked dismiss read-back count `0` before/after | `.omo/evidence/loan-installment-candidate-review-workflows/api-linked-no-write-readback-rerun.log`, `.omo/evidence/loan-installment-candidate-review-workflows/api-linked-no-write-final-readback.log` |
| A21 | script | Read-back helper used for no-write checks | `.omo/evidence/loan-installment-candidate-review-workflows/debug_runtime_readback.py` |
| A22 | script | Seed helper for isolated runtime QA DB | `.omo/evidence/loan-installment-candidate-review-workflows/debug_runtime_seed.py` |
| A23 | transcript | Isolated seed DB creation | `.omo/evidence/loan-installment-candidate-review-workflows/api-seed-rerun.log` |

## Remaining Risks

- The isolated browser seed was intentionally minimal and did not create canonical SQL views. During browser navigation, unrelated dashboard/canonical-view requests logged `500 Internal Server Error` for missing `vw_monthly_cashflow`, and one `/loan-accounts` request failed because the seed used invalid `loan_kind='mortgage'`. These are fixture defects in this audit seed, not observed failures in the audited target endpoints. Targeted API/browser checks for inbox dismiss, installment suggestion linking, and spending MoM all completed with observed pass evidence.
- Full backend and frontend suites were not run; this audit ran the targeted suites requested for the four hypotheses plus `git diff --check`.
