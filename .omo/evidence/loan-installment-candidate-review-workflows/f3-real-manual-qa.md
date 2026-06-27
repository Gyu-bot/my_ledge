# F3 Real Manual QA Re-drive

Date: 2026-06-27
Verdict: confirmed
Plan: `.omo/plans/loan-installment-candidate-review-workflows.md`

## Surface And Invocation

- Safety inspection:
  - `docker ps --format '{{.Names}} {{.Ports}}'`
  - `lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018)\b'`
- Isolated fixture:
  - `cd backend && DATABASE_URL=sqlite+aiosqlite:////Users/gyurin/dev/my_ledge/.omo/evidence/loan-installment-candidate-review-workflows/task-8-browser-qa.db API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run python ../.omo/evidence/loan-installment-candidate-review-workflows/task-8-seed-db.py`
- QA services:
  - Backend: `DATABASE_URL=sqlite+aiosqlite:////Users/gyurin/dev/my_ledge/.omo/evidence/loan-installment-candidate-review-workflows/task-8-browser-qa.db API_KEY=test-api-key CORS_ORIGINS=http://127.0.0.1:4174 UV_CACHE_DIR=.uv-cache uv run uvicorn app.main:app --host 127.0.0.1 --port 8018`
  - Frontend: `VITE_PROXY_TARGET=http://127.0.0.1:8018 VITE_API_KEY=test-api-key npm run dev -- --host 127.0.0.1 --port 4174`
- HTTP probes:
  - `curl -i 'http://127.0.0.1:8018/api/v1/loan-transaction-links?linked=unlinked&page=1&per_page=20'`
  - `curl -i 'http://127.0.0.1:8018/api/v1/installment-transaction-suggestions?page=1&per_page=40'`
  - `curl -i 'http://127.0.0.1:8018/api/v1/analytics/category-mom?start_date=2026-05-01&end_date=2026-06-30&type=%EC%A7%80%EC%B6%9C'`
  - `curl -i 'http://127.0.0.1:8018/api/v1/loan-transaction-links?linked=unlinked&review_status=not_candidate&page=1&per_page=20'`
  - `curl -i -X PATCH 'http://127.0.0.1:8018/api/v1/loan-transaction-links/1/review' -H 'Content-Type: application/json' -H 'X-API-Key: test-api-key' --data '{"review_status":"pending"}'`
  - `curl -i 'http://127.0.0.1:8018/api/v1/installment-transaction-suggestions?page=1&per_page=40'`
  - `curl -i 'http://127.0.0.1:8018/api/v1/installment-transaction-links?linked=linked&page=1&per_page=40'`
- Browser UI:
  - Codex in-app browser `goto('http://127.0.0.1:4174/data/inbox')`
  - Click unique button `대출 후보 아님`
  - Reload `http://127.0.0.1:4174/data/inbox` after restore API
  - Codex in-app browser `goto('http://127.0.0.1:4174/data/installments')`, click tab `거래 연결`, click first `애플 추천 연결`
  - Codex in-app browser `goto('http://127.0.0.1:4174/spending?from=2026-05&to=2026-06')`

## Observed Results

