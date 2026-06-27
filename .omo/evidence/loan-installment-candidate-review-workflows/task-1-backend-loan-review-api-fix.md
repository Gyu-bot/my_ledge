# Task 1 Backend Loan Review API Fix Evidence

## Scope

Gate review found `linked_invariant_bypass`: a transaction could be marked
`not_candidate`, then linked through the existing loan-link API while its
`loan_candidate_reviews.review_status` stayed `not_candidate`.

Changed only task 1 loan candidate review behavior:

- `backend/app/services/loan_mapping_service.py`
- `backend/tests/api/test_loan_mapping_api.py`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-1-backend-loan-review-api-fix.md`

No plan checkboxes, `.omo/boulder.json`, `.omo/start-work/ledger.jsonl`, Docker
containers, honcho services, host ports, or branch refs were changed by this fix.

## Chosen Semantics

Dismiss-before-link now preserves the existing loan-link API's success behavior.
When a manual loan link succeeds for a transaction with a stale
`review_status='not_candidate'`, the link operation atomically restores that
review to `pending`, clears the dismiss memo, and then commits the link.

Reason: the existing link endpoint already means "this transaction is a loan
link"; rejecting it would force a user to discover and manually restore hidden
review state before completing the explicit link action.

Linked-before-dismiss is unchanged: attempting to set `not_candidate` on an
already linked transaction returns the existing API conflict style:

```text
HTTP 409
{"detail": "Linked loan transaction cannot be dismissed."}
```

The same stale-review restoration is applied to the bulk loan-link API so bulk
linking cannot leave stale `not_candidate` reviews either.

## Failing Test Added

Added `test_transaction_loan_link_endpoint_restores_dismissed_review_to_pending`
in `backend/tests/api/test_loan_mapping_api.py`.

Scenario:

1. Create an unlinked loan-like transaction and loan account.
2. `PATCH /api/v1/loan-transaction-links/{transaction_id}/review` with
   `{"review_status":"not_candidate","memo":"대출 후보 제외"}`.
3. `PUT /api/v1/transactions/{transaction_id}/loan-link` with a valid account.
4. Assert the link succeeds and the persisted review row is now:
   `review_status='pending'`, `memo IS NULL`.

Red run before implementation:

```text
Command:
DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py::test_transaction_loan_link_endpoint_restores_dismissed_review_to_pending

Result:
tests/api/test_loan_mapping_api.py F                                     [100%]
E       AssertionError: assert 'not_candidate' == 'pending'
======================== 1 failed, 10 warnings in 0.10s ========================
```

Green run after implementation:

```text
Command:
DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py::test_transaction_loan_link_endpoint_restores_dismissed_review_to_pending

Result:
tests/api/test_loan_mapping_api.py .                                     [100%]
======================== 1 passed, 10 warnings in 0.05s ========================
```

## Requested Verification

API/schema suite:

```text
Command:
DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/api/test_loan_mapping_api.py tests/api/test_schema_api.py

Result:
tests/api/test_loan_mapping_api.py .............                         [ 81%]
tests/api/test_schema_api.py ...                                         [100%]
======================= 16 passed, 136 warnings in 0.48s =======================
```

Ruff:

```text
Command:
UV_CACHE_DIR=.uv-cache uv run ruff check .

Result:
All checks passed!
```

Diff whitespace:

```text
Command:
git diff --check

Result:
exit 0, no output
```

## Adversarial QA

- stale_state, linked-before-dismiss: covered by
  `test_loan_candidate_review_endpoint_rejects_not_candidate_when_linked`;
  observable is HTTP 409 with `Linked loan transaction cannot be dismissed.`
- stale_state, dismiss-before-link: covered by the new red/green test above;
  observable is persisted review restored to `pending` with `memo IS NULL`
  after successful existing loan-link API call.
- dirty_worktree, linked-before-dismiss: current worktree already contained
  unrelated `.omo`, installment suggestion, and task 1 baseline changes before
  this fix; this fix did not revert or overwrite them.
- dirty_worktree, dismiss-before-link: the implementation touched only
  `loan_mapping_service.py`; the new assertion was added only to
  `test_loan_mapping_api.py`.
- misleading_success_output, linked-before-dismiss: full requested pytest suite
  line shows 16 collected/passed tests, including the pre-existing 409 test.
- misleading_success_output, dismiss-before-link: focused red failure and green
  pass are recorded with the exact assertion/result lines above.
- malformed_input, linked-before-dismiss: existing
  `test_loan_candidate_review_endpoint_rejects_malformed_and_missing_targets`
  keeps invalid `review_status="ignored"` at HTTP 422 and missing target at
  HTTP 404.
- malformed_input, dismiss-before-link: not applicable beyond existing link API
  validators because this fix does not add new link input fields or payload
  shapes; the new path reuses the existing successful link API contract.

## Cleanup Receipt

- No Docker, honcho, network, port, browser, or local service state was changed.
- No temporary database file remained at `backend/test.db` after verification.
- No generated logs, screenshots, caches, or debug files were created for this
  fix.
- `git diff --check` passed after code changes and again after this evidence
  file was added.

## Risks

- The service file and API test file were already larger than the current
  no-excuse 250 pure-LOC guideline before this task. LOC measured after the
  fix: `loan_mapping_service.py` 1002 pure LOC, `test_loan_mapping_api.py` 515
  pure LOC. Refactoring them would exceed the requested narrow fix scope.
- Existing branch state contains unrelated uncommitted `.omo`, installment
  suggestion, and schema/API changes. This evidence reports only the task 1
  invariant fix.
