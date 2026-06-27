# settlement-group-canonical-netting Global QA Review

Verdict: PASS

Scope: hands-on QA execution for backend settlement-group-canonical-netting in `/Users/gyurin/dev/my_ledge`.

Live curl note: I did not start or modify local services. `honcho-api-1` already owns `127.0.0.1:8000->8000/tcp`, and the live HTTP surface on that port is Honcho API, not My Ledge. Because the active service is a port/surface mismatch, the My Ledge API behavior is verified through FastAPI test-client API tests plus service-level tests. That is sufficient for this review because the focused smoke drives the changed route handlers, auth behavior, analytics endpoints, and settlement services against isolated test DB fixtures without touching honcho.

## Commands

```bash
# full backend pytest
cd /Users/gyurin/dev/my_ledge/backend
UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db uv run pytest

# focused settlement API/service smoke
cd /Users/gyurin/dev/my_ledge/backend
UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db uv run pytest tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_settlement_group_service_stale_manual.py tests/services/test_settlement_match_service.py tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_settlement_match_api_unlink.py tests/api/test_analytics_api.py -k 'settlement or refund'

# ruff check
cd /Users/gyurin/dev/my_ledge/backend
UV_CACHE_DIR=../.uv-cache uv run ruff check .

# changed-file ruff format check
cd /Users/gyurin/dev/my_ledge/backend
UV_CACHE_DIR=../.uv-cache uv run ruff format --check app/api/v1/router.py app/models/__init__.py app/services/analytics_service.py alembic/versions/20260627_0029_add_settlement_matches.py app/api/v1/endpoints/settlement_matches.py app/models/settlement_group.py app/schemas/settlement.py app/services/settlement_group_matching.py app/services/settlement_group_service.py app/services/settlement_match_service.py tests/api/test_analytics_api.py tests/api/test_schema_api.py tests/api/test_transactions_api.py tests/services/test_analytics_service.py tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_settlement_group_service_stale_manual.py tests/services/test_settlement_match_service.py

# git diff check
cd /Users/gyurin/dev/my_ledge
git diff --check

# live surface probes, read-only
cd /Users/gyurin/dev/my_ledge
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
lsof -nP -iTCP:8000 -sTCP:LISTEN
curl -i http://127.0.0.1:8000/health
curl -i http://127.0.0.1:8000/openapi.json
curl -s http://127.0.0.1:8000/openapi.json | python3 -c 'import json, sys; data=json.load(sys.stdin); paths=data.get("paths", {}); print("title=" + data.get("info", {}).get("title", "")); print("settlement_path_present=" + str(any("settlement" in path for path in paths))); print("path_count=" + str(len(paths)))'

# docs contract smoke
cd /Users/gyurin/dev/my_ledge
rg -n "settlement|raw signed|netted|raw amount|rewrit" docs/backend-api-ssot.md docs/backend-api-and-metrics-reference.md docs/agents/canonical-read-surface-reference.md
```

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| S1 | Full backend pytest | pytest backend suite | `cd backend && UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db uv run pytest` | PASS: `260 passed` | A1 |
| S2 | Focused settlement API/service smoke | FastAPI test-client plus service pytest | `cd backend && UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db uv run pytest tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_settlement_group_service_stale_manual.py tests/services/test_settlement_match_service.py tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_settlement_match_api_unlink.py tests/api/test_analytics_api.py -k 'settlement or refund'` | PASS: `34 passed, 22 deselected` | A2 |
| S3 | Ruff check | backend linter | `cd backend && UV_CACHE_DIR=../.uv-cache uv run ruff check .` | PASS: `All checks passed!` | A4 |
| S4 | Changed-file ruff format | ruff formatter check over changed Python files | `cd backend && UV_CACHE_DIR=../.uv-cache uv run ruff format --check ...` with 23 changed/new Python files listed in Commands | PASS: `23 files already formatted` | A5 |
| S5 | Git diff check | git whitespace/conflict marker check | `git diff --check` | PASS: exit code `0` | A6 |
| S6 | Live HTTP feasibility | `curl -i` against active localhost service | `curl -i http://127.0.0.1:8000/health`; `curl -i http://127.0.0.1:8000/openapi.json`; compact OpenAPI parse command listed above | PASS with limitation: service is reachable only with unsandboxed localhost probe, but it is Honcho API and has no settlement path, so live My Ledge curl is blocked by honcho port/surface mismatch | A7, A8, A9, A10 |
| S7 | Docs contract smoke | ripgrep docs contract | `rg -n "settlement|raw signed|netted|raw amount|rewrit" docs/backend-api-ssot.md docs/backend-api-and-metrics-reference.md docs/agents/canonical-read-surface-reference.md` | PASS: docs mention settlement statuses, raw signed preservation, netted analytics surfaces, and no raw amount rewrite claim | A11 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| A-1 | Full refund canonical netting | exact full cancellation | original payment plus equal positive refund nets to zero while raw signed rows remain preserved | PASS | A2 |
| A-2 | Partial refund canonical netting | partial refund | analytics consumes confirmed settlement at net amount and does not double-net purchase review candidates | PASS | A2 |
| A-3 | Multiple partial refunds | allocation edge | multiple refund rows allocate deterministically without exceeding original/refund capacities | PASS | A2 |
| A-4 | Ambiguous original candidates | ambiguous match | multiple candidate originals must remain `review_required`, not `auto_confirmed` | PASS | A2 |
| A-5 | Rejected settlement | user rejection | rejected match stays on raw signed basis in analytics | PASS | A2 |
| A-6 | Read-only analytics | accidental write on read | analytics reads must not create/update settlement matches | PASS | A2 |
| A-7 | Deleted/merged participant | stale canonical participant | confirmed matches are ignored when either side leaves canonical analytics basis | PASS | A2 |
| A-8 | Write auth | missing API key | settlement write endpoint requires API key and preserves raw signed transactions | PASS | A2 |
| A-9 | Live curl mismatch | honcho port/surface conflict | do not start/replace honcho; record that 8000 serves Honcho API and rely on test-client API smoke for My Ledge branch | PASS | A7, A8, A9, A10 |
| A-10 | Formatter/lint drift | changed file formatting | changed Python files remain ruff-formatted and lint-clean | PASS | A4, A5 |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | pytest transcript | full backend suite, `260 passed` | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/full-backend-pytest.log` |
| A2 | pytest transcript | focused settlement API/service smoke, `34 passed` | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/focused-settlement-api-service-smoke.log` |
| A3 | tool failure transcript | first `uv run ruff check .` failed because sandbox could not open `/Users/gyurin/.cache/uv`; retried with repo-local `UV_CACHE_DIR` | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/backend-ruff-check.log` |
| A4 | ruff transcript | backend `ruff check .` with repo-local uv cache | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/backend-ruff-check-retry-local-cache.log` |
| A5 | ruff transcript | changed Python file `ruff format --check` | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/changed-python-ruff-format-check.log` |
| A6 | git transcript | `git diff --check` with explicit exit code | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/git-diff-check-with-exit-code.log` |
| A7 | service state transcript | escalated read-only `docker ps` showing active honcho bindings preserved | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/docker-ps-before-live-curl-escalated.log` |
| A8 | service state transcript | `lsof` showing listener on `127.0.0.1:8000` | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/lsof-port-8000-before-live-curl.log` |
| A9 | curl transcript | `curl -i /health` against active localhost service, `200 OK` under unsandboxed localhost probe | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/live-curl-health-escalated.log` |
| A10 | curl parsed transcript | OpenAPI compact check: `title=Honcho API`, `settlement_path_present=False` | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/live-curl-openapi-compact-surface-check.log` |
| A11 | docs grep transcript | settlement/raw signed/netted docs contract hits | `.omo/evidence/settlement-group-canonical-netting-global-qa-review/docs-contract-rg.log` |
