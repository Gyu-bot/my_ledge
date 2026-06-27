# Task 2 Settlement Group Canonical Netting Fix

## Scope

- Branch observed: `codex/settlement-group-canonical-netting`
- Todo targeted: `.omo/plans/settlement-group-canonical-netting.md` Todo 2 gate-blocker fix only
- Files changed for this fix:
  - `backend/app/services/analytics_service.py`
  - `backend/app/services/settlement_group_service.py`
  - `backend/tests/services/test_analytics_service.py`
  - `backend/tests/api/test_analytics_api.py`
  - `backend/tests/api/test_transactions_api.py`
  - `.omo/evidence/task-2-settlement-group-canonical-netting-code-review.md`
  - `.omo/evidence/task-2-settlement-group-canonical-netting-fix.md`

## Defect And Smallest Safe Fix

- Defect 1: analytics reads called settlement reconciliation and mutated `settlement_matches` during GET/read flows.
- Defect 2: `review_required` and `rejected` refunds were excluded from analytics totals as if settlement economics were already confirmed, which overstated spend against the existing raw positive-expense refund semantics.
- Safety rule applied:
  - analytics now reads only persisted `auto_confirmed` and `user_confirmed` matches through `build_confirmed_settlement_analysis_netting(...)`
  - reconciliation remains explicit write/maintenance behavior only
  - ambiguous or rejected refunds stay on the raw signed basis until a confirmed settlement row exists

## Red To Green Evidence

### Red

Command:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py -k 'does_not_create_settlement_matches or keeps_review_required_refund_on_raw_basis or keeps_rejected_settlement_on_raw_basis or uses_confirmed_settlement_net_amount' -q
```

Observed before the fix:

- `test_get_monthly_cashflow_does_not_create_settlement_matches` failed with `0 -> 1` `settlement_matches` row count after an analytics read.
- `test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis` failed because monthly expense stayed `2000` instead of raw-basis `1800`.
- `test_get_category_mom_keeps_rejected_settlement_on_raw_basis` failed because category spend stayed `300` instead of raw-basis `200`.

### Green

Focused rerun commands and results after the fix:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py::test_get_monthly_cashflow_does_not_create_settlement_matches tests/services/test_analytics_service.py::test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis tests/api/test_analytics_api.py::test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis tests/api/test_transactions_api.py::test_list_transactions_preserves_raw_signed_amounts_after_settlement_analysis tests/api/test_analytics_api.py::test_purchase_gate_candidates_use_net_amount_for_partial_refunds -q
```

- Result: `5 passed, 46 warnings`

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py::test_get_monthly_cashflow_does_not_create_settlement_matches tests/services/test_analytics_service.py::test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis tests/api/test_analytics_api.py::test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis tests/api/test_transactions_api.py::test_list_transactions_preserves_raw_signed_amounts_after_settlement_analysis tests/api/test_analytics_api.py::test_purchase_gate_candidates_use_net_amount_for_partial_refunds -q
```

- Result: `5 passed, 46 warnings` on the second rerun

## Manual QA / Adversarial Record

- `happy`: confirmed match lowers analytics total without read-path writes
  - `backend/tests/services/test_analytics_service.py::test_get_monthly_cashflow_uses_confirmed_settlement_net_amount`
  - `backend/tests/api/test_analytics_api.py::test_monthly_cashflow_endpoint_keeps_confirmed_settlement_read_only`
  - Observed: January expense is netted from `180_000` to `100_000` or `600` to `500` as expected, while `settlement_matches` count stays unchanged before/after the analytics read.

- `failure`: review-required ambiguous refund keeps raw positive-expense basis
  - `backend/tests/services/test_analytics_service.py::test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis`
  - Observed: two `-1_000` purchases plus one `+200` refund remain monthly expense `1800`; persisted `review_required` rows are not reinterpreted by the read path.

- `failure`: rejected refund keeps raw basis
  - `backend/tests/api/test_analytics_api.py::test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis`
  - Observed: March category spend is `200`, not `300`.

- `failure`: raw transactions remain signed
  - `backend/tests/api/test_transactions_api.py::test_list_transactions_preserves_raw_signed_amounts_after_settlement_analysis`
  - Observed: `/transactions` still returns `[80_000, -180_000]` after analytics runs.

- `no double-net`: purchase-gate uses the shared confirmed net amount once
  - `backend/tests/api/test_analytics_api.py::test_purchase_gate_candidates_use_net_amount_for_partial_refunds`
  - Observed: candidate amount is `100_000` and `signals.refund_netting_refund_total == 80_000`.

- `read-only probe`: zero confirmed matches stay zero across analytics reads
  - `backend/tests/services/test_analytics_service.py::test_get_monthly_cashflow_does_not_create_settlement_matches`
  - Observed: `settlement_matches` row count remains `0 -> 0`.

- `stale_state`
  - Mitigated by rerunning the focused gate tests twice and rerunning the full requested backend bundle after the final patch set.

- `dirty_worktree`
  - Existing unrelated files remained untouched, including `.omo/plans/settlement-group-canonical-netting.md`, `backend/app/models/__init__.py`, `.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`, and prior settlement Todo 1 files.

- `malformed/unconfirmed statuses`
  - Covered by leaving `review_required` and `rejected` on raw basis while confirmed statuses still net through persisted `SettlementMatch` rows only.

- `flaky rerun`
  - Focused gate suite passed twice with identical `5 passed` results.

- `misleading_success_output`
  - Verification is assertion-driven on row counts and response payloads, not on logs or informal summaries.

- `long_commands`
  - All commands were bounded single foreground invocations; no Docker, background jobs, or long-running services were started.

- `prompt_injection`
  - N/A. This task used only local code/tests and no external promptable content.

- `cancel_resume`
  - N/A. No paused workflow or partial resume state was involved.

- `repeated_interruptions`
  - N/A. The fix executed in one uninterrupted local pass.

## Required Verification

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py -q
```

- Result: `78 passed, 704 warnings`

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .
```

- Result: `All checks passed!`

```bash
git diff --check
```

- Result: no output

## Cleanup

- No Docker/services/background processes were started.
- No honcho ports were touched, so no cleanup action was required.
