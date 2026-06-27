# Task 1 Backend Loan Review API Evidence

## Scope

Persistent review state for transaction-backed loan candidates only:

- `candidate_type`: `loan_transaction`
- `candidate_key`: `loan_transaction:{transaction_id}`
- statuses: `pending`, `not_candidate`
- protected endpoint: `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`

No raw transactions, loan links, loan account hidden flags, Docker services, or honcho services were changed.

## Branch And State

- Branch before final claim: `codex/loan-installment-candidate-review-workflows`
- HEAD before final claim: `d2efe02`
- Pre-existing dirty worktree noted before edits: `.omo/boulder.json`, `.omo/plans/index.md`, `.omo/start-work/ledger.jsonl`, untracked `.DS_Store`, untracked `.omo/evidence/*`, and untracked `.omo/plans/loan-installment-candidate-review-workflows.md`.
- Additional pre-existing backend files observed during final status: `backend/app/schemas/installment.py`, `backend/tests/api/test_installments_api.py`, `backend/tests/services/test_installment_service.py`.
- These pre-existing files were left untouched by this task.

## TDD Evidence

Baseline characterization, before production implementation:

```text
Command:
DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py::test_loan_transaction_links_endpoint_lists_expense_candidates_with_link_state

Result:
tests/api/test_loan_mapping_api.py .                                     [100%]
======================== 1 passed, 10 warnings in 0.08s ========================
```

Focused red pass, after adding review endpoint tests and before production implementation:

```text
Command:
DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py -k loan_candidate_review_endpoint

Result:
FAILED tests/api/test_loan_mapping_api.py::test_loan_candidate_review_endpoint_rejects_missing_api_key
FAILED tests/api/test_loan_mapping_api.py::test_loan_candidate_review_endpoint_persists_not_candidate_review
FAILED tests/api/test_loan_mapping_api.py::test_loan_candidate_review_endpoint_restores_pending_review
FAILED tests/api/test_loan_mapping_api.py::test_loan_candidate_review_endpoint_rejects_not_candidate_when_linked
FAILED tests/api/test_loan_mapping_api.py::test_loan_candidate_review_endpoint_rejects_malformed_and_missing_targets
================= 5 failed, 7 deselected, 46 warnings in 0.20s =================
```

Focused green pass after implementation:

```text
Command:
DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py -k loan_candidate_review_endpoint

Result:
tests/api/test_loan_mapping_api.py .....                                 [100%]
================= 5 passed, 7 deselected, 46 warnings in 0.19s =================
```

Requested API/schema suite with explicit local test database URL required by app import in this shell:

```text
Command:
DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py tests/api/test_schema_api.py

Result:
tests/api/test_loan_mapping_api.py ............                          [ 80%]
tests/api/test_schema_api.py ...                                         [100%]
======================= 15 passed, 127 warnings in 0.51s =======================
```

The user-specified command without `DATABASE_URL` was also run exactly from repo root:

```text
Command:
cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py tests/api/test_schema_api.py

Result:
ImportError while loading conftest '/Users/gyurin/dev/my_ledge/backend/tests/conftest.py'.
pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings
DATABASE_URL
  Field required [type=missing, input_value={}, input_type=dict]
```

Ruff:

```text
Command:
cd backend && UV_CACHE_DIR=.uv-cache uv run ruff check .

Result:
All checks passed!
```

## Sanitized Request/Response Summaries

All calls used the pytest ASGI `AsyncClient`; API keys are omitted here.

Missing-key rejection:

```text
PATCH /api/v1/loan-transaction-links/{existing_transaction_id}/review
Body: {"review_status": "not_candidate"}
Status: 401
Meaning: write API-key dependency protects the endpoint.
```

Dismiss:

```text
PATCH /api/v1/loan-transaction-links/{existing_unlinked_transaction_id}/review
Body: {"review_status": "not_candidate", "memo": "[sanitized memo]"}
Status: 200
Response summary:
{
  "candidate_key": "loan_transaction:{transaction_id}",
  "candidate_type": "loan_transaction",
  "transaction_id": "{transaction_id}",
  "review_status": "not_candidate",
  "memo": "[sanitized memo]",
  "reviewed_at": "present"
}
Second identical dismiss: 200, same persisted state shape.
```

