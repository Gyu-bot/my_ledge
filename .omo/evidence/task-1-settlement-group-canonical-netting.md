# Task 1 Settlement Group Canonical Netting

## Scope
- Todo 1 only: settlement match storage, matching service, direct service tests.
- No API/canonical surface integration or docs changes beyond compile-safe model registration/migration.

## Manual QA
### Happy scenario: exact full cancellation auto-confirms and nets to zero
- Command:
  `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py::test_reconcile_settlement_matches_auto_confirms_full_cancellation -q`
- Run 1 result: `1 passed`
- Run 2 result: `1 passed`
- Assertion evidence:
  `groups[0].status == "auto_confirmed"`
  `groups[0].gross_amount == 150_000`
  `groups[0].refund_total == 150_000`
  `groups[0].net_amount == 0`
  `await build_confirmed_refund_netting_map(db_session) == {purchase.id: 150_000}`

### Failure scenario: two possible originals require review
- Command:
  `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py::test_reconcile_settlement_matches_marks_multiple_candidates_for_review -q`
- Result: `1 passed`
- Assertion evidence:
  `groups[0].status == "review_required"`
  `groups[0].original_transaction_id is None`
  `groups[0].candidate_original_transaction_ids == (purchase_one.id, purchase_two.id)`
  persisted match rows contain exactly `["review_required", "review_required"]`

## Automated verification
- `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/services/test_transactions_service.py`
  Result: `30 passed`
- `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py -q`
  Result: `5 passed`
- `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .`
  Result: `All checks passed!`
- `git diff --check`
  Result: no output

## Adversarial QA classes
- malformed_input:
  Service auto-match requires non-empty normalized `payment_method` and `currency`; otherwise candidate list is empty and no auto-confirm row is created. Weird signed amount handling is covered by `test_list_transactions_preserves_raw_signed_amounts_when_refund_exists`, which keeps raw `80_000` and `-180_000`.
- stale_state:
  Happy-path test rerun twice after implementation and the full settlement service file rerun once more. All passes were fresh SQLite DB sessions.
- dirty_worktree:
  `git status --short` preserved pre-existing untracked files:
  `?? .DS_Store`
  `?? .omo/.DS_Store`
  `?? .omo/boulder.json`
  `?? .omo/evidence/`
  `?? .omo/start-work/`
  `?? docs/.DS_Store`
  New Todo 1 files remained scoped under `backend/` plus this evidence file.
- flaky_tests:
  Same happy-path test executed twice with identical `1 passed` result.
- misleading_success_output:
  Checked assertion text, not only exit code. Observed `auto_confirmed/net_amount == 0` and `review_required/original_transaction_id is None`.
- prompt_injection:
  N/A. No external untrusted text was interpreted as instructions.
- cancel_resume:
  N/A. No resumable workflow was introduced.
- hung_long_commands:
  All pytest/ruff/git commands completed within bounded runs; no background process left running.
- repeated_interruptions:
  N/A. No interrupted command required resume logic.

## Cleanup receipt
- No Docker containers, local services, temp DB daemons, or background processes were started.
- Test SQLite databases were created under pytest temp paths and cleaned up by fixture teardown.
- Final working tree check was `git status --short`; only scoped Todo 1 files plus pre-existing untracked files remained.
