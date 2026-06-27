# Global Review Work Lane 2 QA Verification

Date: 2026-06-27
Verdict: PASS
Scope: QA verification only. Product files were not edited.

## Surfaces And Invocations

- Evidence inspection:
  - `sed -n '1,260p' .omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md`
  - `sed -n '261,620p' .omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md`
  - `sed -n '1,260p' .omo/evidence/loan-installment-candidate-review-workflows/f3-real-manual-qa.md`
  - `sed -n '1,260p' .omo/evidence/loan-installment-candidate-review-workflows/task-8-f1-fixes.md`
  - `sed -n '1,260p' .omo/evidence/loan-installment-candidate-review-workflows/task-8-alembic-postgres-upgrade.md`
  - `sed -n '1,140p' .omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible-dom.txt`
- Artifact non-empty check:
  - `find .omo/evidence/loan-installment-candidate-review-workflows -maxdepth 1 -type f \( -name 'f3-*.png' -o -name 'task-8-inbox-button-visible*' -o -name 'task-8-browser-qa.db' \) -print -exec wc -c {} \;`
- Visual artifact inspection:
  - `view_image .omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible.png`
  - `view_image .omo/evidence/loan-installment-candidate-review-workflows/f3-installments-before-link.png`
  - `view_image .omo/evidence/loan-installment-candidate-review-workflows/f3-installments-after-link.png`
  - `view_image .omo/evidence/loan-installment-candidate-review-workflows/f3-spending-mom.png`
- Cleanup and honcho preservation:
  - `lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018|15433)\b'`
  - `docker ps --format '{{.Names}} {{.Ports}}'`
- Automated reruns:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run typecheck`
  - `git diff --check`
  - `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx src/test/features/InstallmentsPage.test.tsx src/test/features/SpendingPage.test.tsx src/test/ds/charts.test.tsx src/test/api/contracts.test.ts`
  - `cd backend && DATABASE_URL=sqlite+aiosqlite:////private/tmp/myledge-lane2-test.db API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_loan_mapping_service.py tests/api/test_loan_mapping_api.py tests/services/test_installment_service.py tests/services/test_installment_suggestion_service.py tests/api/test_installments_api.py tests/api/test_installment_suggestions_api.py tests/api/test_schema_api.py`

## Observed Results

- Inbox candidate evidence is sufficient. `task-8-inbox-button-visible.png` visibly contains the loan candidate row and `대출 후보 아님`; `task-8-inbox-button-visible-dom.txt` records `buttonCount: 1`, exact button text, and candidate text.
- Dismiss/restore evidence is sufficient. `f3-real-manual-qa.md` records the browser click removing the row/count, the `review_status=not_candidate` recovery `curl -i`, the restore PATCH returning `review_status:"pending"`, and restored browser state.
- Installment suggestion evidence is sufficient. The pre-link screenshot is visually weak/cropped, but `f3-real-manual-qa.md` records the API and browser observations for suggested 회차 1/2/3. `f3-installments-after-link.png` visibly shows refreshed suggestions, linked `1 / 3회차`, and updated forecast values.
- Spending MoM evidence is sufficient. `f3-spending-mom.png` visibly shows `식비`, `+50.0%`, and `+₩5만`; API evidence records `delta_amount:50000` and `delta_pct:0.5`.
- Cleanup is current and sufficient. `lsof` showed only protected honcho listeners on `127.0.0.1:8000`, `127.0.0.1:6379`, and `127.0.0.1:5432`; no `4174`, `8018`, or `15433`. `docker ps` showed honcho containers preserved and no disposable QA Postgres.
- Automated checks are current and green after the lint fix:
  - frontend lint: exit 0
  - frontend typecheck: exit 0
  - frontend targeted tests: 5 files, 24 tests passed
  - backend targeted tests: 44 passed
  - `git diff --check`: exit 0