Restore:

```text
PATCH /api/v1/loan-transaction-links/{existing_unlinked_transaction_id}/review
Body: {"review_status": "pending"}
Status: 200
Response summary:
{
  "candidate_key": "loan_transaction:{transaction_id}",
  "candidate_type": "loan_transaction",
  "transaction_id": "{transaction_id}",
  "review_status": "pending",
  "memo": null,
  "reviewed_at": "present"
}
Second restore: 200, idempotent pending state.
```

Linked conflict:

```text
PUT /api/v1/transactions/{transaction_id}/loan-link
Status: 200

PATCH /api/v1/loan-transaction-links/{linked_transaction_id}/review
Body: {"review_status": "not_candidate"}
Status: 409
Response: {"detail": "Linked loan transaction cannot be dismissed."}
Meaning: an already loan-linked transaction cannot be dismissed as not_candidate.
```

## Adversarial QA Classes

- malformed_input: invalid `review_status="ignored"` returns 422; nonexistent transaction id with valid payload returns 404.
- dirty_worktree: pre-existing untracked `.omo/evidence` and `.DS_Store` files were observed and left untouched.
- stale_state: branch and HEAD confirmed before final claim as `codex/loan-installment-candidate-review-workflows` at `d2efe02`.
- misleading_success_output: actual pytest result lines are included above.
- flaky_tests: focused new tests passed on rerun after implementation; no timing-sensitive failure observed.
- prompt_injection: not applicable.
- cancel_resume: not applicable.
- long_commands: not applicable.
- repeated_interruptions: not applicable.

## Migration/Table Evidence

New migration:

- `backend/alembic/versions/20260627_0030_add_loan_candidate_reviews.py`
- `down_revision`: `20260627_0029`

Offline Alembic SQL generation for the new migration:

```text
Command:
DATABASE_URL=postgresql://user:pass@localhost:5432/my_ledge UV_CACHE_DIR=.uv-cache uv run alembic upgrade 20260627_0029:20260627_0030 --sql

Result excerpt:
CREATE TABLE loan_candidate_reviews (
    id SERIAL NOT NULL,
    candidate_key VARCHAR(120) NOT NULL,
    candidate_type VARCHAR(50) NOT NULL,
    transaction_id INTEGER NOT NULL,
    review_status VARCHAR(20) NOT NULL,
    memo TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_loan_candidate_reviews PRIMARY KEY (id),
    CONSTRAINT fk_loan_candidate_reviews_transaction_id_transactions FOREIGN KEY(transaction_id) REFERENCES transactions (id),
    CONSTRAINT uq_loan_candidate_reviews_candidate_key UNIQUE (candidate_key),
    CONSTRAINT uq_loan_candidate_reviews_transaction_id UNIQUE (transaction_id)
);
```

Full online Alembic upgrade probes:

- `DATABASE_URL=sqlite+aiosqlite:////private/tmp/my_ledge_task1_loan_candidate_review.db ... alembic upgrade head` failed before migration application with `MissingGreenlet` because this Alembic env uses a synchronous online path.
- `DATABASE_URL=sqlite:////private/tmp/my_ledge_task1_loan_candidate_review_sync.db ... alembic upgrade head` failed before the new revision at older PostgreSQL-specific view SQL (`SUM(amount)::integer`) unsupported by SQLite.
- The schema API test validates `Base.metadata` includes `loan_candidate_reviews`, its transaction foreign key, `memo`, `reviewed_at`, and unique constraints on `candidate_key` and `transaction_id`.

## Cleanup Receipt

- Removed disposable file: `/private/tmp/my_ledge_task1_loan_candidate_review_sync.db`.
- The async SQLite probe file did not exist after the failed connection attempt: `/private/tmp/my_ledge_task1_loan_candidate_review.db`.
- No Docker containers, honcho services, host ports, branches, or user files were stopped, reset, or removed.
