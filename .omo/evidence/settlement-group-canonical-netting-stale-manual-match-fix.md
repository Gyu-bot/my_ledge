# settlement-group-canonical-netting stale manual match fix

## Scope

- Workflow: settlement-group canonical reconciliation plus settlement-match confirm/reject/unlink write paths.
- Risk addressed: persisted `user_confirmed` manual matches whose original or refund participant later leaves the current canonical reconciliation basis through soft-delete or merge.

## Change summary

- `backend/app/services/settlement_group_service.py`
  - Reconciliation now filters manual `user_confirmed` and `rejected` matches to the current `_load_transactions()` basis before they affect:
    - manual allocation totals
    - rejected-pair suppression
    - manually confirmed refund suppression
    - snapshot construction
- `backend/tests/services/test_settlement_group_service_stale_manual.py`
  - Added reconcile regression for stale manual confirmed matches after participant lifecycle changes.
- `backend/tests/api/test_settlement_match_api_stale_manual.py`
  - Added API confirm/reject regression showing stale manual matches elsewhere do not crash later writes.
- `backend/tests/api/test_settlement_match_api_unlink.py`
  - Added unlink regression showing stale manual matches elsewhere do not crash delete/reconcile.
- `backend/tests/services/test_settlement_group_service_regression.py`
  - Kept existing coverage, moved the new stale-manual case out to keep the file under the 250 pure-LOC cap.
- `backend/tests/api/test_settlement_match_api.py`
  - Kept existing coverage, moved the new stale-manual case out to keep the file under the 250 pure-LOC cap.

## Adversarial classes covered

- stale confirmed match with deleted original participant
- stale confirmed match with deleted refund participant
- stale confirmed match with merged original participant
- stale confirmed match with merged refund participant
- stale confirmed match elsewhere while a later API write is:
  - `user_confirmed`
  - `rejected`
  - `unlink`

## Commands and results

### Red run

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service_regression.py -k stale_manual_confirmed_match tests/api/test_settlement_match_api.py -k stale_manual_match_elsewhere tests/api/test_settlement_match_api_unlink.py -k stale_manual_match_elsewhere -q
```

- Result: `3 failed`
- Failure shape: `KeyError: 2` from `build_snapshots()` through `reconcile_settlement_matches()` on later PUT/DELETE settlement-match writes.

### Focused stale-manual regression after fix

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service_stale_manual.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_settlement_match_api_unlink.py::test_delete_settlement_match_ignores_stale_manual_match_elsewhere -q
```

- Result: `7 passed`

### Requested focused verification

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/api/test_settlement_match_api*.py tests/services/test_settlement_group_service*.py tests/services/test_settlement_match_service.py -q
```

- Result: `26 passed, 235 warnings in 0.66s`

### Requested broader verification

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/api/test_settlement_match_api*.py tests/services/test_settlement_group_service*.py tests/services/test_settlement_match_service.py -q
```

- Result: `95 passed, 857 warnings in 2.32s`
- Warning note: existing pytest-asyncio Python 3.14 deprecation warnings and one pre-existing `HTTP_422_UNPROCESSABLE_ENTITY` deprecation warning in `analytics_service.py`.

### Ruff

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .
```

- Result: `All checks passed!`

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff format --check app/services/settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_stale_manual.py tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_settlement_match_api_unlink.py
```

- Result: `6 files already formatted`

### Diff hygiene

```bash
git diff --check
```

- Result: clean, no output

## Pure LOC

- `backend/app/services/settlement_group_service.py`: 200
- `backend/tests/services/test_settlement_group_service_regression.py`: 193
- `backend/tests/services/test_settlement_group_service_stale_manual.py`: 101
- `backend/tests/api/test_settlement_match_api.py`: 177
- `backend/tests/api/test_settlement_match_api_stale_manual.py`: 109
- `backend/tests/api/test_settlement_match_api_unlink.py`: 200

## Residual risk

- Stale manual rows are still preserved in raw storage. This fix intentionally ignores them during canonical reconciliation instead of mutating or invalidating history.
- No DB constraint or background cleanup was added. Direct DB writes remain out of scope and still rely on service/API discipline.
