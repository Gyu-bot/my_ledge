# settlement-group-canonical-netting global security review

Verdict: `PASS`

## Scope analyzed

- Write endpoints:
  - `backend/app/api/v1/endpoints/settlement_matches.py`
- Write-path services and persistence:
  - `backend/app/services/settlement_match_service.py`
  - `backend/app/services/settlement_group_service.py`
  - `backend/app/services/settlement_group_matching.py`
  - `backend/app/schemas/settlement.py`
  - `backend/app/models/settlement_group.py`
  - `backend/alembic/versions/20260627_0029_add_settlement_matches.py`
- Supporting auth/runtime contract:
  - `backend/app/core/security.py`
  - `backend/app/services/analytics_service.py`
- Evidence/docs checked for sensitive data leakage:
  - `docs/backend-api-ssot.md`
  - `docs/backend-api-and-metrics-reference.md`
  - `docs/agents/canonical-read-surface-reference.md`
  - `.omo/evidence/settlement-group-canonical-netting*`

Threat-model calibration used for this review:

- This repository is a personal finance app, not a multi-tenant SaaS surface.
- Settlement write routes are privileged mutation surfaces behind a single shared `X-API-Key`.
- Analytics reads are intentionally unauthenticated/read-only in the current repo contract.

## Findings

No reportable security findings were confirmed in the reviewed settlement write scope.

### Evidence by requested concern

1. API key enforcement: confirmed
   - Both settlement write routes declare `Depends(require_api_key)` at `backend/app/api/v1/endpoints/settlement_matches.py:15-19` and `:32-35`.
   - The shared guard returns `401` on mismatch and `500` when the key is unset at `backend/app/core/security.py:8-21`.
   - Negative-path API coverage exists in `backend/tests/api/test_settlement_match_api.py:43-129`, including an unauthenticated `PUT` returning `401`.

2. Auth bypass / IDOR in personal-app context: not confirmed
   - The service resolves both transaction ids from storage and fails closed on missing rows at `backend/app/services/settlement_match_service.py:27-35` and `:112-124`.
   - There is no per-user ownership check, but this repo has no multi-user object boundary in the reviewed surface. Within the documented personal-app threat model, this is not an IDOR.

3. Input validation: confirmed adequate for reviewed scope
   - Request schema restricts `original_transaction_id >= 1`, `matched_amount > 0`, and forbids `matched_amount` on `rejected` at `backend/app/schemas/settlement.py:10-21`.
   - Pair-shape validation rejects self-links, non-expense rows, and wrong sign combinations at `backend/app/services/settlement_match_service.py:127-145`.
   - Deleted/merged participants are blocked for confirmed matches at `backend/app/services/settlement_match_service.py:193-206`.
   - Regression coverage exists for deleted participants and malformed/noncanonical inputs in `backend/tests/api/test_settlement_match_api_errors.py:43-87` and `backend/tests/services/test_settlement_group_service_regression_edges.py:60-270`.

4. Over-allocation: no reportable vulnerability confirmed
   - Application logic prevents ordinary over-allocation by computing remaining original/refund capacity before accepting `matched_amount` at `backend/app/services/settlement_match_service.py:159-190` and by excluding already allocated confirmed amounts in `:209-253`.
   - The table only enforces pair uniqueness, not aggregate allocation ceilings, at `backend/app/models/settlement_group.py:20-31`.
   - Residual risk: concurrent privileged writers sharing the same API key could theoretically race these reads because there is no row-level lock or DB-level aggregate constraint. In the current single-principal/personal-app model, that is a same-principal integrity/correctness risk, not a reportable authz or privilege-escalation finding.

5. Stale/deleted participant abuse: not confirmed
   - Automatic matching uses only lifecycle-safe transactions at `backend/app/services/settlement_group_service.py:28-32` and `:221-224`.
   - Confirmed analytics netting ignores deleted/merged participants at `backend/app/services/settlement_group_service.py:154-184`.
   - Regression coverage exists for stale purchase/refund exclusion and noncanonical participant suppression in `backend/tests/services/test_settlement_group_service_regression_edges.py:60-132` and `:211-270`.

6. Transaction rollback / partial-write behavior: acceptable in reviewed scope
   - Settlement upsert/delete catches `IntegrityError`, rolls back, and returns `409` at `backend/app/services/settlement_match_service.py:63-71` and `:101-109`.
   - Service-level regression explicitly verifies rollback on persistence conflict in `backend/tests/services/test_settlement_match_service.py:119-176`.
   - The current analytics read path is calculation-only and no longer triggers settlement writes; `_load_analytics_transactions()` reads netting state through `build_confirmed_settlement_analysis_netting()` at `backend/app/services/analytics_service.py:1097-1128`.

7. Sensitive data in docs/evidence / secret leakage: not confirmed
   - Reviewed touched docs describe API-key requirements and raw-vs-netted behavior but do not embed secrets.
   - Regex review across `docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`, `docs/agents/canonical-read-surface-reference.md`, and `.omo/evidence/settlement-group-canonical-netting*` found no raw API keys, bearer tokens, private keys, or connection strings with real credentials.
   - The checked log excerpt in `.omo/evidence/settlement-group-canonical-netting-f3-regate/alembic-upgrade-head.log:110-120` only exposes the placeholder username `user` in an auth failure and does not leak a password or token.

## Validation performed

Source review:

- Endpoint auth boundary, request schema, pair-shape validation, capacity checks, stale/deleted filters, and analytics read-path behavior were traced directly in the files listed above.

Runtime validation:

- Initial pytest attempt failed at import time because `DATABASE_URL` was unset in settings bootstrap. This was an environment precondition, not a product finding.
- Re-run command:

```bash
env DATABASE_URL=sqlite+aiosqlite:////private/tmp/my_ledge-security-review.db \
    API_KEY=test-api-key \
    UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
    uv run pytest \
    tests/api/test_settlement_match_api.py \
    tests/api/test_settlement_match_api_errors.py \
    tests/api/test_settlement_match_api_stale_manual.py \
    tests/api/test_settlement_match_api_unlink.py \
    tests/services/test_settlement_match_service.py \
    tests/services/test_settlement_group_service_regression_edges.py -q
```

- Result: `19 passed` in `0.54s`.

Validated paths covered:

- Normal path: authenticated `PUT` creates `user_confirmed` match and analytics netting changes while raw transaction rows stay signed.
- Failure path: unauthenticated `PUT` returns `401`; deleted participant confirmation returns `422`; persistence conflict path rolls back and returns `409`.
- Integration edge: stale/deleted/noncanonical participants are excluded from confirmed analytics netting and auto-matching.

## Residual risk and follow-up

Priority: low

- If future deployment introduces multiple automated writers sharing the same API key, add DB-enforced allocation invariants or row locking around manual confirmation to remove the remaining same-principal race window.
- Runtime/environment verification still needed outside static review:
  - deployed API-key storage/rotation
  - reverse-proxy exposure of write routes
  - production log redaction policy for request headers and exception payloads

Conclusion:

- The reviewed settlement-group canonical netting write surface satisfies the requested security checks for API-key enforcement, auth bypass, personal-context IDOR, stale/deleted abuse, rollback handling, and secret leakage.
- No reportable security vulnerability was confirmed in the current code state, so this lane passes.
