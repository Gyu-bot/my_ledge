# Task 1 Settlement Group Canonical Netting Code Review

## Review Surface

- `backend/app/services/settlement_group_service.py`
- `backend/tests/services/test_settlement_group_service.py`
- `backend/tests/services/test_settlement_group_service_regression.py`

## Primary Risk Reviewed

- Settlement auto-matching could double-count or falsely net stale ledger evidence if non-active lifecycle rows were still eligible for computed matches.
- Confirmed evidence: the pre-fix red tests showed `superseded` purchase rows and `missing_from_latest_export` refund rows were each auto-confirmed into netting.

## Smallest Safe Change

- Keep the full transaction load for snapshot/manual-match integrity.
- Narrow only the auto-match candidate set to rows whose `source_lifecycle_status` is `active` or `null`.
- Keep malformed payment method/currency behavior conservative: no candidate set, no computed match rows.

## Programming / No-Slop Checks

- No `Any`, `cast`, `type: ignore`, or broad exception handling added.
- No raw SQL added; existing async SQLAlchemy service patterns remain intact.
- Test additions are behavior-based and assert observable outcomes instead of internal helper details.
- Oversized test module defect was addressed by splitting non-gate regressions into `test_settlement_group_service_regression.py` so the gate-focused file stayed below the 250 pure LOC threshold.

## Pure LOC

Measured with:

```bash
awk '!/^[[:space:]]*$/ && !/^[[:space:]]*#/' <file> | wc -l
```

- `backend/app/services/settlement_group_service.py`: `144`
- `backend/tests/services/test_settlement_group_service.py`: `246`
- `backend/tests/services/test_settlement_group_service_regression.py`: `174`

## Overfit Review

- The lifecycle-safe gate is limited to computed auto-matching; it does not rewrite raw rows, mutate transaction signs, or broaden Todo 1 into analytics/API scope.
- The fix is not keyed to only one blocked status. Tests cover two distinct non-active statuses (`superseded`, `missing_from_latest_export`) and two malformed input shapes (blank payment method, blank currency), which reduces overfitting to a single constant or single field.
- The implementation preserves manual match history by not replacing the transaction snapshot source with a filtered query.

## Exact Verification

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

## Residual Risk

- `null` lifecycle allowance is intentionally conservative for backfill compatibility, but the current ORM model defaults new rows to `active`; if the repo later forbids `null` data entirely, this allowance can be tightened without changing the test-locked non-active exclusions.
- The broader Todo 2 analytics/API integration still needs its own review because this fix only protects computed settlement matching at Todo 1.
