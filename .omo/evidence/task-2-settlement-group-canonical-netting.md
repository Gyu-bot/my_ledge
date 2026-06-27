# Task 2 Settlement Group Canonical Netting Evidence

Date: 2026-06-27
Branch: `codex/settlement-group-canonical-netting`
Scope: Todo 2 strict/evidence regate blockers only

## Dirty worktree note

- Left unrelated existing changes untouched: `.omo/plans/settlement-group-canonical-netting.md`, Todo 1 settlement files, `backend/app/models/__init__.py`, `.DS_Store`, existing `.omo/` state files.

## Read-safe analytics: settlement match count stays unchanged on GET

Command:

```bash
cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge \
API_KEY=test-api-key \
uv run pytest \
  tests/services/test_analytics_service.py::test_get_monthly_cashflow_does_not_create_settlement_matches -q
```

Result summary:

- `1 passed, 10 warnings`
- The test asserts `settlement_matches` count is `0` before the analytics read and still `0` after the read.
- This confirms Todo 2 analytics surfaces are read-only and no longer reconcile/write during GET.

## Confirmed-only netting: analytics totals drop only for persisted confirmed matches

Command:

```bash
cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge \
API_KEY=test-api-key \
uv run pytest \
  tests/services/test_analytics_service.py::test_get_monthly_cashflow_uses_confirmed_settlement_net_amount -q
```

Result summary:

- `1 passed, 10 warnings`
- The test persists an `auto_confirmed` settlement match and verifies monthly cashflow collapses the purchase plus refund into one netted January expense row.
- The same test also asserts the stored `settlement_matches` count is unchanged before and after the analytics read.

## Failure path: review-required and rejected settlements stay on raw signed refund basis

Commands:

```bash
cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge \
API_KEY=test-api-key \
uv run pytest \
  tests/services/test_analytics_service.py::test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis \
  tests/api/test_analytics_api.py::test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis -q
```

Result summary:

- `2 passed, 19 warnings`
- `review_required` matches keep the positive-expense refund row on the raw signed basis instead of applying settlement netting.
- Manually `rejected` matches also stay on the raw signed basis in analytics responses.

## Integration edge: raw transactions stay signed and purchase-gate does not double-net

Commands:

```bash
cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge \
API_KEY=test-api-key \
uv run pytest \
  tests/api/test_transactions_api.py::test_list_transactions_preserves_raw_signed_amounts_after_settlement_analysis \
  tests/services/test_settlement_group_service_regression.py::test_list_transactions_preserves_raw_signed_amounts_when_refund_exists \
  tests/api/test_analytics_api.py::test_purchase_gate_candidates_use_net_amount_for_partial_refunds -q
```

Result summary:

- `3 passed, 27 warnings`
- `/transactions` still returns raw signed rows after analytics reads.
- `list_transactions(...)` service regression also keeps the refund row positive and the original purchase negative.
- Purchase-gate candidates use the shared net amount once and surface `refund_netting_refund_total` instead of netting the same refund twice.

## Focused probe batch, rerun twice

Command used for both runs:

```bash
cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge \
API_KEY=test-api-key \
uv run pytest \
  tests/services/test_analytics_service.py::test_get_monthly_cashflow_does_not_create_settlement_matches \
  tests/services/test_analytics_service.py::test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis \
  tests/api/test_analytics_api.py::test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis \
  tests/api/test_transactions_api.py::test_list_transactions_preserves_raw_signed_amounts_after_settlement_analysis \
  tests/api/test_analytics_api.py::test_purchase_gate_candidates_use_net_amount_for_partial_refunds -q
```

Result summary:

- First run: `5 passed, 46 warnings in 0.16s`
- Second run: `5 passed, 46 warnings in 0.16s`
- This covers read-only analytics, `review_required` raw basis, `rejected` raw basis, raw signed transactions, and purchase-gate no-double-net in a bounded repeated run.

## Full verification

Commands:

```bash
cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge \
API_KEY=test-api-key \
uv run pytest \
  tests/services/test_analytics_service.py \
  tests/api/test_analytics_api.py \
  tests/api/test_transactions_api.py \
  tests/services/test_settlement_group_service.py \
  tests/services/test_settlement_group_service_regression.py -q

cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .

cd /Users/gyurin/dev/my_ledge
git diff --check
```

Result summary:

- `78 passed, 704 warnings in 1.80s`
- `ruff check`: `All checks passed!`
- `git diff --check`: no output

## Cleanup receipt

- No Docker containers, local services, ports, browser targets, or background jobs were started.
- No cleanup action was required.
