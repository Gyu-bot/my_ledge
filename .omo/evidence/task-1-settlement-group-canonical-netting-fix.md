# Task 1 Settlement Group Canonical Netting Fix

## Scope

- Branch observed: `codex/settlement-group-canonical-netting`
- Todo targeted: `.omo/plans/settlement-group-canonical-netting.md` Todo 1 gate fix only
- Files changed for this fix:
  - `backend/app/services/settlement_group_service.py`
  - `backend/tests/services/test_settlement_group_service.py`
  - `backend/tests/services/test_settlement_group_service_regression.py`

## Defect And Smallest Safe Fix

- Defect: `reconcile_settlement_matches()` loaded all non-deleted/non-merged expense rows into auto-matching, so non-active `source_lifecycle_status` rows such as `missing_from_latest_export` and `superseded` could still be auto-confirmed.
- Safety rule applied: auto-matching now considers only transactions whose lifecycle is `active` or `null` (legacy/backfill-safe allowance). Full transaction loading remains unchanged so existing manual match snapshots are not silently broken by a narrower query surface.
- Tradeoff: stale lifecycle rows no longer generate auto-confirmed or review-required computed matches. They remain visible to any manual/history surfaces that load the full transaction set.

## Red To Green Evidence

### Red

Command:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py -q
```

Observed before the fix:

- `test_reconcile_settlement_matches_excludes_non_active_purchase_candidates` failed because a `superseded` purchase still produced one `auto_confirmed` settlement snapshot.
- `test_reconcile_settlement_matches_excludes_non_active_refund_candidates` failed because a `missing_from_latest_export` refund still produced one `auto_confirmed` settlement snapshot.

### Green

Commands and results after the fix:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py -q
```

- Result: `6 passed`

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service_regression.py -q
```

- Result: `3 passed`

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py -q
```

- Result: `9 passed`

## Required Verification

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/services/test_transactions_service.py
```

- Result: `30 passed`

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .
```

- Result: `All checks passed!`

```bash
git diff --check
```

- Result: no output

## Adversarial / Manual QA Record

- `happy`: `test_reconcile_settlement_matches_auto_confirms_full_cancellation`
  - Proves an active purchase and active refund still produce `status == "auto_confirmed"`, `refund_total == 150_000`, `net_amount == 0`, and `build_confirmed_refund_netting_map(...) == {purchase.id: 150_000}`.
- `failure`: `test_reconcile_settlement_matches_excludes_non_active_purchase_candidates`
  - Proves a `superseded` purchase is excluded from auto-matching because `groups == []` and `stored_matches == []`.
- `failure`: `test_reconcile_settlement_matches_excludes_non_active_refund_candidates`
  - Proves a `missing_from_latest_export` refund is excluded from auto-matching because `groups == []` and `stored_matches == []`.
- `malformed input`: `test_reconcile_settlement_matches_keeps_malformed_payment_method_review_safe`
  - Proves blank payment method input never auto-confirms because `groups == []` and `stored_matches == []`.
- `malformed input`: `test_reconcile_settlement_matches_keeps_blank_currency_review_safe`
  - Proves blank currency input never auto-confirms because `groups == []` and `stored_matches == []`.
- `stale_state`: reran the exact settlement suite after the fix on the live branch and reran the combined settlement suites after the test-file split refactor.
- `flaky_tests`: reran the focused safety subset with

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py -q -k "non_active or malformed or blank_currency"
```

  - Result: `4 passed, 5 deselected`
- `misleading_success_output`: success is tied to named assertions on `status`, `refund_total`, `net_amount`, `groups == []`, and `stored_matches == []`, not to log text or command exit alone.
- `dirty_worktree`: existing unrelated entries remained untouched, including `.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`, pre-existing untracked settlement files, and the already-modified `backend/app/models/__init__.py`.
- `long_commands`: all commands were bounded single invocations; no Docker, no background jobs, no unbounded loops.
- `prompt_injection/cancel_resume/repeated_interruptions`: N/A. This fix stayed inside local Python service/test codepaths and did not consume external promptable content or resume a partially persisted workflow.

## Cleanup

- No Docker/services/background processes were started.
- No temporary files were created beyond the requested evidence artifacts.
