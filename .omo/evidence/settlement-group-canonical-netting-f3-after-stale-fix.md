# F3 Smoke Revalidation: settlement-group-canonical-netting after stale manual-match fix

Date: 2026-06-27
Workspace: `/Users/gyurin/dev/my_ledge`
Branch: `codex/settlement-group-canonical-netting`
Commit: `b37730d42ed04b7688430851a4c95d9751e9956e`
Verdict: PASS

## Environment Observation

Surface: Docker container/port inventory before backend smoke.

Invocation:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Sandboxed attempt was blocked by Docker socket permissions, then the same read-only command was rerun with elevated Docker socket access.

Observed active bindings:

```text
NAMES               PORTS
kinlayer-web        0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp
kinlayer-api        0.0.0.0:8765->8765/tcp, [::]:8765->8765/tcp
kinlayer-postgres   127.0.0.1:15432->5432/tcp
honcho-api-1        127.0.0.1:8000->8000/tcp
honcho-deriver-1    8000/tcp
honcho-redis-1      127.0.0.1:6379->6379/tcp
honcho-database-1   127.0.0.1:5432->5432/tcp
```

No Docker/service changes were made.

## Command Evidence

### Backend pytest smoke

Surface: backend service/API tests for analytics, transactions, settlement match API, settlement group service, and settlement match service.

Invocation:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/api/test_settlement_match_api*.py tests/services/test_settlement_group_service*.py tests/services/test_settlement_match_service.py -q
```

Result:

```text
........................................................................ [ 75%]
.......................                                                  [100%]
95 passed, 857 warnings in 2.49s
```

Warnings were pytest-asyncio/Python 3.14 deprecations plus one Starlette HTTP status deprecation in `analytics_service.py`; no failures.

### Ruff check

Surface: backend lint.

Invocation:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .
```

Result:

```text
All checks passed!
```

### Changed-file ruff format check

Surface: settlement-related changed backend Python files.

Invocation:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff format --check app/api/v1/router.py app/models/__init__.py app/services/analytics_service.py app/api/v1/endpoints/settlement_matches.py app/models/settlement_group.py app/schemas/settlement.py app/services/settlement_group_matching.py app/services/settlement_group_service.py app/services/settlement_match_service.py alembic/versions/20260627_0029_add_settlement_matches.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_analytics_service.py tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_settlement_group_service_stale_manual.py tests/services/test_settlement_match_service.py
```

Result:

```text
22 files already formatted
```

### Git diff whitespace check

Surface: repository diff hygiene.

Invocation:

```bash
git diff --check
```

Result:

```text
exit code 0; no output
```

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| F3-S1 | F3 smoke, backend settlement/analytics regression | backend pytest | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/api/test_settlement_match_api*.py tests/services/test_settlement_group_service*.py tests/services/test_settlement_match_service.py -q` | PASS | `A1` |
| F3-S2 | Backend lint gate | backend ruff | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .` | PASS | `A1` |
| F3-S3 | Settlement changed-file formatting gate | backend ruff format | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff format --check app/api/v1/router.py app/models/__init__.py app/services/analytics_service.py app/api/v1/endpoints/settlement_matches.py app/models/settlement_group.py app/schemas/settlement.py app/services/settlement_group_matching.py app/services/settlement_group_service.py app/services/settlement_match_service.py alembic/versions/20260627_0029_add_settlement_matches.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_analytics_service.py tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_settlement_group_service_stale_manual.py tests/services/test_settlement_match_service.py` | PASS | `A1` |
| F3-S4 | Diff hygiene gate | git diff | `git diff --check` | PASS | `A1` |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| F3-A1 | Stale manual-match fix | stale manual settlement match API/service regressions | stale manual matches are rejected/handled by the settlement match API and service tests without corrupting current settlement state | PASS | `A1` |
| F3-A2 | Ambiguous or rejected settlement behavior | review-required/rejected settlement group edge cases | ambiguous settlement candidates do not auto-confirm, rejected settlement basis remains stable, and analytics tests still pass | PASS | `A1` |
| F3-A3 | Formatting/lint regression | changed settlement files introduce style/lint drift | ruff check and changed-file format check remain clean | PASS | `A1` |
| F3-A4 | Whitespace conflict artifact | diff contains trailing whitespace or conflict-marker-like whitespace errors | `git diff --check` exits 0 with no output | PASS | `A1` |

### artifactRefs

| id | kind | description | path |
| --- | --- | --- | --- |
| A1 | markdown evidence | Command invocations, observed outputs, manual QA matrix, and PASS verdict for F3 stale manual-match revalidation | `.omo/evidence/settlement-group-canonical-netting-f3-after-stale-fix.md` |
