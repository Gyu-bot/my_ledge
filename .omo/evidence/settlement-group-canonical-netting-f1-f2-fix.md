# settlement-group-canonical-netting F1/F2 fix evidence

## Scope

- Added minimal manual settlement write APIs for confirm/reject/unlink.
- Added canonical participant guard so confirmed settlement netting ignores deleted/merged participants.
- Did **not** implement broad budget or forecast features. This fix stays at reusable settlement service and existing analytics surfaces only.

## Dirty worktree context

- Pre-existing in-branch changes were already present in settlement docs/model/service/test files and unrelated repo metadata (`.DS_Store`, `.omo/*`, docs, analytics files).
- This fix stayed scoped to settlement write contract, canonical guard, targeted docs sync, and evidence capture.

## Failing-first evidence

Command:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/api/test_settlement_match_api.py tests/services/test_settlement_match_service.py tests/services/test_settlement_group_service_regression.py -q
```

Initial result:

- failed during collection with `ModuleNotFoundError: No module named 'app.schemas.settlement'`
- this confirmed the settlement write contract was missing before implementation

## User correction / unlink API proof

Added routes:

- `PUT /api/v1/transactions/{id}/settlement-match`
- `DELETE /api/v1/transactions/{id}/settlement-match?original_transaction_id=...`

Behavior proven by tests:

- `test_put_settlement_match_requires_api_key_and_preserves_raw_signed_transactions`
  - `401` without `X-API-Key`
  - `200` with `status=user_confirmed`
  - analytics netting applied
  - raw `/api/v1/transactions` rows kept original signed amounts
- `test_put_settlement_match_rejects_pair_and_keeps_analytics_on_raw_basis`
  - `200` with `status=rejected`
  - analytics remained raw signed basis
- `test_delete_settlement_match_removes_manual_override_and_restores_review_required_candidates`
  - `204` delete of manual override
  - review-required candidates restored after reconcile
- `test_delete_manual_settlement_match_restores_auto_confirmed_match_after_reject_marker_removed`
  - service-level proof that removing a reject marker re-enables auto-confirmed netting

## Deleted / merged participant guard proof

Guard behavior:

- confirmed netting now joins `settlement_matches` back to live `transactions`
- confirmed netting only applies when both original/refund participants remain canonical analytics rows:
  - `type='지출'`
  - original amount negative
  - refund amount positive
  - `is_deleted=false`
  - `merged_into_id is null`

Tests:

- `test_build_confirmed_settlement_analysis_netting_ignores_noncanonical_participants`
  - covers deleted original
  - covers deleted refund
  - covers merged original
  - covers merged refund
- `test_put_settlement_match_rejects_deleted_participant_confirmation`
  - confirms user-facing `422` on invalid manual confirmation

## Verification commands

Focused settlement suite:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/api/test_settlement_match_api.py tests/services/test_settlement_match_service.py tests/services/test_settlement_group_service_regression.py -q
```

Result:

- `13 passed`

Requested broader backend suite plus new files:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/api/test_settlement_match_api.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_match_service.py -q
```

Result:

- `88 passed`
- only existing pytest-asyncio/Python 3.14 deprecation warnings observed

Lint:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .
```

Result:

- `All checks passed!`

Diff hygiene:

```bash
git diff --check
```

Result:

- no whitespace or conflict-marker issues

## Adversarial checks

- `stale_state`: delete/unlink tests prove reconcile refreshes computed settlement rows after manual override changes.
- `dirty_worktree`: pre-existing branch changes were left intact; no reset/revert used.
- `malformed_input`: API validation rejects deleted-participant confirmation with `422`.
- `misleading_success_output`: API tests assert both HTTP status and persisted settlement row outcomes.
- `long_commands`: verification commands recorded exactly and run as-is.
- `flaky_rerun_if_cheap`: focused suite rerun after implementation; broad suite run once after green focus.
- `prompt_injection`: N/A
- `cancel_resume`: N/A
- `repeated_interruptions`: N/A

## Cleanup

- No Docker containers started.
- No honcho services touched.
- No background jobs left running.
