# settlement-group-canonical-netting final F2 blocker fix

## Scope

- Fix schema table coverage for `settlement_matches`.
- Fix stale manual allocation capacity in `backend/app/services/settlement_match_service.py`.
- Add regression coverage for same-original stale deleted or merged refund.

## Commands and results

1. Focused repro before fix:
   - Command:
     ```bash
     cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key uv run pytest -q tests/api/test_schema_api.py tests/api/test_settlement_match_api_stale_manual.py tests/services/test_settlement_match_service.py
     ```
   - Result: failed at `tests/api/test_schema_api.py::test_expected_tables_exist` because `settlement_matches` was present in metadata but missing from the expected table set.

2. Focused verification after fix:
   - Command:
     ```bash
     cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key uv run pytest -q tests/api/test_schema_api.py tests/api/test_settlement_match_api_stale_manual.py tests/services/test_settlement_match_service.py
     ```
   - Result: `9 passed`.

3. Settlement suite verification:
   - Command:
     ```bash
     cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/api/test_settlement_match_api*.py tests/services/test_settlement_group_service*.py tests/services/test_settlement_match_service.py -q
     ```
   - Result: `97 passed`.

4. Full backend verification:
   - Command:
     ```bash
     cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key uv run pytest -q
     ```
   - Result: `260 passed`.

5. Lint:
   - Command:
     ```bash
     cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .
     ```
   - Result: `All checks passed!`

6. Format:
   - Command:
     ```bash
     cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff format --check app/services/settlement_match_service.py tests/api/test_schema_api.py tests/api/test_settlement_match_api_stale_manual.py
     ```
   - Result: `3 files already formatted`

7. Diff hygiene:
   - Command:
     ```bash
     git diff --check
     ```
   - Result: no output, pass.

## Stale capacity proof

- Added `test_put_settlement_match_releases_same_original_capacity_from_stale_refund`.
- Scenario:
  - original purchase `-100000`
  - stale refund `+100000` manually confirmed first
  - stale refund then leaves canonical basis via `is_deleted=True` or `merged_into_id=9999`
  - later refund `+100000` for the same original is manually confirmed
- Expected outcome:
  - later confirm returns `200`
  - `matched_amount=100000`
  - stale audit row remains stored, but it no longer consumes allocatable capacity

## Schema proof

- `test_expected_tables_exist` now asserts:
  - `settlement_matches` is present in `Base.metadata.tables`
  - required columns include `original_transaction_id`, `settlement_transaction_id`, `status`, `matched_amount`, `matched_at`
  - both transaction foreign keys exist
  - indexes `idx_settlement_matches_settlement_transaction_id` and `idx_settlement_matches_status` exist
  - unique constraint on `(original_transaction_id, settlement_transaction_id)` exists

## Adversarial classes covered

- stale confirmed refund elsewhere does not block unrelated later confirm
- stale confirmed refund on the same original does not consume capacity after delete
- stale confirmed refund on the same original does not consume capacity after merge
- noncanonical participants are still excluded from confirmed settlement analysis netting
- audit rows for stale manual matches remain stored; only canonical capacity math ignores them

## Cleanup

- No Docker containers started
- No local services changed
- No background jobs left running
