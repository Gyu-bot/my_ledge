# Task 2 Settlement Group Canonical Netting Code Review

Date: 2026-06-27
Scope: strict/no-slop/evidence regate blockers for Todo 2 only

## Review surface

- `backend/app/services/analytics_service.py`
- `.omo/evidence/task-2-settlement-group-canonical-netting.md`
- `.omo/evidence/task-2-settlement-group-canonical-netting-code-review.md`

## Primary defect and evidence

- Regate blocker 1 was valid: `backend/app/services/analytics_service.py` still used banned `object` annotations on the analytics row boundary and purchase-gate scratch structures.
- Regate blocker 2 was valid: the prior code-review artifact claimed `backend/tests/api/test_transactions_api.py` was below threshold, but the current pure LOC measurement is `764`.
- Regate blocker 3 was valid: the prior behavior evidence still reported the old `69 passed` suite result and stale completion framing.

## Smallest safe change

- Replaced `AnalyticsRow = Mapping[str, object]` with an explicit `TypedDict` that names the analytics row fields used in Todo 2 paths.
- Added an explicit `RowMapping -> AnalyticsRow` parse step in `_load_analytics_transactions(...)` so the SQLAlchemy boundary is typed once before settlement netting logic runs.
- Replaced purchase-gate `dict[str, object]` scratch types with `TypedDict` plus a narrow `PurchaseCandidateSignalValue` union.
- Removed the old `tuple[Select, object]` helper shape by building the query inline inside `_load_analytics_transactions(...)`.
- Refreshed both evidence artifacts from current test runs only; no stale pass counts or old completion wording remain.

## Strict checker findings and fix

Repo strict checker availability:

- `backend/pyproject.toml` declares `ruff` but no repo-local `basedpyright` or pyright command.
- Per requested fallback, strict verification used a local no-object grep on the changed Python file.

Exact local strict check:

```bash
cd /Users/gyurin/dev/my_ledge
rg -n "\bobject\b|Mapping\[str, object\]|dict\[str, object\]|tuple\[Select, object\]" backend/app/services/analytics_service.py
```

Result:

- no output
- Conclusion: no `object` annotations remain in the changed Python file.

Programming/no-slop notes:

- No `Any`, `cast`, or `type: ignore` were introduced.
- The analytics read path still stays read-only; the type fix did not reintroduce reconciliation writes.
- Inherited broad `except Exception` and oversized-module debt remain outside this scoped gate fix and are recorded as inherited debt, not silently waived.

## Pure LOC measurement

Command:

```bash
cd /Users/gyurin/dev/my_ledge
for file in \
  backend/app/services/analytics_service.py \
  backend/tests/services/test_analytics_service.py \
  backend/tests/api/test_analytics_api.py \
  backend/tests/api/test_transactions_api.py \
  backend/tests/services/test_settlement_group_service.py \
  backend/tests/services/test_settlement_group_service_regression.py
do
  printf '%s ' "$file"
  awk '!/^[[:space:]]*$/ && !/^[[:space:]]*#/' "$file" | wc -l
done
```

Measured pure LOC:

- `backend/app/services/analytics_service.py`: `1360`
- `backend/tests/services/test_analytics_service.py`: `1924`
- `backend/tests/api/test_analytics_api.py`: `1729`
- `backend/tests/api/test_transactions_api.py`: `764`
- `backend/tests/services/test_settlement_group_service.py`: `246`
- `backend/tests/services/test_settlement_group_service_regression.py`: `174`

Assessment:

- `backend/app/services/analytics_service.py`, `backend/tests/services/test_analytics_service.py`, `backend/tests/api/test_analytics_api.py`, and `backend/tests/api/test_transactions_api.py` are inherited oversized files.
- This task did not claim those files are below threshold.
- `backend/tests/services/test_settlement_group_service.py` and `backend/tests/services/test_settlement_group_service_regression.py` are below the 250 pure LOC ceiling.

## Behavior regression review

- Normal path: `auto_confirmed` settlement matches lower analytics totals only after a persisted confirmed match exists.
- Failure path: `review_required` and `rejected` settlements preserve raw positive-expense refund basis.
- Integration edge: `/transactions` stays raw signed after analytics reads, and purchase-gate consumes the shared net amount once without double-netting.

## Exact verification

Focused repeated probe:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py::test_get_monthly_cashflow_does_not_create_settlement_matches tests/services/test_analytics_service.py::test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis tests/api/test_analytics_api.py::test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis tests/api/test_transactions_api.py::test_list_transactions_preserves_raw_signed_amounts_after_settlement_analysis tests/api/test_analytics_api.py::test_purchase_gate_candidates_use_net_amount_for_partial_refunds -q
```

- First run: `5 passed, 46 warnings in 0.16s`
- Second run: `5 passed, 46 warnings in 0.16s`

Full suite:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py -q
```

- Result: `78 passed, 704 warnings in 1.80s`

Lint and diff:

```bash
cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .
git diff --check
```

- `ruff check`: `All checks passed!`
- `git diff --check`: no output

## Residual risk

- The oversized analytics service and analytics test modules remain inherited debt. This turn intentionally did not refactor them because the user scoped the task to Todo 2 strict/evidence blockers only.
- Existing pytest-asyncio Python 3.14 deprecation warnings and the deprecated FastAPI 422 status-code warning remain in the suite and were not part of this blocker fix.
