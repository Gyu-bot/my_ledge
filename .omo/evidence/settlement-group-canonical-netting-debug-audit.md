# settlement-group-canonical-netting debug audit

Date: 2026-06-27
Branch: `codex/settlement-group-canonical-netting`
HEAD: `b37730d`
Scope: runtime/debug audit only. Product code was not modified.

## Environment evidence

- Surface: Docker port inspection, read-only.
- Invocation: `docker ps --format 'table {{.Names}}\t{{.Ports}}'`
- Result: PASS. Honcho bindings were present and preserved; no Docker or local service was started.
- Observed excerpt:

```text
honcho-api-1        127.0.0.1:8000->8000/tcp
honcho-deriver-1    8000/tcp
honcho-redis-1      127.0.0.1:6379->6379/tcp
honcho-database-1   127.0.0.1:5432->5432/tcp
```

## Hypotheses

### H1 - stale/deleted/merged settlement participant or stale manual match contaminates analytics/reconciliation/capacity

Verdict: PASS.

Distinguishing evidence:

- `backend/app/services/settlement_group_service.py:128-137` loads only non-deleted, non-merged expense transactions for reconciliation.
- `backend/app/services/settlement_group_service.py:154-184` joins confirmed matches back to both transaction rows and requires active canonical participants before analytics netting.
- `backend/app/services/settlement_group_service.py:212-222` filters manual matches to the active transaction basis before reconciliation/capacity allocation.
- `backend/app/services/settlement_match_service.py:193-206` rejects user-confirmed matches whose original or settlement participant is deleted or merged.
- `backend/app/services/settlement_match_service.py:209-253` excludes stale participants while computing other manual allocations, so stale confirmations do not consume capacity.
- Tests covering this risk:
  - `backend/tests/services/test_settlement_group_service_stale_manual.py:41-110`
  - `backend/tests/api/test_settlement_match_api_stale_manual.py:40-199`
  - `backend/tests/api/test_settlement_match_api_errors.py:43-87`

Runtime evidence:

```text
Invocation:
cd backend && UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service_stale_manual.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_analytics_api.py tests/services/test_analytics_service.py -k 'settlement or refund or stale'

Result:
19 passed, 47 deselected, 172 warnings in 0.59s
```

### H2 - analytics GET/read path writes settlement_matches or double-nets with purchase-gate refund logic

Verdict: PASS.

Distinguishing evidence:

- `backend/app/services/analytics_service.py:1119-1128` reads analytics rows, then reads confirmed settlement netting; it does not call reconciliation or create matches.
- `backend/app/services/analytics_service.py:1155-1195` applies one netting transform: original purchase amount is increased by matched refund total, and matched refund rows are excluded.
- `backend/app/services/analytics_service.py:872-904` purchase-gate uses `_purchase_gate_net_amount(row)` on the already settlement-adjusted row and exposes `settlement_refund_total`; it does not re-query raw refund matches.
- Tests assert read-only behavior and no match creation:
  - `backend/tests/services/test_analytics_service.py:206-320`
  - `backend/tests/services/test_analytics_service.py:323-387`
  - `backend/tests/api/test_analytics_api.py:537-608`
  - `backend/tests/api/test_analytics_api.py:671-729`
  - `backend/tests/api/test_analytics_api.py:1032-1095`

Runtime evidence:

```text
Invocation:
cd backend && UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service_stale_manual.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_analytics_api.py tests/services/test_analytics_service.py -k 'settlement or refund or stale'

Result:
19 passed, 47 deselected, 172 warnings in 0.59s
```

### H3 - settlement-match API misses auth/validation/rollback/capacity-overrun/raw transaction preservation

Verdict: PASS.

Distinguishing evidence:

- `backend/app/api/v1/endpoints/settlement_matches.py:15-29` and `:32-47` require `require_api_key` for PUT/DELETE.
- `backend/app/schemas/settlement.py:10-21` constrains request shape and rejects `matched_amount` on rejected matches.
- `backend/app/services/settlement_match_service.py:127-145` validates two distinct expense rows with negative original and positive refund.
- `backend/app/services/settlement_match_service.py:159-190` enforces participant validity, remaining capacity, and required explicit `matched_amount` when full allocation is impossible.
- `backend/app/services/settlement_match_service.py:63-71` and `:101-109` rollback on persistence conflicts and surface HTTP 409.
- `backend/tests/api/test_settlement_match_api.py:43-129` proves auth is required, analytics nets, and raw signed transactions remain unchanged in `/transactions`.
- `backend/tests/api/test_settlement_match_api.py:132-197` proves rejected matches keep analytics on raw basis.
- `backend/tests/services/test_settlement_match_service.py:119-176` proves rollback on persistence conflict.

