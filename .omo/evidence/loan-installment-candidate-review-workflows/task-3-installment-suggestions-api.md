# Task 3 - Installment Suggestions API Evidence

## Scope

Implemented read-only `GET /api/v1/installment-transaction-suggestions` for active installment plans only.

Changed code paths:
- `backend/app/api/v1/endpoints/installments.py`
- `backend/app/schemas/installment.py`
- `backend/app/services/installment_suggestion_service.py`
- `backend/app/services/installment_suggestion_types.py`
- `backend/tests/services/test_installment_service.py`
- `backend/tests/services/test_installment_suggestion_service.py`
- `backend/tests/api/test_installment_suggestions_api.py`

## Red/Green Record

Red run, missing environment prerequisite:

```text
Invocation: DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_installment_service.py tests/api/test_installments_api.py
Result: failed during collection before implementation
Error: ModuleNotFoundError: No module named 'app.services.installment_suggestion_service'
```

Exact user-specified command, without extra env:

```text
Invocation: cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_installment_service.py tests/api/test_installments_api.py
Result: failed before collection because DATABASE_URL is required by Settings.
Observed line: E   pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings
Observed line: E   DATABASE_URL
Observed line: E     Field required [type=missing, input_value={}, input_type=dict]
```

Required target files with documented backend test env:

```text
Invocation: cd backend && DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_installment_service.py tests/api/test_installments_api.py
Result lines:
collected 7 items
tests/services/test_installment_service.py ..                            [ 28%]
tests/api/test_installments_api.py .....                                 [100%]
======================== 7 passed, 64 warnings in 0.24s ========================
```

Expanded focused suite including the new split suggestion tests:

```text
Invocation: cd backend && DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_installment_service.py tests/services/test_installment_suggestion_service.py tests/api/test_installments_api.py tests/api/test_installment_suggestions_api.py
Result lines:
collected 12 items
tests/services/test_installment_service.py ..                            [ 16%]
tests/services/test_installment_suggestion_service.py ..                 [ 33%]
tests/api/test_installments_api.py .....                                 [ 75%]
tests/api/test_installment_suggestions_api.py ...                        [100%]
======================= 12 passed, 109 warnings in 0.35s =======================
```

Ruff:

```text
Invocation: cd backend && UV_CACHE_DIR=.uv-cache uv run ruff check .
Result: All checks passed!
```

## Focused Test Nodes

Service:
- `tests/services/test_installment_service.py::test_list_installment_transaction_mappings_keeps_manual_link_semantics`
- `tests/services/test_installment_suggestion_service.py::test_installment_suggestions_score_month_progression_and_conflict`
- `tests/services/test_installment_suggestion_service.py::test_installment_suggestions_exclude_unusable_outliers`

API:
- `tests/api/test_installment_suggestions_api.py::test_installment_suggestions_return_read_only_candidates`
- `tests/api/test_installment_suggestions_api.py::test_installment_suggestions_expose_conflicts_without_linked_duplicates`
- `tests/api/test_installment_suggestions_api.py::test_installment_suggestions_reject_malformed_inputs`

## API Client Probe

Invocation: isolated ASGI `AsyncClient` probe with temp SQLite database, no live Docker/services, no user data.

Sanitized response excerpt:

```json
{
  "suggestions_status": 200,
  "total": 3,
  "suggested_numbers": [1, 2, 3],
  "excerpt": [
    {
      "transaction_description": "애플 결제 1",
      "suggested_installment_number": 1,
      "expected_billing_date": "2026-05-10",
      "amount_delta": 500,
      "billing_day_delta": 0,
      "confidence": "high",
      "reason_labels": ["same_merchant", "similar_amount", "same_billing_day", "same_payment_method"],
      "is_usable": true,
      "conflict_reason": null
    },
    {
      "transaction_description": "애플 결제 2",
      "suggested_installment_number": 2,
      "expected_billing_date": "2026-06-10",
      "amount_delta": 200,
      "billing_day_delta": 0,
      "confidence": "high",
      "reason_labels": ["same_merchant", "similar_amount", "same_billing_day", "same_payment_method"],
      "is_usable": true,
      "conflict_reason": null
    },
    {
      "transaction_description": "애플 결제 3",
      "suggested_installment_number": 3,
      "expected_billing_date": "2026-07-10",
      "amount_delta": 0,
      "billing_day_delta": 2,
      "confidence": "medium",
      "reason_labels": ["same_merchant", "similar_amount", "near_billing_day", "same_amount", "same_payment_method"],
      "is_usable": true,
      "conflict_reason": null
    }
  ],
  "linked_total_after_read_only_get": 0,
  "conflict_excerpt": [
    {
      "transaction_description": "애플 결제 2",
      "suggested_installment_number": 2,
      "is_usable": false,
      "conflict_reason": "installment_number_already_linked"
    }
  ],
  "invalid_plan_status": 404,
  "invalid_page_status": 422
}
```

## Adversarial QA Classes

- malformed_input: invalid `installment_plan_id` returns 404; invalid `page=0` and `per_page=201` return 422; amount/date/merchant/out-of-range outliers are excluded by service tests.
- dirty_worktree: pre-existing `.omo/evidence/*`, `.DS_Store`, OMO state files, and loan-candidate task files were observed and left untouched.
- stale_state: final checked branch `codex/loan-installment-candidate-review-workflows`, HEAD `d2efe02e81bfb5ad145ff2f6b39da842a6fea6c6`.
- misleading_success_output: actual pytest result lines are recorded above, including the exact command env failure and passing result lines.
- flaky_tests: one service fixture issue was fixed and the full focused suite was rerun green; no ordering dependency observed.
- prompt_injection: not applicable; no prompt/LLM input path.
- cancel_resume: not applicable; no resumable flow introduced.
- long_commands: pytest/ruff completed quickly; no long-running service command.
- repeated_interruptions: not applicable.

## Cleanup Receipt

- No Docker containers started or stopped.
- No local services, host ports, honcho services, browser sessions, or network settings changed.
- Manual QA used a temporary SQLite database under Python `tempfile`; the engine was disposed and the temporary directory was removed by the probe.
- No raw API keys, cookies, secrets, or private user data were written to this artifact.
