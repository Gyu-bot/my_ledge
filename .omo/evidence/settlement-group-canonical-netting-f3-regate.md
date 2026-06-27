# F3 Manual QA Regate - settlement-group-canonical-netting

Verdict: **FAIL**

Reason: backend service/API pytest smoke, changed-file format check, backend ruff check, and git diff whitespace check passed. However, the requested live HTTP `curl -i` smoke could not run because the specified PostgreSQL URL `postgresql+asyncpg://user:pass@localhost:5432/my_ledge` failed authentication during `alembic upgrade head`. Since the new process-backed API surface could not start against the requested DB prerequisite, F3 cannot be marked PASS.

## Environment

- Repo: `/Users/gyurin/dev/my_ledge`
- Branch: `codex/settlement-group-canonical-netting`
- Required env used: `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key`
- Docker/services: no Docker containers were started or changed.
- Port inspection confirmed active honcho bindings: `honcho-api-1 127.0.0.1:8000->8000/tcp`, `honcho-redis-1 127.0.0.1:6379->6379/tcp`, `honcho-database-1 127.0.0.1:5432->5432/tcp`, `honcho-deriver-1 8000/tcp`.

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| F3-S1 | settlement model/service, full/partial/multiple refunds, ambiguous review_required, deleted/merged guard | backend pytest service/API smoke | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_match_service.py tests/services/test_analytics_service.py tests/api/test_settlement_match_api.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py -q` | PASS | A1 |
| F3-S2 | changed-file formatting for 17 backend Python files | ruff format | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run ruff format --check app/api/v1/router.py app/models/__init__.py app/services/analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_analytics_service.py alembic/versions/20260627_0029_add_settlement_matches.py app/api/v1/endpoints/settlement_matches.py app/models/settlement_group.py app/schemas/settlement.py app/services/settlement_group_matching.py app/services/settlement_group_service.py app/services/settlement_match_service.py tests/api/test_settlement_match_api.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_match_service.py` | PASS | A2 |
| F3-S3 | backend lint | ruff check | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run ruff check .` | PASS | A3 |
| F3-S4 | repository whitespace/checksum hygiene | git diff check | `git diff --check` | PASS | A4 |
| F3-S5 | honcho port conflict guard | Docker/listener inspection | `docker ps --format 'table {{.Names}}\t{{.Ports}}'` and `lsof -nP -iTCP -sTCP:LISTEN` | PASS | A5, A6 |
| F3-S6 | live HTTP new settlement-match API via faithful HTTP channel | migration prerequisite for temporary FastAPI + `curl -i` smoke | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run alembic upgrade head` | FAIL | A7 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| F3-A1 | full refund | exact full cancellation | confirmed full refund nets original spend to zero in analysis without rewriting raw rows | PASS | A1 |
| F3-A2 | partial refund | partial settlement | confirmed partial refund lowers analysis spend by refund amount | PASS | A1 |
| F3-A3 | multiple refunds | aggregated settlement refunds | multiple partial refunds aggregate into one net spend basis | PASS | A1 |
| F3-A4 | ambiguous review_required | multiple original candidates | ambiguous refund candidates are marked `review_required`, not auto-confirmed | PASS | A1 |
| F3-A5 | confirm/reject/unlink API | manual override paths | `PUT` confirms or rejects, `DELETE` removes override and restores review-required candidates | PASS | A1 |
| F3-A6 | deleted/merged guard | noncanonical participants | deleted or merged participants are excluded/rejected from confirmed canonical analytics netting | PASS | A1 |
| F3-A7 | read-only analytics | analytics side effects | analytics reads do not create or mutate settlement matches | PASS | A1 |
| F3-A8 | raw signed transactions | raw transaction surface | transaction list preserves signed purchase/refund rows after settlement analysis | PASS | A1 |
| F3-A9 | purchase-gate no double-net | duplicate netting prevention | purchase-gate candidates use shared settlement net amount without double-netting refunds | PASS | A1 |
| F3-A10 | faithful HTTP channel | process-backed HTTP smoke with `curl -i` | temporary FastAPI should start against requested DB, then `curl -i` should exercise settlement-match API | FAIL | A7 |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | command-log | pytest smoke: 88 passed, covers settlement services, analytics API, transactions API, settlement-match API | `.omo/evidence/settlement-group-canonical-netting-f3-regate/pytest-smoke.log` |
| A2 | command-log | ruff format check for the 17 changed backend Python files: `17 files already formatted` | `.omo/evidence/settlement-group-canonical-netting-f3-regate/ruff-format-17-files.log` |
| A3 | command-log | backend ruff check: `All checks passed!` | `.omo/evidence/settlement-group-canonical-netting-f3-regate/ruff-check.log` |
| A4 | command-log | `git diff --check` invocation and exit code 0 | `.omo/evidence/settlement-group-canonical-netting-f3-regate/git-diff-check-status.log` |
| A5 | command-log | Docker port inspection showing honcho bindings and no service changes | `.omo/evidence/settlement-group-canonical-netting-f3-regate/docker-ports.log` |
| A6 | command-log | OS listener inspection before local API smoke | `.omo/evidence/settlement-group-canonical-netting-f3-regate/listening-ports.log` |
| A7 | command-log | failed migration prerequisite for requested PostgreSQL URL; `InvalidPasswordError: password authentication failed for user "user"` | `.omo/evidence/settlement-group-canonical-netting-f3-regate/alembic-upgrade-head.log` |

## Notes

- No product code was changed.
- The pytest smoke used in-repo async API fixtures and passed all settlement-specific API/service assertions.
- The final verdict remains FAIL because the requested live PostgreSQL-backed HTTP smoke could not run with the provided credentials.
