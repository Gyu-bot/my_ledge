# Final F3 Manual QA Revalidation: settlement-group-canonical-netting

Verdict: PASS

Date: 2026-06-27
Workspace: `/Users/gyurin/dev/my_ledge`
Branch observed: `codex/settlement-group-canonical-netting`

## Scope

Final F3 revalidation after the test split for settlement-group-canonical-netting.

No product files were edited during this QA pass. Only evidence artifacts under `.omo/evidence/settlement-group-canonical-netting-f3-final/` and this summary file were written.

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| F3-S1 | backend pytest smoke for analytics/transactions/settlement-match/settlement services | backend pytest | `cd backend && env UV_CACHE_DIR=../.uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_settlement_match_service.py` | PASS: 88 passed | A1 |
| F3-S2 | test-client API evidence for settlement-match endpoints | FastAPI ASGI test-client pytest | `cd backend && env UV_CACHE_DIR=../.uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge uv run pytest -vv tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_unlink.py` | PASS: 4 endpoint tests passed | A2 |
| F3-S3 | changed-file ruff format --check | backend ruff formatter | `cd backend && env UV_CACHE_DIR=../.uv-cache uv run ruff format --check app/api/v1/router.py app/models/__init__.py app/services/analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_analytics_service.py alembic/versions/20260627_0029_add_settlement_matches.py app/api/v1/endpoints/settlement_matches.py app/models/settlement_group.py app/schemas/settlement.py app/services/settlement_group_matching.py app/services/settlement_group_service.py app/services/settlement_match_service.py tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_settlement_match_service.py` | PASS: 20 files already formatted | A3 |
| F3-S4 | backend ruff check | backend ruff lint | `cd backend && env UV_CACHE_DIR=../.uv-cache uv run ruff check .` | PASS: all checks passed | A4 |
| F3-S5 | git diff --check | git whitespace checker | `git diff --check` | PASS: exit 0, no whitespace findings | A5 |
| F3-S6 | current honcho/local service classification before live smoke | Docker/listener state | `docker ps --format '{{.Names}} {{.Ports}}'`; `lsof -nP -iTCP -sTCP:LISTEN` | PASS for environment classification: honcho ports are reserved at 127.0.0.1:8000, 6379, 5432; no repo-local My Ledge API listener was started | A6, A7 |
| F3-S7 | live HTTP curl smoke constraint classification | honcho localhost HTTP | sandbox: `curl -i --max-time 20 'http://127.0.0.1:8000/api/v1/analytics/monthly-cashflow?start_date=2026-01-01&end_date=2026-02-28'`; escalated: same command | PASS for classification only: sandbox curl could not connect; escalated curl reached uvicorn but returned `404 Not Found` for My Ledge API route. Current blocker is not reproduced as `InvalidPasswordError`; the active 8000 surface is not serving this My Ledge route. | A8, A9, A10 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| F3-A1 | settlement-match endpoint auth | missing API key | `PUT /api/v1/transactions/{refund_id}/settlement-match` without `X-API-Key` returns 401 and does not establish an unauthorized manual match | PASS | A2 |
| F3-A2 | raw signed transaction preservation | confirmed partial refund | user-confirmed settlement nets analytics expense to 100,000 while `/transactions` still returns raw signed amounts `[80_000, -180_000]` | PASS | A2 |
| F3-A3 | rejected settlement behavior | rejected pair | rejected settlement leaves analytics on raw basis: original expense and refund/cancellation remain separate in monthly cashflow | PASS | A2 |
| F3-A4 | invalid/deleted participant handling | deleted transaction participant | settlement confirmation involving a deleted participant is rejected by the API test surface | PASS | A2 |
| F3-A5 | unlink/manual override removal | delete settlement match | deleting a user-confirmed override restores review-required candidate matches for ambiguous originals | PASS | A2 |
| F3-A6 | settlement service regression edges | matching ambiguity, exclusions, partial/full cancellation regression | settlement group service handles exact full cancellation, partial refund net amount, ambiguous review-required candidates, and edge exclusions across service tests | PASS | A1 |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | terminal transcript | backend pytest smoke; final successful run with 88 passed | `.omo/evidence/settlement-group-canonical-netting-f3-final/backend-pytest-smoke-final.txt` |
| A2 | terminal transcript | settlement-match FastAPI ASGI test-client endpoint evidence; 4 passed with verbose test names | `.omo/evidence/settlement-group-canonical-netting-f3-final/test-client-settlement-match-api-vv.txt` |
| A3 | terminal transcript | changed backend Python files `ruff format --check`; 20 files already formatted | `.omo/evidence/settlement-group-canonical-netting-f3-final/ruff-format-check-changed-files.txt` |
| A4 | terminal transcript | backend `ruff check .`; all checks passed | `.omo/evidence/settlement-group-canonical-netting-f3-final/backend-ruff-check.txt` |
| A5 | terminal transcript | `git diff --check`; exit 0 with no findings | `.omo/evidence/settlement-group-canonical-netting-f3-final/git-diff-check.txt` |
| A6 | terminal transcript | Docker container/port state showing active honcho bindings and no repo-local stack started | `.omo/evidence/settlement-group-canonical-netting-f3-final/docker-ps.txt` |
| A7 | terminal transcript | OS listener state for localhost port classification | `.omo/evidence/settlement-group-canonical-netting-f3-final/lsof-listeners.txt` |
| A8 | terminal transcript | sandboxed `curl -i` to honcho analytics route; localhost connect blocked in sandbox | `.omo/evidence/settlement-group-canonical-netting-f3-final/live-curl-analytics-monthly-cashflow.txt` |
| A9 | terminal transcript | escalated `curl -i` to honcho analytics route; reached uvicorn and returned 404 | `.omo/evidence/settlement-group-canonical-netting-f3-final/live-curl-analytics-monthly-cashflow-escalated.txt` |
| A10 | terminal transcript | escalated `curl -i` to honcho root; reached uvicorn and returned 404 | `.omo/evidence/settlement-group-canonical-netting-f3-final/live-curl-root-escalated.txt` |
| A11 | terminal transcript | initial pytest attempt showing default uv cache permission blocker | `.omo/evidence/settlement-group-canonical-netting-f3-final/backend-pytest-smoke.txt` |
| A12 | terminal transcript | retry showing `DATABASE_URL` settings prerequisite before final env-correct run | `.omo/evidence/settlement-group-canonical-netting-f3-final/backend-pytest-smoke-retry-local-cache.txt` |