Runtime evidence:

```text
Invocation:
cd backend && UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db API_KEY=test-api-key uv run pytest tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_match_service.py

Result:
7 passed, 64 warnings in 0.23s
```

## Formatting / diff evidence

```text
Invocation:
git diff --check

Result:
exit 0, no output
```

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| S1 | H1 stale/deleted/merged participant and stale manual match safety | backend pytest service/API contracts | `cd backend && UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service_stale_manual.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_analytics_api.py tests/services/test_analytics_service.py -k 'settlement or refund or stale'` | PASS | A1 |
| S2 | H2 analytics GET/read path read-only and settlement-netted analysis | backend pytest service/API contracts | `cd backend && UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service_stale_manual.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_analytics_api.py tests/services/test_analytics_service.py -k 'settlement or refund or stale'` | PASS | A1 |
| S3 | H3 settlement-match API auth/validation/rollback/capacity/raw preservation | backend pytest API/service contracts | `cd backend && UV_CACHE_DIR=../.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db API_KEY=test-api-key uv run pytest tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_match_service.py` | PASS | A2 |
| S4 | workspace whitespace safety | git diff check | `git diff --check` | PASS | A3 |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
| --- | --- | --- | --- | --- | --- |
| A-H1-1 | H1 | stale manual match with deleted original/refund or merged original/refund | Reconciliation ignores stale manual match for snapshots/netting without deleting raw manual evidence. | PASS | A1 |
| A-H1-2 | H1 | stale confirmed refund consumes future capacity | Deleted/merged stale refund does not block a later active refund from being user-confirmed against the same original. | PASS | A1 |
| A-H2-1 | H2 | analytics read path creates settlement_matches | Analytics GET/service calls leave `settlement_matches` count unchanged. | PASS | A1 |
| A-H2-2 | H2 | purchase-gate double-netting | Purchase-gate and analytics use the adjusted row with `settlement_refund_total`, not an additional raw refund pass. | PASS | A1 |
| A-H3-1 | H3 | unauthenticated settlement-match write | PUT without API key returns 401 and does not create a valid manual match. | PASS | A2 |
| A-H3-2 | H3 | invalid/deleted participant confirmation | API returns 422 with canonical participant error. | PASS | A2 |
| A-H3-3 | H3 | persistence conflict during manual upsert | Service rolls back and raises HTTP 409. | PASS | A2 |
| A-H3-4 | H3 | raw signed transaction mutation | `/transactions` still returns original signed rows after settlement confirmation. | PASS | A2 |

### artifactRefs

| id | kind | description | path |
| --- | --- | --- | --- |
| A1 | command transcript | Pytest transcript for stale/manual/analytics filtered runtime audit: `19 passed, 47 deselected, 172 warnings in 0.59s`. | `.omo/evidence/settlement-group-canonical-netting-debug-audit.md` |
| A2 | command transcript | Pytest transcript for settlement-match API/service audit: `7 passed, 64 warnings in 0.23s`. | `.omo/evidence/settlement-group-canonical-netting-debug-audit.md` |
| A3 | command transcript | `git diff --check` exited 0 with no output. | `.omo/evidence/settlement-group-canonical-netting-debug-audit.md` |
| A4 | command transcript | Docker read-only port inspection confirmed honcho bindings were present and no local service was started. | `.omo/evidence/settlement-group-canonical-netting-debug-audit.md` |

## Remaining risk

- Live `curl -i` against a running FastAPI server was not executed because the audit instruction explicitly forbids starting Docker/local services and honcho `127.0.0.1:8000` must be preserved. API contract coverage was exercised through existing async HTTP client tests instead.
- Pytest emitted Python 3.14 `pytest_asyncio` deprecation warnings; no settlement behavior failure was observed.