- Alembic blocker is resolved by PostgreSQL-specific evidence. `task-8-alembic-postgres-upgrade.md` records disposable Postgres on `127.0.0.1:15433`, `alembic upgrade head` exit 0, and cleanup leaving honcho ports only.

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| L2-S1 | inbox visible `대출 후보 아님` | Browser UI `/data/inbox` screenshot + DOM proof | `view_image .../task-8-inbox-button-visible.png`; `sed -n '1,140p' .../task-8-inbox-button-visible-dom.txt` | PASS | L2-A1, L2-A2 |
| L2-S2 | inbox dismiss/restore | Browser UI + HTTP API evidence | Inspect `f3-real-manual-qa.md` entries for click `대출 후보 아님`, `curl -i ...review_status=not_candidate`, restore PATCH, reload | PASS | L2-A3, L2-A4, L2-A5 |
| L2-S3 | installment suggestion 회차/link/refresh | Browser UI + HTTP API evidence | Inspect `f3-real-manual-qa.md`; `view_image .../f3-installments-after-link.png` | PASS | L2-A3, L2-A6 |
| L2-S4 | spending MoM `+₩5만`, `+50.0%` | Browser UI `/spending` + API evidence | `view_image .../f3-spending-mom.png`; inspect `curl -i .../analytics/category-mom...` transcript | PASS | L2-A3, L2-A7 |
| L2-S5 | cleanup no 4174/8018/15433 and honcho preserved | CLI/Docker | `lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018|15433)\b'`; `docker ps --format '{{.Names}} {{.Ports}}'` | PASS | L2-A8 |
| L2-S6 | automated checks green after lint fix | CLI | `npm run lint`; `npm run typecheck`; targeted frontend tests; targeted backend tests; `git diff --check` | PASS | L2-A9 |
| L2-S7 | Alembic upgrade-head resolution | CLI/Docker | Inspect `task-8-alembic-postgres-upgrade.md` for disposable Postgres and `uv run alembic upgrade head` exit 0 | PASS | L2-A10 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| L2-AQ1 | evidence sufficiency | stale_or_empty_artifact | PASS evidence must be non-empty and inspectable, not just referenced. | PASS | L2-A11 |
| L2-AQ2 | visual proof | misleading_screenshot | Exact visible text must be present or independently proven by DOM/accessibility evidence. | PASS | L2-A1, L2-A2 |
| L2-AQ3 | installment pre-link proof | partial_visual_capture | A cropped/weak screenshot cannot stand alone; API transcript plus post-link browser proof must cover 회차/link/refresh. | PASS | L2-A3, L2-A6 |
| L2-AQ4 | cleanup | leftover_services | Temporary QA listeners and disposable Postgres must be absent after QA; honcho listeners must remain. | PASS | L2-A8 |
| L2-AQ5 | automation | stale_test_summary | Automated green status must be backed by current reruns where feasible. | PASS | L2-A9 |
| L2-AQ6 | migration | wrong_database | Alembic proof must use isolated disposable Postgres, not honcho `127.0.0.1:5432`. | PASS | L2-A10 |

### artifactRefs

| id | kind | description | path |
| --- | --- | --- | --- |
| L2-A1 | screenshot | Inbox candidate row with visible `대출 후보 아님` button | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible.png` |
| L2-A2 | browser DOM/accessibility text | Exact proof of one role button named `대출 후보 아님` and candidate text | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-button-visible-dom.txt` |
| L2-A3 | manual QA transcript | F3 real manual QA: dismiss/restore, installment suggestion/link/refresh, spending MoM, cleanup | `.omo/evidence/loan-installment-candidate-review-workflows/f3-real-manual-qa.md` |
| L2-A4 | screenshot | Inbox after dismiss/default count removed | `.omo/evidence/loan-installment-candidate-review-workflows/f3-inbox-after-click-timeout.png` |
| L2-A5 | screenshot | Inbox after restore with candidate/action visible again | `.omo/evidence/loan-installment-candidate-review-workflows/f3-inbox-after-restore.png` |
| L2-A6 | screenshot | Installments after link with linked `1 / 3회차` row and refreshed suggestions/forecast | `.omo/evidence/loan-installment-candidate-review-workflows/f3-installments-after-link.png` |
| L2-A7 | screenshot | Spending MoM showing `식비`, `+50.0%`, and `+₩5만` | `.omo/evidence/loan-installment-candidate-review-workflows/f3-spending-mom.png` |
| L2-A8 | CLI/Docker transcript | Current cleanup and honcho-preservation checks recorded in this file plus F3/F1 cleanup transcripts | `.omo/evidence/loan-installment-candidate-review-workflows/global-review-lane-2-qa-verification.md` |
| L2-A9 | CLI transcript | Current automated rerun results recorded in this file | `.omo/evidence/loan-installment-candidate-review-workflows/global-review-lane-2-qa-verification.md` |
| L2-A10 | migration transcript | Disposable Postgres Alembic `upgrade head` success and cleanup | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-alembic-postgres-upgrade.md` |
| L2-A11 | artifact size transcript | Non-empty artifact size check recorded in this file | `.omo/evidence/loan-installment-candidate-review-workflows/global-review-lane-2-qa-verification.md` |

## Blockers

None for the requested QA lane.

## Notes

- The integrated QA document still contains an older SQLite Alembic FAIL row, but F1 evidence supersedes it with a PostgreSQL-backed `alembic upgrade head` pass.
- The minimal SQLite browser fixture still has the documented canonical dashboard 500 caveat. It does not block the required target surfaces because the target APIs and UI checks passed.