## Live PostgreSQL Curl Smoke Classification

The requested "live PostgreSQL curl smoke remains blocked by local credential `InvalidPasswordError` if still true" condition is not currently reproducible as stated.

Observed current state:

- `honcho-api-1` owns `127.0.0.1:8000->8000/tcp`.
- `honcho-database-1` owns `127.0.0.1:5432->5432/tcp`.
- Sandboxed `curl -i` to `127.0.0.1:8000` could not connect.
- Escalated `curl -i` reached uvicorn on `127.0.0.1:8000`, but My Ledge `/api/v1/analytics/monthly-cashflow` returned `404 Not Found`.
- No repo-local My Ledge API listener was started because the honcho bindings must be preserved and the task requested QA only.

Classification: the live PostgreSQL curl smoke is blocked for final F3 under current sandbox/honcho constraints, but the current blocker is active-surface mismatch / reserved honcho port, not a reproduced `InvalidPasswordError`.

The test-client API smoke is sufficient for final F3 because it exercises the actual FastAPI router through ASGITransport, uses the endpoint-level API contract for `PUT` and `DELETE /api/v1/transactions/{transaction_id}/settlement-match`, covers auth and adversarial settlement states, and verifies analytics integration through the same application/service code while isolating the database with the repository's sqlite test fixture. This is the correct final-F3 surface when live honcho services are reserved and must not be mutated.