- Initial loan candidate API returned `total:1` with `merchant:"국민은행 대출이자 QA"`.
- `/data/inbox` showed `전체 1`, `대출 연결 1`, candidate `국민은행 대출이자 QA`, and visible action `대출 후보 아님`.
- Clicking `대출 후보 아님` changed the inbox to `전체 0`, `대출 연결 0`; candidate/action no longer appeared in rendered body text.
- Recovery filter returned `total:1`; restore API returned `review_status:"pending"`; browser reload again showed `전체 1`, `대출 연결 1`, candidate, and action.
- Initial installment suggestion API returned `total:3` with suggested installment numbers `1`, `2`, and `3`; first row had `confidence:"high"` and reasons `same_merchant`, `similar_amount`, `same_billing_day`, `same_payment_method`.
- `/data/installments` tab `거래 연결` showed `추천 연결 제안`, `제안 회차`, `1회차`, `높음`, and the same reason labels.
- Clicking the first `애플 추천 연결` created a link. Post-link API showed suggestions `total:2` and linked list `total:1` with `transaction_id:2`, `installment_number:1`. Browser showed linked row `QA 맥북 3개월 할부` and `1 / 3회차`, with forecast values `잔여 예정 ₩20만`, `누락 ₩10만`.
- `/spending?from=2026-05&to=2026-06` showed `카테고리 전월 대비`, `식비`, signed delta `+₩5만`, and scaled percent `+50.0%`. API value was `delta_amount:50000`, `delta_pct:0.5`.
- Browser/server caveat repeated from todo 8: the minimal SQLite fixture triggers `GET /api/v1/canonical-views/dashboard` 500 because `vw_monthly_cashflow` is not present. This did not block target UI/API checks and did not use honcho Postgres.

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| F3-S1 | Check 1 | Browser UI `/data/inbox` | Codex in-app browser `goto('http://127.0.0.1:4174/data/inbox')` | PASS | F3-A1 |
| F3-S2 | Check 2 dismiss | Browser UI `/data/inbox` | Click unique button `대출 후보 아님` | PASS | F3-A2 |
| F3-S3 | Check 2 recovery/restore | HTTP API + Browser UI | `curl -i ...review_status=not_candidate`; `curl -i -X PATCH .../loan-transaction-links/1/review`; browser reload | PASS | F3-A3, F3-A4 |
| F3-S4 | Check 3 display | Browser UI `/data/installments` | `goto('http://127.0.0.1:4174/data/installments')`, click tab `거래 연결` | PASS | F3-A5 |
| F3-S5 | Check 3 link/refresh | Browser UI + HTTP API | Click first `애플 추천 연결`; `curl -i ...installment-transaction-links?linked=linked` | PASS | F3-A6 |
| F3-S6 | Check 4 | Browser UI `/spending` | `goto('http://127.0.0.1:4174/spending?from=2026-05&to=2026-06')` | PASS | F3-A7 |
| F3-S7 | Cleanup receipts | CLI | `lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018)\b'`; `docker ps --format '{{.Names}} {{.Ports}}'` | PASS | F3-A8 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| F3-AQ1 | Preserve honcho services | port_conflict | Inspect Docker/listeners before QA; avoid `8000`, `5432`, `6379`; use isolated `8018`/`4174`. | PASS | F3-A8 |
| F3-AQ2 | Avoid operational DB mutation | operational_db_mutation | Use only `.omo/evidence/.../task-8-browser-qa.db`; do not connect to honcho Postgres. | PASS | F3-A9 |
| F3-AQ3 | Reject stale evidence | stale_browser_state | Re-seed fixture and perform fresh browser click/link actions instead of relying on screenshots from todo 8. | PASS | F3-A1, F3-A2, F3-A5, F3-A6, F3-A7 |
| F3-AQ4 | Recovery path | irreversible_dismissal | Dismissed candidate must appear under recovery filter and restore to pending. | PASS | F3-A3, F3-A4 |
| F3-AQ5 | Suggestion side effect | stale_refresh_after_link | Linking a suggestion must remove it from suggestions and add a linked row with proposed installment number. | PASS | F3-A6 |
| F3-AQ6 | Known fixture limitation | unrelated_fixture_500 | Canonical dashboard 500 from missing SQLite views must not be treated as success for target criteria or as operational DB failure. | PASS | F3-A8 |
| F3-AQ7 | Cleanup | leftover_services | Stop QA Vite/FastAPI; verify no listeners on `4174` or `8018`; honcho listeners remain. | PASS | F3-A8 |

### artifactRefs

| id | kind | description | path |
| --- | --- | --- | --- |
| F3-A1 | screenshot | Inbox before dismiss: candidate row and `대출 후보 아님` visible | `.omo/evidence/loan-installment-candidate-review-workflows/f3-inbox-before-dismiss.png` |
| F3-A2 | screenshot | Inbox after click: default row/count removed (`전체 0`, `대출 연결 0`) | `.omo/evidence/loan-installment-candidate-review-workflows/f3-inbox-after-click-timeout.png` |
| F3-A3 | HTTP transcript | Recovery filter returned dismissed candidate; exact output in current run terminal transcript | `.omo/evidence/loan-installment-candidate-review-workflows/f3-real-manual-qa.md` |
| F3-A4 | screenshot | Inbox after restore: candidate and action visible again | `.omo/evidence/loan-installment-candidate-review-workflows/f3-inbox-after-restore.png` |
| F3-A5 | screenshot | Installment suggestions before link with proposed 회차/reasons/confidence | `.omo/evidence/loan-installment-candidate-review-workflows/f3-installments-before-link.png` |
| F3-A6 | screenshot | Installments after link with linked row and refreshed forecast | `.omo/evidence/loan-installment-candidate-review-workflows/f3-installments-after-link.png` |
| F3-A7 | screenshot | Spending MoM signed delta and scaled percent | `.omo/evidence/loan-installment-candidate-review-workflows/f3-spending-mom.png` |
| F3-A8 | CLI transcript | Safety and cleanup command outputs recorded in current run terminal transcript | `.omo/evidence/loan-installment-candidate-review-workflows/f3-real-manual-qa.md` |
| F3-A9 | fixture | Isolated SQLite browser QA DB used for F3 | `.omo/evidence/loan-installment-candidate-review-workflows/task-8-browser-qa.db` |

## Cleanup Receipt

QA browser tab was closed. Vite `127.0.0.1:4174` and FastAPI `127.0.0.1:8018` were stopped.

Final listener check:

```text
Invocation: lsof -nP -iTCP -sTCP:LISTEN | rg ':(8000|5432|6379|4174|8018)\b'
Result:
com.docke ... TCP 127.0.0.1:8000 (LISTEN)
com.docke ... TCP 127.0.0.1:6379 (LISTEN)
com.docke ... TCP 127.0.0.1:5432 (LISTEN)
```

Final Docker check:

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
